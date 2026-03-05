/**
 * Admin Model API Client
 * 관리자가 설정한 AI 모델과 통신하는 OpenAI-compatible 클라이언트
 */

type SendOptions = { signal?: AbortSignal; disableThinking?: boolean; nativeTools?: any[] };

export interface AdminModelMessagePart {
    text?: string;
}

export interface AdminModelConfig {
    key: string;
    provider: string;
    model: string;
    apiKey: string;
    endpoint: string;
    maxTokens?: number;
    maxOutputTokens?: number;
    contextWindow?: number;
    enabled?: boolean;
    authType?: 'bearer' | 'query_param' | 'custom_header' | 'none';
    authHeaderName?: string; // custom_header 시 사용할 헤더 이름 (예: x-goog-api-key)
    defaultTemperature?: number;
    topP?: number;
    customHeaders?: Record<string, string>;
    streamingSupported?: boolean;
    nativeToolCallingSupported?: boolean;
}

export class AdminModelApi {
    private config: AdminModelConfig | null = null;

    constructor() {}

    /**
     * 관리자 모델 설정 적용
     */
    public setConfig(config: AdminModelConfig): void {
        this.config = config;
        console.log('[AdminModelApi] Config set:', {
            key: config.key,
            provider: config.provider,
            model: config.model,
            endpoint: config.endpoint,
            maxOutputTokens: config.maxOutputTokens,
            contextWindow: config.contextWindow,
        });
    }

    public getConfig(): AdminModelConfig | null {
        return this.config;
    }

    public getModel(): string {
        return this.config?.model || 'unknown';
    }

    public getModelName(): string {
        return this.config?.model || 'unknown';
    }

    public isConfigured(): boolean {
        return !!(this.config?.endpoint && this.config?.model);
    }

    /**
     * 단순 메시지를 전송합니다
     */
    public async sendMessage(message: string, options?: SendOptions): Promise<string> {
        return this.sendMessageInternal(message, undefined, options);
    }

    /**
     * 시스템 프롬프트와 함께 메시지를 전송합니다
     */
    public async sendMessageWithSystemPrompt(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        options?: SendOptions
    ): Promise<string> {
        return this.sendMessageInternal(userParts, systemPrompt, options);
    }

    /**
     * URL + provider 필드 기반 provider 자동 감지
     * 우선순위: explicit provider 필드 > URL 패턴
     */
    private detectProvider(): 'gemini_native' | 'anthropic_native' | 'openai_compat' {
        const endpoint = (this.config!.endpoint || '').toLowerCase();
        const explicit = (this.config!.provider || '').toLowerCase();

        // explicit override — provider 필드 명시 시 URL 감지보다 우선
        if (explicit === 'gemini') return 'gemini_native';
        if (explicit === 'vertex' || explicit === 'vertex_ai') return 'gemini_native';
        if (explicit === 'anthropic' || explicit === 'claude') return 'anthropic_native';
        // OpenAI 호환 계열 명시 (openai, azure, groq, deepseek, mistral, together,
        //                       xai, fireworks, perplexity, chat_completions, custom 등)
        if (explicit && explicit !== '') return 'openai_compat';

        // URL 기반 자동 감지 (구체적인 패턴 먼저)
        // Gemini OpenAI-compat: /openai/ 경로가 있으면 먼저 체크
        if (endpoint.includes('generativelanguage.googleapis.com') && endpoint.includes('/openai/')) {
            return 'openai_compat';
        }
        // Gemini native
        if (endpoint.includes('generativelanguage.googleapis.com')) {
            return 'gemini_native';
        }
        // Vertex AI (Gemini native 포맷 동일)
        if (endpoint.includes('aiplatform.googleapis.com') && !endpoint.includes('openapi')) {
            return 'gemini_native';
        }
        // Anthropic
        if (endpoint.includes('anthropic.com')) {
            return 'anthropic_native';
        }
        // 그 외 (api.openai.com, api.groq.com, api.deepseek.com, api.together.xyz,
        //        api.fireworks.ai, api.mistral.ai, api.perplexity.ai, api.x.ai,
        //        api.cerebras.ai, api.sambanova.ai, *.openai.azure.com, 커스텀 프록시 등)
        return 'openai_compat';
    }

