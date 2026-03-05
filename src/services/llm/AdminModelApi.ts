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
     * 내부 메시지 전송 로직 (provider에 따라 OpenAI/Gemini 분기)
     */
    private async sendMessageInternal(
        messageOrParts: string | AdminModelMessagePart[],
        systemPrompt?: string,
        options?: SendOptions
    ): Promise<string> {
        if (!this.config) {
            throw new Error('Admin model is not configured.');
        }

        if (this.config.provider === 'gemini') {
            return this.sendGemini(messageOrParts, systemPrompt, options);
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
            console.log('[AdminModelApi] Native tool calling enabled, tools count:', options.nativeTools.length);
        }

        const { url, headers } = this.buildRequest(this.config!.endpoint);

        console.log('[AdminModelApi] OpenAI request:', {
            endpoint: url, model: this.config!.model, messageCount: messages.length, nativeTools: !!options?.nativeTools
        });

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

        // 네이티브 툴 콜링: Gemini tools 배열 추가
        if (options?.nativeTools && options.nativeTools.length > 0) {
            // OpenAI format({type:'function', function:{...}}) → Gemini format({functionDeclarations:[...]})
            const functionDeclarations = options.nativeTools.map((t: any) => t.function || t);
            body.tools = [{ functionDeclarations }];
            body.tool_config = { function_calling_config: { mode: 'AUTO' } };
            console.log('[AdminModelApi] Gemini native tool calling enabled, tools count:', options.nativeTools.length);
        }

        const endpoint = this.config!.endpoint.replace(/\/+$/, '');
        const model = this.config!.model;
        const { url, headers } = this.buildRequest(`${endpoint}/models/${model}:generateContent`);

        console.log('[AdminModelApi] Gemini request:', {
            endpoint: url, model, nativeTools: !!options?.nativeTools
        });

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

        if (this.config.provider === 'gemini') {
            return this.streamGemini(systemPrompt, userParts, onChunk, options);
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
            console.log('[AdminModelApi] Streaming OpenAI: Native tool calling enabled');
        }

        const { url, headers } = this.buildRequest(this.config!.endpoint);

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
        let buffer = '';
        const indexToIdMap = new Map<number, string>();
        const toolCallsMap = new Map<string, { id: string; name: string; argumentsStr: string }>();

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
                    if (toolCallsMap.size > 0) {
                        const converted = [...toolCallsMap.values()]
                            .filter(tc => tc.name && tc.argumentsStr)
                            .map(tc => {
                                const args = JSON.parse(tc.argumentsStr);
                                return JSON.stringify({ tool: tc.name, ...args });
                            }).join('\n');
                        if (converted) {
                            console.log(`[AdminModelApi] Streaming OpenAI: Native tool_calls converted, count: ${toolCallsMap.size}`);
                            onChunk('', true);
                            return converted;
                        }
                    }
                    onChunk('', true);
                    return fullText;
                }
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        onChunk(content, false);
                    }
                    const toolCallDeltas = parsed.choices?.[0]?.delta?.tool_calls;
                    if (toolCallDeltas) {
                        for (const tc of toolCallDeltas) {
                            let id = tc.id as string | undefined;
                            if (id) {
                                indexToIdMap.set(tc.index, id);
                            } else {
                                id = indexToIdMap.get(tc.index);
                            }
                            if (!id) { continue; }
                            if (!toolCallsMap.has(id)) {
                                toolCallsMap.set(id, { id, name: '', argumentsStr: '' });
                            }
                            const entry = toolCallsMap.get(id)!;
                            if (tc.function?.name) { entry.name += tc.function.name; }
                            if (tc.function?.arguments) { entry.argumentsStr += tc.function.arguments; }
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

        if (options?.nativeTools && options.nativeTools.length > 0) {
            const functionDeclarations = options.nativeTools.map((t: any) => t.function || t);
            body.tools = [{ functionDeclarations }];
            body.tool_config = { function_calling_config: { mode: 'AUTO' } };
            console.log('[AdminModelApi] Streaming Gemini: Native tool calling enabled');
        }

        const endpoint = this.config!.endpoint.replace(/\/+$/, '');
        const model = this.config!.model;
        const { url, headers } = this.buildRequest(`${endpoint}/models/${model}:streamGenerateContent`);

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
                        if (part.text) {
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
            return converted;
        }

        onChunk('', true);
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
