/**
 * OpenAI-compatible Provider
 * OpenAI, Azure, Groq, DeepSeek, Mistral, Together, xAI, Fireworks,
 * Perplexity, Cerebras, SambaNova 등 /chat/completions 엔드포인트
 */

import { AdminModelConfig, AdminModelMessagePart, SendOptions, ChunkCallback } from '../AdminModelTypes';
import { ILLMProvider } from './ILLMProvider';
import { buildRequest, assertResponseField } from './providerUtils';

export class OpenAICompatProvider implements ILLMProvider {
    constructor(private config: AdminModelConfig) { }

    async send(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        const messages: Array<{ role: string; content: string }> = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        if (typeof messageOrParts === 'string') {
            messages.push({ role: 'user', content: messageOrParts });
        } else {
            const userContent = messageOrParts.map(part => part.text || '').join('\n');
            messages.push({ role: 'user', content: userContent });
        }

        const requestBody: Record<string, unknown> = {
            model: this.config.model,
            messages,
            temperature: this.config.defaultTemperature ?? 0.7,
            top_p: this.config.topP ?? 0.9,
            stream: false,
            max_tokens: this.config.maxOutputTokens || this.config.maxTokens || 16384,
        };

        const isGeminiCompat = (this.config.endpoint || '').includes('generativelanguage.googleapis.com');
        if (isGeminiCompat) {
            // Gemini OpenAI-compat: reasoning_effort 사용 (top-level thinking_config/google 키는 미지원)
            if (!options?.disableThinking) {
                requestBody.reasoning_effort = options?.thinkingLevel || 'medium';
            }
        } else if (options?.disableThinking) {
            requestBody.think = false;
            console.log('[OpenAICompatProvider] Thinking disabled (tool calling mode)');
        }

        if (options?.nativeTools && options.nativeTools.length > 0) {
            requestBody.tools = options.nativeTools;
            requestBody.tool_choice = 'auto';
        }

        const { url, headers } = buildRequest(this.config, this.config.endpoint);
        console.log(`[OpenAICompatProvider] model=${this.config.model} streaming=false nativeTools=${!!options?.nativeTools} geminiCompat=${isGeminiCompat} thinking=${isGeminiCompat && !options?.disableThinking}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(requestBody), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Admin Model API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: any = await response.json();
        assertResponseField(data, 'choices');

        if (!data.choices || data.choices.length === 0) {
            throw new Error('Invalid response from Admin Model API: no choices');
        }

        const toolCalls = data.choices[0]?.message?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
            console.log('[OpenAICompatProvider] Native tool_calls received, count:', toolCalls.length);
            return toolCalls.map((tc: any) => {
                const fn = tc.function;
                const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {});
                return JSON.stringify({ tool: fn.name, ...args });
            }).join('\n');
        }

        const content = data.choices[0]?.message?.content || '';
        const finishReason = data.choices[0]?.finish_reason;
        return finishReason === 'length' ? content + '\n[MAX_TOKENS_REACHED]' : content;
    }

    async stream(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: ChunkCallback,
        options?: SendOptions
    ): Promise<string> {
        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userParts.map(p => p.text || '').join('\n') });

        const requestBody: Record<string, unknown> = {
            model: this.config.model,
            messages,
            temperature: this.config.defaultTemperature ?? 0.7,
            top_p: this.config.topP ?? 0.9,
            stream: true,
            max_tokens: this.config.maxOutputTokens || this.config.maxTokens || 16384,
        };

        const isGeminiCompat = (this.config.endpoint || '').includes('generativelanguage.googleapis.com');
        if (isGeminiCompat) {
            if (!options?.disableThinking) {
                requestBody.reasoning_effort = options?.thinkingLevel || 'medium';
            }
        } else if (options?.disableThinking) {
            requestBody.think = false;
            console.log('[OpenAICompatProvider] Streaming: Thinking disabled (tool calling mode)');
        }

        if (options?.nativeTools && options.nativeTools.length > 0) {
            requestBody.tools = options.nativeTools;
            requestBody.tool_choice = 'auto';
        }

        const { url, headers } = buildRequest(this.config, this.config.endpoint);
        console.log(`[OpenAICompatProvider] model=${this.config.model} streaming=true nativeTools=${!!options?.nativeTools} geminiCompat=${isGeminiCompat} thinking=${isGeminiCompat && !options?.disableThinking}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(requestBody), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            onChunk('', true);
            throw new Error(`Admin Model API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        if (!response.body) {
            onChunk('', true);
            throw new Error('No response body for streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let thinkingText = '';
        let buffer = '';
        let lastFinishReason = '';
        // OpenCode 방식: 배열 위치 기반 (Gemini는 index 필드를 안 보냄 → length 폴백)
        const streamingToolCalls: Array<{ id: string; name: string; argumentsStr: string }> = [];
        const firedNativeIndices = new Set<number>();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') {
                    const maxTokensReached = lastFinishReason === 'length';
                    if (maxTokensReached) { console.log('[OpenAICompatProvider] ⚠️ MAX_TOKENS reached in streaming'); }
                    // Fire onNativeToolComplete for any remaining unfired tool_calls
                    for (let i = 0; i < streamingToolCalls.length; i++) {
                        if (streamingToolCalls[i] && !firedNativeIndices.has(i)) {
                            firedNativeIndices.add(i);
                            try {
                                const args = streamingToolCalls[i].argumentsStr ? JSON.parse(streamingToolCalls[i].argumentsStr) : {};
                                options?.onNativeToolComplete?.(streamingToolCalls[i].name, args);
                            } catch { /* skip */ }
                        }
                    }
                    const validToolCalls = streamingToolCalls.filter(tc => tc.name);
                    if (validToolCalls.length > 0) {
                        const converted = validToolCalls.map(tc => {
                            const args = tc.argumentsStr ? JSON.parse(tc.argumentsStr) : {};
                            return JSON.stringify({ tool: tc.name, ...args });
                        }).join('\n');
                        console.log(`[OpenAICompatProvider] Streaming: Native tool_calls converted, count: ${validToolCalls.length}`);
                        onChunk('', true);
                        const thinkPrefix = thinkingText.trim() ? `<think>${thinkingText}</think>\n` : '';
                        return thinkPrefix + converted;
                    }
                    onChunk('', true);
                    if (thinkingText.trim()) {
                        const text = `<think>${thinkingText}</think>\n${fullText}`;
                        return maxTokensReached ? text + '\n[MAX_TOKENS_REACHED]' : text;
                    }
                    return maxTokensReached ? fullText + '\n[MAX_TOKENS_REACHED]' : fullText;
                }
                try {
                    const parsed: any = JSON.parse(data);
                    const fr = parsed.choices?.[0]?.finish_reason;
                    if (fr) { lastFinishReason = fr; }
                    const delta = parsed.choices?.[0]?.delta;
                    // 첫 청크: 어떤 필드가 오는지 확인
                    if (delta && Object.keys(delta).length > 0 && fullText.length === 0 && thinkingText.length === 0) {
                        console.log('[OpenAICompatProvider] first delta keys:', JSON.stringify(Object.keys(delta)));
                        if (delta.thinking !== undefined) console.log('[OpenAICompatProvider] 🧠 thinking field exists');
                        if (delta.reasoning_content !== undefined) console.log('[OpenAICompatProvider] 🧠 reasoning_content field exists');
                    }
                    const content = delta?.content;
                    if (content) {
                        fullText += content;
                        onChunk(content, false);
                    }
                    const reasoningContent = delta?.reasoning_content;
                    if (reasoningContent) {
                        if (thinkingText.length === 0) console.log('[OpenAICompatProvider] 🧠 reasoning_content start');
                        thinkingText += reasoningContent;
                    }
                    // Gemini OpenAI compat은 'thinking' 필드로 올 수도 있음
                    const thinkingField = delta?.thinking;
                    if (thinkingField) {
                        if (thinkingText.length === 0) console.log('[OpenAICompatProvider] 🧠 thinking field start');
                        thinkingText += thinkingField;
                    }
                    const toolCallDeltas = parsed.choices?.[0]?.delta?.tool_calls;
                    if (toolCallDeltas) {
                        for (const tc of toolCallDeltas) {
                            const pos = (tc.index as number | undefined) ?? streamingToolCalls.length;
                            if (streamingToolCalls[pos] == null) {
                                // New tool_call starting — fire callback for all previous unfired indices
                                for (let i = 0; i < pos; i++) {
                                    if (streamingToolCalls[i] && !firedNativeIndices.has(i)) {
                                        firedNativeIndices.add(i);
                                        try {
                                            const args = streamingToolCalls[i].argumentsStr ? JSON.parse(streamingToolCalls[i].argumentsStr) : {};
                                            options?.onNativeToolComplete?.(streamingToolCalls[i].name, args);
                                        } catch { /* skip */ }
                                    }
                                }
                                streamingToolCalls[pos] = {
                                    id: tc.id ?? `tc_${pos}`,
                                    name: tc.function?.name ?? '',
                                    argumentsStr: tc.function?.arguments ?? '',
                                };
                            } else {
                                if (tc.function?.name) { streamingToolCalls[pos].name += tc.function.name; }
                                if (tc.function?.arguments) { streamingToolCalls[pos].argumentsStr += tc.function.arguments; }
                            }
                        }
                    }
                } catch {
                    // JSON parse error - skip
                }
            }
        }

        onChunk('', true);
        return lastFinishReason === 'length' ? fullText + '\n[MAX_TOKENS_REACHED]' : fullText;
    }
}