    /**
     * 내부 메시지 전송 로직 (provider에 따라 분기)
     */
    private async sendMessageInternal(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        if (!this.config) {
            throw new Error('Admin model is not configured.');
        }

        const provider = this.detectProvider();
        console.log(`[AdminModelApi] detectProvider=${provider} endpoint=${this.config.endpoint}`);

        if (provider === 'gemini_native') {
            return this.sendGemini(messageOrParts, systemPrompt, options);
        }
        if (provider === 'anthropic_native') {
            return this.sendAnthropic(messageOrParts, systemPrompt, options);
        }
        return this.sendOpenAI(messageOrParts, systemPrompt, options);
    }

    /**
     * OpenAI-compatible 요청
     */
    private async sendOpenAI(
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

        const requestBody: any = {
            model: this.config!.model,
            messages,
            temperature: this.config!.defaultTemperature ?? 0.7,
            top_p: this.config!.topP ?? 0.9,
            stream: false
        };
        // max_tokens 기본값 설정 (Gemini OpenAI-compatible 엔드포인트는 기본값이 매우 낮음)
        const maxTok = this.config!.maxOutputTokens || this.config!.maxTokens || 16384;
        requestBody.max_tokens = maxTok;

        // thinking 비활성화 (tool calling과 충돌 방지 — 네이티브 tool calling이 아닌 텍스트 기반이므로)
        if (options?.disableThinking) {
            requestBody.think = false;
            console.log('[AdminModelApi] Thinking disabled for this request (tool calling mode)');
        }

        // 네이티브 툴 콜링: tools 배열 추가
        if (options?.nativeTools && options.nativeTools.length > 0) {
            requestBody.tools = options.nativeTools;
            requestBody.tool_choice = 'auto';
        }

        const { url, headers } = this.buildRequest(this.config!.endpoint);

        console.log(`[AdminModelApi] model=${this.config!.model} streaming=false nativeTools=${!!options?.nativeTools}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(requestBody), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Admin Model API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: any = await response.json();

        if (!data.choices || data.choices.length === 0) {
            throw new Error('Invalid response from Admin Model API: no choices');
        }

        // 네이티브 tool_calls가 있으면 텍스트 JSON 형식으로 변환 (기존 ToolParser 호환)
        const toolCalls = data.choices[0]?.message?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
            console.log('[AdminModelApi] Native tool_calls received, count:', toolCalls.length);
            return toolCalls.map((tc: any) => {
                const fn = tc.function;
                const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {});
                return JSON.stringify({ tool: fn.name, ...args });
            }).join('\n');
        }

        return data.choices[0]?.message?.content || '';
    }

    /**
     * Anthropic API 헤더 빌드 (x-api-key + anthropic-version)
     */
    private buildAnthropicHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };
        if (this.config?.apiKey) {
            headers['x-api-key'] = this.config.apiKey;
        }
        if (this.config?.customHeaders) {
            Object.assign(headers, this.config.customHeaders);
        }
        return headers;
    }

    /**
     * Anthropic endpoint URL 빌드
     * admin이 base URL만 설정해도 /v1/messages 자동 추가
     */
    private buildAnthropicUrl(): string {
        const base = this.config!.endpoint.replace(/\/+$/, '');
        if (base.endsWith('/messages')) return base;
        if (base.endsWith('/v1')) return `${base}/messages`;
        return `${base}/v1/messages`;
    }

    /**
     * Anthropic Messages API (비스트리밍)
     */
    private async sendAnthropic(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        const userText = typeof messageOrParts === 'string'
            ? messageOrParts
            : messageOrParts.map(p => p.text || '').join('\n');

        const body: any = {
            model: this.config!.model,
            max_tokens: this.config!.maxOutputTokens || this.config!.maxTokens || 16384,
            messages: [{ role: 'user', content: userText }],
        };
        if (systemPrompt) {
            body.system = systemPrompt;
        }
        // Anthropic tool format: input_schema (not parameters like OpenAI)
        if (options?.nativeTools && options.nativeTools.length > 0) {
            body.tools = options.nativeTools.map((t: any) => ({
                name: t.function?.name || t.name,
                description: t.function?.description || t.description || '',
                input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
            }));
        }

        const url = this.buildAnthropicUrl();
        const headers = this.buildAnthropicHeaders();
        console.log(`[AdminModelApi] model=${this.config!.model} streaming=false nativeTools=${!!options?.nativeTools} provider=anthropic`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Admin Model API (Anthropic) error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: any = await response.json();
        const content: any[] = data.content || [];

        // tool_use 블록 우선 처리
        const toolUseParts = content.filter((c: any) => c.type === 'tool_use');
        if (toolUseParts.length > 0) {
            console.log('[AdminModelApi] Anthropic native tool_use received, count:', toolUseParts.length);
            return toolUseParts.map((c: any) =>
                JSON.stringify({ tool: c.name, ...c.input })
            ).join('\n');
        }

        return content.find((c: any) => c.type === 'text')?.text || '';
    }

    /**
     * Anthropic Messages API 스트리밍 (named SSE events)
     */
    private async streamAnthropic(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        const userText = userParts.map(p => p.text || '').join('\n');

        const body: any = {
            model: this.config!.model,
            max_tokens: this.config!.maxOutputTokens || this.config!.maxTokens || 16384,
            messages: [{ role: 'user', content: userText }],
            stream: true,
        };
        if (systemPrompt) {
            body.system = systemPrompt;
        }
        if (options?.nativeTools && options.nativeTools.length > 0) {
            body.tools = options.nativeTools.map((t: any) => ({
                name: t.function?.name || t.name,
                description: t.function?.description || t.description || '',
                input_schema: t.function?.parameters || t.parameters || { type: 'object', properties: {} },
            }));
        }

        const url = this.buildAnthropicUrl();
        const headers = this.buildAnthropicHeaders();
        console.log(`[AdminModelApi] model=${this.config!.model} streaming=true nativeTools=${!!options?.nativeTools} provider=anthropic`);

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
        // tool_use 블록: index → {id, name, partialJson}
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
                    const evt = JSON.parse(trimmed.slice(5).trim());

                    if (currentEvent === 'content_block_start') {
                        if (evt.content_block?.type === 'tool_use') {
                            toolBlocks[evt.index] = {
                                id: evt.content_block.id,
                                name: evt.content_block.name,
                                partialJson: '',
                            };
                        }
                    } else if (currentEvent === 'content_block_delta') {
                        const delta = evt.delta;
                        if (delta?.type === 'text_delta') {
                            fullText += delta.text;
                            onChunk(delta.text, false);
                        } else if (delta?.type === 'thinking_delta') {
                            thinkingText += delta.thinking;
                        } else if (delta?.type === 'input_json_delta') {
                            const block = toolBlocks[evt.index];
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
            console.log(`[AdminModelApi] Streaming Anthropic: Native tool_use converted, count: ${validTools.length}`);
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

    /**
     * Gemini REST API 요청
     */
    private async sendGemini(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        const userText = typeof messageOrParts === 'string'
            ? messageOrParts
            : messageOrParts.map(p => p.text || '').join('\n');

        const body: any = {
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: {
                temperature: this.config!.defaultTemperature ?? 0.7,
                topP: this.config!.topP ?? 0.9,
                maxOutputTokens: this.config!.maxOutputTokens || this.config!.maxTokens || 500000,
            },
            safetySettings: GEMINI_SAFETY_SETTINGS,
        };

        if (systemPrompt) {
            body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const hasNativeTools = options?.nativeTools && options.nativeTools.length > 0;

        // Gemini 2.5 thinking (tool calling과 함께 사용 불가)
        if (!options?.disableThinking && !hasNativeTools) {
            body.generationConfig.thinkingConfig = { thinkingBudget: -1 };
        }

        // 네이티브 툴 콜링: Gemini tools 배열 추가
        if (hasNativeTools) {
            // OpenAI format({type:'function', function:{...}}) → Gemini format({functionDeclarations:[...]})
            const functionDeclarations = options!.nativeTools!.map((t: any) => t.function || t);
            body.tools = [{ functionDeclarations }];
            body.tool_config = { function_calling_config: { mode: 'AUTO' } };
            console.log('[AdminModelApi] Gemini native tool calling enabled, tools count:', options!.nativeTools!.length);
        }

        const endpoint = this.config!.endpoint.replace(/\/+$/, '');
        const model = this.config!.model;
        const { url, headers } = this.buildRequest(`${endpoint}/models/${model}:generateContent`);

        console.log(`[AdminModelApi] model=${model} streaming=false nativeTools=${!!options?.nativeTools}`);

        const response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(body), signal: options?.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Admin Model API (Gemini) error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data: any = await response.json();

        // 네이티브 functionCall parts가 있으면 텍스트 JSON 형식으로 변환
        const parts = data.candidates?.[0]?.content?.parts;
        if (parts) {
            const functionCallParts = parts.filter((p: any) => p.functionCall);
            if (functionCallParts.length > 0) {
                console.log('[AdminModelApi] Gemini native functionCall received, count:', functionCallParts.length);
                return functionCallParts.map((p: any) => {
                    const fc = p.functionCall;
                    return JSON.stringify({ tool: fc.name, ...fc.args });
                }).join('\n');
            }
        }

        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    /**
     * URL 및 헤더 빌드 (authType, customHeaders 반영)
     */
    private buildRequest(baseUrl: string): { url: string; headers: Record<string, string> } {
        const authType = this.config?.authType || 'bearer';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        let url = baseUrl;

        if (authType === 'query_param' && this.config?.apiKey) {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}key=${this.config.apiKey}`;
        } else if (authType === 'custom_header' && this.config?.apiKey) {
            const headerName = this.config.authHeaderName || 'x-goog-api-key';
            headers[headerName] = this.config.apiKey;
        } else if (authType !== 'none' && this.config?.apiKey) {
            headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        }

        if (this.config?.customHeaders) {
            Object.assign(headers, this.config.customHeaders);
        }

        return { url, headers };
    }

