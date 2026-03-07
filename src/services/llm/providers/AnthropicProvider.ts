/**
 * Anthropic Native Provider
 * Anthropic Messages API (claude-3-*, claude-4-* 등)
 * Named SSE events: content_block_start / content_block_delta / message_stop
 */

import { AdminModelConfig, AdminModelMessagePart, SendOptions, ChunkCallback } from '../AdminModelTypes';
import { ILLMProvider } from './ILLMProvider';

export class AnthropicProvider implements ILLMProvider {
    constructor(private config: AdminModelConfig) {}

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };
        if (this.config.apiKey) {
            headers['x-api-key'] = this.config.apiKey;
        }
        if (this.config.customHeaders) {
            Object.assign(headers, this.config.customHeaders);
        }
        return headers;
    }

    private buildUrl(): string {
        const base = this.config.endpoint.replace(/\/+$/, '');
        if (base.endsWith('/messages')) return base;
        if (base.endsWith('/v1')) return `${base}/messages`;
        return `${base}/v1/messages`;
    }

    private buildTools(nativeTools: unknown[]): unknown[] {
        return nativeTools.map((t: any) => ({
            name: t.function?.name || t.name,
            description: t.function?.description || t.description || '',
            input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
        }));
    }

    async send(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        const userText = typeof messageOrParts === 'string'
            ? messageOrParts
            : messageOrParts.map(p => p.text || '').join('\n');

        const body: Record<string, unknown> = {
            model: this.config.model,
            max_tokens: this.config.maxOutputTokens || this.config.maxTokens || 16384,
            messages: [{ role: 'user', content: userText }],
        };
        if (systemPrompt) {
            body.system = systemPrompt;
        }
        if (options?.nativeTools && options.nativeTools.length > 0) {
            body.tools = this.buildTools(options.nativeTools);
        }

        const url = this.buildUrl();
        const headers = this.buildHeaders();
        console.log(`[AnthropicProvider] model=${this.config.model} streaming=false nativeTools=${!!options?.nativeTools}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Admin Model API (Anthropic) error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: any = await response.json();
        const content: Array<{ type: string; name?: string; input?: Record<string, unknown>; text?: string }> = data.content || [];

        const toolUseParts = content.filter(c => c.type === 'tool_use');
        if (toolUseParts.length > 0) {
            console.log('[AnthropicProvider] Native tool_use received, count:', toolUseParts.length);
            return toolUseParts.map(c => JSON.stringify({ tool: c.name, ...c.input })).join('\n');
        }

        return content.find(c => c.type === 'text')?.text || '';
    }

    async stream(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: ChunkCallback,
        options?: SendOptions
    ): Promise<string> {
        const userText = userParts.map(p => p.text || '').join('\n');

        const body: Record<string, unknown> = {
            model: this.config.model,
            max_tokens: this.config.maxOutputTokens || this.config.maxTokens || 16384,
            messages: [{ role: 'user', content: userText }],
            stream: true,
        };
        if (systemPrompt) {
            body.system = systemPrompt;
        }
        if (options?.nativeTools && options.nativeTools.length > 0) {
            body.tools = this.buildTools(options.nativeTools);
        }

        const url = this.buildUrl();
        const headers = this.buildHeaders();
        console.log(`[AnthropicProvider] model=${this.config.model} streaming=true nativeTools=${!!options?.nativeTools}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            onChunk('', true);
            throw new Error(`Admin Model API (Anthropic) error: ${response.status} ${response.statusText} - ${errorText}`);
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
        const toolBlocks: Array<{ id: string; name: string; partialJson: string }> = [];
        let currentEvent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                if (trimmed.startsWith('event:')) {
                    currentEvent = trimmed.slice(6).trim();
                    continue;
                }
                if (!trimmed.startsWith('data:')) continue;

                try {
                    const evt: any = JSON.parse(trimmed.slice(5).trim());

                    if (currentEvent === 'content_block_start') {
                        if (evt.content_block?.type === 'tool_use') {
                            toolBlocks[evt.index!] = {
                                id: evt.content_block.id,
                                name: evt.content_block.name,
                                partialJson: '',
                            };
                        }
                    } else if (currentEvent === 'content_block_delta') {
                        const delta = evt.delta;
                        if (delta?.type === 'text_delta') {
                            fullText += delta.text;
                            onChunk(delta.text!, false);
                        } else if (delta?.type === 'thinking_delta') {
                            thinkingText += delta.thinking;
                        } else if (delta?.type === 'input_json_delta') {
                            const block = toolBlocks[evt.index!];
                            if (block) { block.partialJson += delta.partial_json; }
                        }
                    }
                } catch { /* skip malformed events */ }
            }
        }

        const validTools = toolBlocks.filter(t => t?.name);
        if (validTools.length > 0) {
            const converted = validTools.map(t => {
                const args = t.partialJson ? JSON.parse(t.partialJson) : {};
                return JSON.stringify({ tool: t.name, ...args });
            }).join('\n');
            console.log(`[AnthropicProvider] Streaming: Native tool_use converted, count: ${validTools.length}`);
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
