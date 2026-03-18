/**
 * Gemini Native Provider
 * Google Gemini REST API (generativelanguage.googleapis.com)
 * 스트리밍: JSON 배열 형태 (SSE가 아닌 커스텀 JSON 청크)
 */

import { AdminModelConfig, AdminModelMessagePart, SendOptions, ChunkCallback } from '../AdminModelTypes';
import { ILLMProvider } from './ILLMProvider';
import { buildRequest, assertResponseField } from './providerUtils';

const GEMINI_SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

export class GeminiProvider implements ILLMProvider {
    constructor(private config: AdminModelConfig) {}

    private buildBody(
        userText: string,
        systemPrompt?: string,
        options?: SendOptions,
        streaming = false
    ): Record<string, unknown> {
        const hasNativeTools = options?.nativeTools && options.nativeTools.length > 0;

        const body: Record<string, unknown> = {
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: {
                temperature: this.config.defaultTemperature ?? 0.7,
                topP: this.config.topP ?? 0.9,
                maxOutputTokens: this.config.maxOutputTokens || this.config.maxTokens || 65536,
            },
            safetySettings: GEMINI_SAFETY_SETTINGS,
        };

        if (systemPrompt) {
            body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        // Gemini 2.5 thinking (tool calling과 함께 사용 불가)
        if (!options?.disableThinking && !hasNativeTools) {
            (body.generationConfig as Record<string, unknown>).thinkingConfig = { thinkingBudget: -1 };
        }

        if (hasNativeTools) {
            const functionDeclarations = options!.nativeTools!.map((t: any) => t.function || t);
            body.tools = [{ functionDeclarations }];
            body.tool_config = { function_calling_config: { mode: 'AUTO' } };
            console.log(`[GeminiProvider] Native tool calling enabled, streaming=${streaming}, tools count:`, options!.nativeTools!.length);
        }

        return body;
    }

    async send(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        const userText = typeof messageOrParts === 'string'
            ? messageOrParts
            : messageOrParts.map(p => p.text || '').join('\n');

        const body = this.buildBody(userText, systemPrompt, options, false);
        const endpoint = this.config.endpoint.replace(/\/+$/, '');
        const model = this.config.model;
        const { url, headers } = buildRequest(this.config, `${endpoint}/models/${model}:generateContent`);
        console.log(`[GeminiProvider] model=${model} streaming=false nativeTools=${!!options?.nativeTools}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Admin Model API (Gemini) error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: any = await response.json();
        assertResponseField(data, 'candidates');
        const parts = data.candidates?.[0]?.content?.parts;

        if (parts) {
            const functionCallParts = parts.filter((p: any) => p.functionCall);
            if (functionCallParts.length > 0) {
                console.log('[GeminiProvider] Native functionCall received, count:', functionCallParts.length);
                return functionCallParts.map((p: any) => {
                    const fc = p.functionCall!;
                    return JSON.stringify({ tool: fc.name, ...fc.args });
                }).join('\n');
            }
        }

        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    async stream(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: ChunkCallback,
        options?: SendOptions
    ): Promise<string> {
        const userText = userParts.map(p => p.text || '').join('\n');
        const body = this.buildBody(userText, systemPrompt, options, true);

        const endpoint = this.config.endpoint.replace(/\/+$/, '');
        const model = this.config.model;
        const { url, headers } = buildRequest(this.config, `${endpoint}/models/${model}:streamGenerateContent`);
        console.log(`[GeminiProvider] model=${model} streaming=true nativeTools=${!!options?.nativeTools}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            onChunk('', true);
            throw new Error(`Admin Model API (Gemini) error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        if (!response.body) {
            onChunk('', true);
            throw new Error('No response body for streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let thinkingText = '';
        let buffer = '';
        const streamingFunctionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Gemini 스트리밍: JSON 배열 형태에서 개별 객체 추출
            let startIdx = 0;
            while (startIdx < buffer.length) {
                const objStart = buffer.indexOf('{', startIdx);
                if (objStart === -1) break;

                let depth = 0;
                let objEnd = -1;
                let inString = false;
                let escape = false;

                for (let i = objStart; i < buffer.length; i++) {
                    const char = buffer[i];
                    if (escape) { escape = false; continue; }
                    if (char === '\\' && inString) { escape = true; continue; }
                    if (char === '"') { inString = !inString; continue; }
                    if (!inString) {
                        if (char === '{') depth++;
                        else if (char === '}') {
                            depth--;
                            if (depth === 0) { objEnd = i; break; }
                        }
                    }
                }

                if (objEnd === -1) break;

                try {
                    const json: any = JSON.parse(buffer.substring(objStart, objEnd + 1));
                    const parts = json.candidates?.[0]?.content?.parts || [];
                    for (const part of parts) {
                        if (part.thought === true && part.text) {
                            thinkingText += part.text;
                        } else if (part.text) {
                            fullText += part.text;
                            onChunk(part.text, false);
                        }
                        if (part.functionCall) {
                            streamingFunctionCalls.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
                        }
                    }
                } catch { /* skip */ }

                startIdx = objEnd + 1;
            }

            if (startIdx > 0) {
                buffer = buffer.substring(startIdx);
            }
        }

        if (streamingFunctionCalls.length > 0) {
            const converted = streamingFunctionCalls
                .map(fc => JSON.stringify({ tool: fc.name, ...fc.args }))
                .join('\n');
            console.log(`[GeminiProvider] Streaming: Native functionCalls converted, count: ${streamingFunctionCalls.length}`);
            onChunk('', true);
            const thinkPrefix = thinkingText.trim() ? `<think>${thinkingText}</think>\n` : '';
            return thinkPrefix + converted;
        }

        onChunk('', true);
        if (thinkingText.trim()) {
            return `<think>${thinkingText}</think>\n${fullText}`;
        }
        return fullText;
    }
}