    /**
     * 스트리밍 응답 (provider에 따라 분기)
     */
    public async sendMessageWithSystemPromptStreaming(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        if (!this.config) {
            throw new Error('Admin model is not configured.');
        }

        const provider = this.detectProvider();
        if (provider === 'gemini_native') {
            return this.streamGemini(systemPrompt, userParts, onChunk, options);
        }
        if (provider === 'anthropic_native') {
            return this.streamAnthropic(systemPrompt, userParts, onChunk, options);
        }
        return this.streamOpenAI(systemPrompt, userParts, onChunk, options);
    }

    /**
     * OpenAI-compatible 스트리밍 (SSE)
     */
    private async streamOpenAI(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userParts.map(p => p.text || '').join('\n') });

        const requestBody: any = {
            model: this.config!.model, messages,
            temperature: this.config!.defaultTemperature ?? 0.7,
            top_p: this.config!.topP ?? 0.9,
            stream: true
        };
        // max_tokens 기본값 설정 (Gemini OpenAI-compatible 엔드포인트는 기본값이 매우 낮음)
        const maxTok = this.config!.maxOutputTokens || this.config!.maxTokens || 16384;
        requestBody.max_tokens = maxTok;

        // thinking 비활성화 (tool calling과 충돌 방지)
        if (options?.disableThinking) {
            requestBody.think = false;
            console.log('[AdminModelApi] Streaming: Thinking disabled for this request (tool calling mode)');
        }

        if (options?.nativeTools && options.nativeTools.length > 0) {
            requestBody.tools = options.nativeTools;
            requestBody.tool_choice = 'auto';
        }

        const { url, headers } = this.buildRequest(this.config!.endpoint);
        console.log(`[AdminModelApi] model=${this.config!.model} streaming=true nativeTools=${!!options?.nativeTools}`);

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
        // OpenCode 방식: 배열 위치 기반 (Gemini는 index 필드를 안 보냄 → index ?? length 폴백)
        const streamingToolCalls: Array<{ id: string; name: string; argumentsStr: string }> = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // 마지막 요소는 불완전할 수 있으므로 버퍼에 보관
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') {
                    const validToolCalls = streamingToolCalls.filter(tc => tc.name);
                    if (validToolCalls.length > 0) {
                        const converted = validToolCalls.map(tc => {
                            const args = tc.argumentsStr ? JSON.parse(tc.argumentsStr) : {};
                            return JSON.stringify({ tool: tc.name, ...args });
                        }).join('\n');
                        console.log(`[AdminModelApi] Streaming OpenAI: Native tool_calls converted, count: ${validToolCalls.length}`);
                        onChunk('', true);
                        const thinkPrefixTool = thinkingText.trim() ? `<think>${thinkingText}</think>\n` : '';
                        return thinkPrefixTool + converted;
                    }
                    onChunk('', true);
                    if (thinkingText.trim()) {
                        return `<think>${thinkingText}</think>\n${fullText}`;
                    }
                    return fullText;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        onChunk(content, false);
                    }
                    // DeepSeek-R1 등 OpenAI compat 모델의 thinking (reasoning_content)
                    const reasoningContent = parsed.choices?.[0]?.delta?.reasoning_content;
                    if (reasoningContent) {
                        thinkingText += reasoningContent;
                    }
                    const toolCallDeltas = parsed.choices?.[0]?.delta?.tool_calls;
                    if (toolCallDeltas) {
                        for (const tc of toolCallDeltas) {
                            // Gemini는 index를 안 보냄 → 현재 배열 길이를 위치 폴백으로 사용 (OpenCode 패턴)
                            const pos = (tc.index as number | undefined) ?? streamingToolCalls.length;
                            if (streamingToolCalls[pos] == null) {
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
        return fullText;
    }

    /**
     * Gemini 스트리밍 (JSON 배열)
     */
    private async streamGemini(
        systemPrompt: string,
        userParts: AdminModelMessagePart[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        const userText = userParts.map(p => p.text || '').join('\n');

        const body: any = {
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: {
                temperature: this.config!.defaultTemperature ?? 0.7,
                topP: this.config!.topP ?? 0.9,
                maxOutputTokens: this.config!.maxOutputTokens || this.config!.maxTokens || 500000,
            },
            safetySettings: GEMINI_SAFETY_SETTINGS,
        };
        if (systemPrompt) {
            body.systemInstruction = { parts: [{ text: systemPrompt }] };
        }

        const hasNativeToolsStream = options?.nativeTools && options.nativeTools.length > 0;

        // Gemini 2.5 thinking (tool calling과 함께 사용 불가)
        if (!options?.disableThinking && !hasNativeToolsStream) {
            body.generationConfig.thinkingConfig = { thinkingBudget: -1 };
        }

        if (hasNativeToolsStream) {
            const functionDeclarations = options!.nativeTools!.map((t: any) => t.function || t);
            body.tools = [{ functionDeclarations }];
            body.tool_config = { function_calling_config: { mode: 'AUTO' } };
        }

        const endpoint = this.config!.endpoint.replace(/\/+$/, '');
        const model = this.config!.model;
        const { url, headers } = this.buildRequest(`${endpoint}/models/${model}:streamGenerateContent`);
        console.log(`[AdminModelApi] model=${model} streaming=true nativeTools=${!!options?.nativeTools}`);

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
        const streamingFunctionCalls: Array<{ name: string; args: any }> = [];

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
                    const json = JSON.parse(buffer.substring(objStart, objEnd + 1));
                    const parts = json.candidates?.[0]?.content?.parts || [];
                    for (const part of parts) {
                        if (part.thought === true && part.text) {
                            // Gemini 2.5 thinking tokens — UI에 스트림하지 않고 누적
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
            console.log(`[AdminModelApi] Streaming Gemini: Native functionCalls converted, count: ${streamingFunctionCalls.length}`);
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

/**
 * Gemini Safety 설정
 */
const GEMINI_SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];
