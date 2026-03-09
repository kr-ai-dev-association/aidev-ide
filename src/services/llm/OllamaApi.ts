import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { StateManager } from '../../core/managers/state/StateManager';
import { DEFAULT_OLLAMA_URL } from '../../core/config/ApiDefaults';
import { Tool } from '../../core/tools/types';

type SendOptions = { signal?: AbortSignal; retries?: number; xmlRetry?: boolean; disableThinking?: boolean; nativeTools?: any[] };
type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type MessageBuilder = (userContent: string) => OllamaMessage[];

/**
 * 재시도 가능한 네트워크 에러 (ECONNREFUSED, ETIMEDOUT 등)
 */
class RetryableNetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RetryableNetworkError';
    }
}

const RETRYABLE_ERROR_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'];

/**
 * thinking 내용만 있고 response가 비어있을 때 발생하는 에러
 */
class ThinkingOnlyError extends Error {
    thinking: string;
    constructor(thinking: string) {
        super(`모델이 생각만 수행했습니다. 도구 호출 또는 텍스트 응답이 필요합니다. (Thinking length: ${thinking.length})`);
        this.thinking = thinking;
        this.name = 'ThinkingOnlyError';
    }
}

export class OllamaApi {
    private apiUrl: string;
    private modelName: string = '';
    private extensionContext: vscode.ExtensionContext | undefined;

    constructor(apiUrl?: string, extensionContext?: vscode.ExtensionContext) {
        this.apiUrl = apiUrl || DEFAULT_OLLAMA_URL;
        this.extensionContext = extensionContext;
    }

    public getApiUrl(): string {
        return this.apiUrl;
    }

    public getModel(): string {
        return this.modelName;
    }

    /** @deprecated getModel() 사용 */
    public getCurrentModelName(): string {
        return this.getModel();
    }

    public setModel(modelName: string): void {
        this.modelName = modelName;
    }

    public setApiUrl(apiUrl: string): void {
        this.apiUrl = apiUrl;
    }

    public async loadSettingsFromStorage(): Promise<void> {
        if (!this.extensionContext) return;

        try {
            const stateManager = StateManager.getInstance(this.extensionContext);
            const serverType = await stateManager.getOllamaServerType();
            if (serverType === 'remote') {
                const remoteApiUrl = await stateManager.getRemoteOllamaApiUrl();
                const remoteModel = await stateManager.getRemoteOllamaModel();

                if (remoteApiUrl) this.setApiUrl(remoteApiUrl);
                if (remoteModel) this.setModel(remoteModel);
            } else {
                const localApiUrl = await stateManager.getOllamaApiUrl();
                const localModel = await stateManager.getOllamaModel();

                if (localApiUrl) this.setApiUrl(localApiUrl);
                if (localModel) this.setModel(localModel);
            }
        } catch (error) {
            console.error('[OllamaApi] Failed to load settings from storage:', error);
        }
    }

    /**
     * 외부에서 호출하는 메인 메시지 전송 메서드 (사용자 메시지만)
     */
    public async sendMessage(message: string, options?: SendOptions): Promise<string> {
        return this.sendMessageWithRetry(
            message,
            (content) => [{ role: 'user', content }],
            options
        );
    }

    /**
     * FIM(Fill-in-the-Middle) 기반 인라인 코드 완성
     * /api/generate 엔드포인트 사용 — 채팅 포맷 대신 원시 프롬프트
     */
    public async sendFimCompletion(prefix: string, suffix: string, options?: SendOptions): Promise<string> {
        const fim = OllamaApi.getFimTokens(this.modelName);
        if (!fim) {
            // FIM 미지원 모델은 빈 문자열 반환 (chat 방식은 툴콜 JSON 내뱉음)
            console.log(`[OllamaApi] FIM not supported for model: ${this.modelName}`);
            return '';
        }

        const prompt = `${fim.prefix}${prefix}${fim.suffix}${suffix}${fim.middle}`;
        const url = new URL(`${this.apiUrl}/api/generate`);
        const stopTokens = [fim.prefix, fim.suffix, ...(fim.extraStop ?? [])];
        const requestData: any = {
            model: this.modelName,
            prompt,
            stream: false,
            options: { temperature: 0.1, num_predict: 256, stop: stopTokens },
        };

        console.log(`[OllamaApi] FIM completion request → ${this.modelName}`);
        const raw = await this.makeHttpRequest(url, requestData, options);
        const result = (raw.response ?? '').trim();
        const cleaned = OllamaApi.cleanFimResponse(result, prefix);
        if (cleaned === null) return '';
        return cleaned;
    }

    /**
     * FIM 응답 정제 + 유효성 검사 (Continue 방식)
     * null = 버려야 할 응답
     */
    private static cleanFimResponse(raw: string, prefix: string): string | null {
        if (!raw.trim()) return null;

        // 특수 토큰 제거 (stop 토큰이 응답에 섞여 나오는 경우)
        let text = raw
            .replace(/<file_sep>/g, '')
            .replace(/<\|endoftext\|>/g, '')
            .replace(/<EOT>/g, '')
            .replace(/<fim_prefix>|<fim_suffix>|<fim_middle>/g, '')
            .replace(/<\|fim_prefix\|>|<\|fim_suffix\|>|<\|fim_middle\|>/g, '');
        // 코드 펜스 제거
        text = text.replace(/^```[\w]*\r?\n?([\s\S]*?)```\s*$/m, '$1').trim();
        if (!text) return null;

        const firstLine = text.split('\n')[0].trim();
        const lines = text.split('\n');

        // prose(자연어) 감지 → 버림 (instruct 모델 오동작)
        if (/^(It |This |Here |Note |The |You |To |In |A |An |I |We |Please |Sure |Certainly)/i.test(firstLine)) {
            console.log(`[OllamaApi] FIM: prose discarded → use base model (starcoder2:3b, deepseek-coder:1.3b, qwen2.5-coder:1.5b-base)`);
            return null;
        }
        if (firstLine.endsWith('.') && !firstLine.includes(';') && !firstLine.includes('{')) {
            console.log(`[OllamaApi] FIM: prose (period) discarded`);
            return null;
        }

        // 전체 파일 재생성 감지 → 버림
        if (lines.length > 15 && /^import /.test(firstLine)) {
            console.log(`[OllamaApi] FIM: full-file regeneration discarded (${lines.length} lines starting with import)`);
            return null;
        }
        // prefix 앞부분을 그대로 반복
        const prefixStart = prefix.trimStart().slice(0, 40);
        if (prefixStart && text.trimStart().startsWith(prefixStart)) {
            console.log(`[OllamaApi] FIM: response repeats prefix, discarded`);
            return null;
        }
        // 20줄 초과 → cursor completion은 짧아야 함
        if (lines.length > 20) {
            console.log(`[OllamaApi] FIM: too long (${lines.length} lines), discarded`);
            return null;
        }

        return text;
    }

    /** 모델명으로 FIM 토큰 감지 */
    private static getFimTokens(modelName: string): { prefix: string; suffix: string; middle: string; extraStop?: string[] } | null {
        const n = modelName.toLowerCase();
        if (n.includes('qwen2.5-coder') || n.includes('qwen2.5_coder')) {
            return { prefix: '<|fim_prefix|>', suffix: '<|fim_suffix|>', middle: '<|fim_middle|>', extraStop: ['<|endoftext|>'] };
        }
        if (n.includes('starcoder2') || n.includes('starcoder')) {
            return { prefix: '<fim_prefix>', suffix: '<fim_suffix>', middle: '<fim_middle>', extraStop: ['<file_sep>', '<|endoftext|>'] };
        }
        if (n.includes('deepseek-coder') || n.includes('deepseek_coder')) {
            return { prefix: '<｜fim▁begin｜>', suffix: '<｜fim▁hole｜>', middle: '<｜fim▁end｜>', extraStop: ['<|endoftext|>'] };
        }
        if (n.includes('codellama') || n.includes('code-llama') || n.includes('code_llama')) {
            return { prefix: '<PRE> ', suffix: ' <SUF>', middle: ' <MID>', extraStop: ['<EOT>'] };
        }
        return null;
    }

    /**
     * 시스템 프롬프트와 사용자 메시지를 별도 role로 전송
     */
    public async sendMessageWithSystemPrompt(systemPrompt: string, userParts: any[], options?: SendOptions): Promise<string> {
        return this.sendMessageWithRetry(
            userParts.map(part => part.text).join('\n'),
            (content) => [
                { role: 'system', content: systemPrompt },
                { role: 'user', content }
            ],
            options
        );
    }

    /**
     * retry 루프를 담당하는 공통 내부 메서드
     * messageBuilder: retry 시 보강된 user content를 받아 messages 배열을 생성
     */
    private async sendMessageWithRetry(
        initialContent: string,
        messageBuilder: MessageBuilder,
        options?: SendOptions
    ): Promise<string> {
        const maxRetries = options?.retries || 3;
        let lastError: Error | null = null;
        let lastThinking: string | null = null;
        let currentContent = initialContent;
        let currentOptions = { ...options };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.sendMessageInternal(messageBuilder(currentContent), currentOptions);
            } catch (error: any) {
                lastError = error;
                const errorMsg = error.message || '';
                console.warn(`[OllamaApi] Attempt ${attempt}/${maxRetries} failed:`, errorMsg);

                if (error instanceof ThinkingOnlyError) {
                    lastThinking = error.thinking;
                    // thinking이 명시적으로 비활성화된 경우 retry해도 소용없음 → 즉시 빈 문자열 반환
                    if (options?.disableThinking) {
                        console.log('[OllamaApi] disableThinking=true but got thinking-only. Returning empty without retry.');
                        return '';
                    }
                }

                // AbortError는 의도적 취소 — 재시도해도 동일하게 취소됨
                if (error.name === 'AbortError') {
                    throw error;
                }

                // 모델을 찾을 수 없는 경우(404)는 재시도해도 소용없으므로 즉시 중단
                if (errorMsg.includes('404') && errorMsg.includes('not found')) {
                    console.error(`[OllamaApi] Model '${this.modelName}' not found in Ollama. Please pull the model first.`);
                    break;
                }

                // 네트워크 에러(ECONNREFUSED 등)는 짧은 대기 후 재시도
                if (error instanceof RetryableNetworkError) {
                    console.warn(`[OllamaApi] Retryable network error on attempt ${attempt}/${maxRetries}: ${errorMsg}`);
                }

                // 응답이 비어있거나 생각만 있는 경우 프롬프트 보강 후 재시도
                if (attempt < maxRetries) {
                    if (error instanceof ThinkingOnlyError) {
                        currentContent = `${initialContent}\n\nCRITICAL: You provided thoughts but NO actions or summary in the response field.
If you are NOT DONE, you MUST output actual tool calls (e.g., { "tool": "list_files", "path": "..." }) in your FINAL RESPONSE.
If you HAVE FINISHED all tasks, you MUST provide a final summary of your work in the FINAL RESPONSE.
Do NOT leave the response field empty. Every turn must produce a non-empty response.`;
                    } else if (!currentOptions.xmlRetry) {
                        currentContent = `${initialContent}\n\nCRITICAL: Output ONLY tool calls in { "tool": "...", "path": "..." } format. Do NOT put tool calls in thinking.`;
                        currentOptions.xmlRetry = true;
                    }
                }

                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // thinking-only로 모든 재시도 실패 시: thinking 안에 tool call JSON이 있으면 추출하여 반환
        if (lastThinking) {
            const extractedToolCalls = this.extractToolCallsFromThinking(lastThinking);
            if (extractedToolCalls) {
                console.log(`[OllamaApi] Extracted tool calls from thinking content (${extractedToolCalls.length} chars)`);
                return `<think>${lastThinking}</think>\n${extractedToolCalls}`;
            }
            console.log(`[OllamaApi] All ${maxRetries} retries failed with thinking-only. Returning thinking as fallback (length: ${lastThinking.length})`);
            return `<think>${lastThinking}</think>`;
        }

        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    /**
     * /api/chat 포맷으로 실제 요청 및 파싱을 담당하는 내부 메서드
     */
    private async sendMessageInternal(messages: OllamaMessage[], options?: SendOptions): Promise<string> {
        const url = new URL(`${this.apiUrl}/api/chat`);
        const requestData: any = {
            model: this.modelName,
            messages,
            stream: false
        };

        if (options?.disableThinking) {
            requestData.think = false;
            console.log(`[OllamaApi] Thinking disabled for this request (tool calling mode)`);
        }

        // 네이티브 툴 콜링: tools 배열 추가
        if (options?.nativeTools && options.nativeTools.length > 0) {
            requestData.tools = options.nativeTools;
            console.log(`[OllamaApi] Native tool calling enabled, tools count: ${options.nativeTools.length}`);
        }

        console.log(`[OllamaApi] Sending request to ${url.toString()} with model ${this.modelName}`);

        const rawResponse = await this.makeHttpRequest(url, requestData, options);

        console.log('[OllamaApi] Raw response received:', JSON.stringify(rawResponse).length > 500 ? JSON.stringify(rawResponse).substring(0, 500) + '...' : JSON.stringify(rawResponse));

        // 네이티브 tool_calls가 있으면 텍스트 JSON 형식으로 변환 (기존 ToolParser 호환)
        const nativeToolCalls = rawResponse.message?.tool_calls;
        if (nativeToolCalls && nativeToolCalls.length > 0) {
            const thinkingForTools = rawResponse.message?.thinking || '';
            console.log('[OllamaApi] Native tool_calls received, count:', nativeToolCalls.length);

            // 네임스페이스 strip: "repo_browser.read_file" → "read_file"
            const stripNamespace = (name: string): string => {
                const dotIndex = name.lastIndexOf('.');
                return dotIndex >= 0 ? name.substring(dotIndex + 1) : name;
            };

            const converted = nativeToolCalls.map((tc: any) => {
                const fn = tc.function;
                const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : (fn.arguments || {});
                const strippedName = stripNamespace(fn.name);
                if (strippedName !== fn.name) {
                    console.log(`[OllamaApi] Tool name namespace stripped: ${fn.name} → ${strippedName}`);
                }
                return JSON.stringify({ tool: strippedName, ...args });
            }).join('\n');

            // strip 후에도 유효하지 않은 도구면 → nativeTools 없이 텍스트 모드로 재호출
            const hasInvalidTool = nativeToolCalls.some((tc: any) => {
                const stripped = stripNamespace(tc.function.name);
                return !this.isKnownToolName(stripped);
            });

            if (hasInvalidTool) {
                console.warn('[OllamaApi] Native tool_calls contain unknown tools after stripping — retrying without native tools');
                const retryOptions = { ...options, nativeTools: undefined };
                return this.sendMessageInternal(messages, retryOptions);
            }

            if (thinkingForTools) {
                return `<think>${thinkingForTools}</think>\n${converted}`;
            }
            return converted;
        }

        const responseContent = this.parseResponseFormat(rawResponse);
        const thinkingContent = rawResponse.message?.thinking || '';

        const hasToolCall = responseContent && (
            /\{\s*["']tool["']\s*:\s*["']/.test(responseContent)
        );

        const isJunkResponse = responseContent && !hasToolCall && (
            responseContent.includes('=== Tool Execution Results') ||
            responseContent.includes('Wait: We should produce') ||
            responseContent.match(/^We need result\./i) ||
            (responseContent.length < 20 && responseContent.includes('read_file') && !responseContent.includes('<'))
        );

        if (!responseContent || isJunkResponse) {
            if (thinkingContent && thinkingContent.length > 0 && (!responseContent || responseContent.trim() === '')) {
                console.log('[OllamaApi] Thought detected but response is empty. Triggering retry.');
                throw new ThinkingOnlyError(thinkingContent);
            }

            if (!responseContent && !thinkingContent) {
                throw new Error("LLM이 아무런 응답도 생성하지 않았습니다.");
            }
        }

        if (responseContent && !isJunkResponse) {
            // thinking content가 있으면 <think> 태그로 wrap해서 반환
            // SubAgentLoop가 onThinking 콜백으로 UI에 전달할 수 있도록
            if (thinkingContent) {
                return `<think>${thinkingContent}</think>\n${responseContent}`;
            }
            return responseContent;
        }

        const extractedContent = responseContent || thinkingContent || '';
        if (!extractedContent.trim()) {
            throw new Error("LLM이 유효한 응답을 생성하지 못했습니다.");
        }

        return extractedContent;
    }

    /**
     * thinking 내용에서 tool call JSON을 추출
     */
    private extractToolCallsFromThinking(thinking: string): string | null {
        const toolCallPattern = /\{\s*"tool"\s*:\s*"[^"]+"/g;
        const matches = thinking.match(toolCallPattern);
        if (!matches || matches.length === 0) {
            return null;
        }

        const jsonBlocks: string[] = [];
        let searchFrom = 0;
        for (const match of matches) {
            const startIdx = thinking.indexOf(match, searchFrom);
            if (startIdx === -1) continue;

            let braceDepth = 0;
            let endIdx = startIdx;
            for (let i = startIdx; i < thinking.length; i++) {
                if (thinking[i] === '{') braceDepth++;
                if (thinking[i] === '}') {
                    braceDepth--;
                    if (braceDepth === 0) {
                        endIdx = i + 1;
                        break;
                    }
                }
            }

            if (endIdx > startIdx) {
                const block = thinking.substring(startIdx, endIdx);
                try {
                    JSON.parse(block);
                    jsonBlocks.push(block);
                } catch {
                    // 유효하지 않은 JSON은 무시
                }
                searchFrom = endIdx;
            }
        }

        return jsonBlocks.length > 0 ? jsonBlocks.join('\n') : null;
    }

    /**
     * 알려진 도구 이름인지 확인 (네이티브 tool_calls 검증용)
     */
    private isKnownToolName(name: string): boolean {
        return Object.values(Tool).includes(name as Tool);
    }

    /**
     * HTTP 요청 처리를 위한 헬퍼
     */
    private async makeHttpRequest(url: URL, requestData: any, options?: SendOptions): Promise<any> {
        return new Promise((resolve, reject) => {
            const isCloud = this.apiUrl.includes('ollama.com') || this.apiUrl.includes('cloud');
            const requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(isCloud ? { 'Authorization': `Bearer ${process.env.OLLAMA_API_KEY || ''}` } : {})
                }
            };

            const req = (url.protocol === 'https:' ? https : http).request(url, requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`Ollama API error (${res.statusCode}): ${data}`));
                            return;
                        }
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse JSON response: ${e}`));
                    }
                });
            });

            req.on('error', (err: NodeJS.ErrnoException) => {
                if (RETRYABLE_ERROR_CODES.includes(err.code || '')) {
                    reject(new RetryableNetworkError(`Network error (${err.code}): ${err.message}`));
                } else {
                    reject(new Error(`Network error: ${err.message}`));
                }
            });

            if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                    req.destroy();
                    reject(new Error('Request aborted'));
                });
            }

            req.write(JSON.stringify(requestData));
            req.end();
        });
    }

    /**
     * /api/chat 응답에서 텍스트 추출
     */
    private parseResponseFormat(response: any): string | null {
        if (!response) return null;
        if (typeof response === 'string') return response;

        // /api/chat 포맷
        if (response.message?.content) return response.message.content;

        // OpenAI 호환 포맷 (AdminModelApi 등)
        if (response.choices?.[0]?.message?.content) return response.choices[0].message.content;

        // 기타
        if (response.content) return response.content;
        if (response.text) return response.text;

        return null;
    }

    /**
     * 스트리밍 응답 메서드 (사용자 메시지만)
     */
    public async sendMessageStreaming(
        message: string,
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        return this.sendMessagesStreaming(
            [{ role: 'user', content: message }],
            onChunk,
            options
        );
    }

    /**
     * 시스템 프롬프트와 사용자 메시지를 별도 role로 스트리밍 전송
     */
    public async sendMessageWithSystemPromptStreaming(
        systemPrompt: string,
        userParts: any[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        return this.sendMessagesStreaming(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userParts.map(part => part.text).join('\n') }
            ],
            onChunk,
            options
        );
    }

    /**
     * /api/chat 포맷으로 스트리밍 전송하는 내부 메서드
     */
    private async sendMessagesStreaming(
        messages: OllamaMessage[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        const url = new URL(`${this.apiUrl}/api/chat`);
        const requestData: any = {
            model: this.modelName,
            messages,
            stream: true
        };

        if (options?.disableThinking) {
            requestData.think = false;
            console.log(`[OllamaApi] Streaming: Thinking disabled for this request (tool calling mode)`);
        }

        if (options?.nativeTools && options.nativeTools.length > 0) {
            requestData.tools = options.nativeTools;
            console.log(`[OllamaApi] Streaming: Native tool calling enabled, tools count: ${options.nativeTools.length}`);
        }

        console.log(`[OllamaApi] Sending streaming request to ${url.toString()} with model ${this.modelName}`);

        return new Promise((resolve, reject) => {
            const isCloud = this.apiUrl.includes('ollama.com') || this.apiUrl.includes('cloud');
            const requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(isCloud ? { 'Authorization': `Bearer ${process.env.OLLAMA_API_KEY || ''}` } : {})
                }
            };

            let fullText = '';
            let thinkingText = '';
            let ndjsonBuffer = '';
            const streamingToolCalls: Array<{ name: string; arguments: Record<string, any> }> = [];
            const req = (url.protocol === 'https:' ? https : http).request(url, requestOptions, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    let errorData = '';
                    res.on('data', (chunk) => { errorData += chunk; });
                    res.on('end', () => {
                        onChunk('', true);
                        reject(new Error(`Ollama API error (${res.statusCode}): ${errorData}`));
                    });
                    return;
                }

                res.on('data', (chunk) => {
                    ndjsonBuffer += chunk.toString();
                    const lines = ndjsonBuffer.split('\n');
                    ndjsonBuffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            const textChunk = parsed.message?.content || '';
                            const thinkChunk = parsed.message?.thinking || '';

                            if (textChunk) {
                                fullText += textChunk;
                                onChunk(textChunk, false);
                            }
                            if (thinkChunk) {
                                thinkingText += thinkChunk;
                            }
                            const nativeToolCalls = parsed.message?.tool_calls;
                            if (nativeToolCalls?.length) {
                                for (const tc of nativeToolCalls) {
                                    const fn = tc.function;
                                    const args = typeof fn.arguments === 'string'
                                        ? JSON.parse(fn.arguments)
                                        : (fn.arguments || {});
                                    streamingToolCalls.push({ name: fn.name, arguments: args });
                                }
                            }
                            if (parsed.done) {
                                onChunk('', true);
                            }
                        } catch {
                            // JSON 파싱 실패는 무시
                        }
                    }
                });

                res.on('end', () => {
                    // 버퍼에 남은 데이터 처리
                    if (ndjsonBuffer.trim()) {
                        try {
                            const parsed = JSON.parse(ndjsonBuffer);
                            const textChunk = parsed.message?.content || '';
                            const thinkChunk = parsed.message?.thinking || '';

                            if (textChunk) {
                                fullText += textChunk;
                                onChunk(textChunk, false);
                            }
                            if (thinkChunk) {
                                thinkingText += thinkChunk;
                            }
                            const nativeToolCallsEnd = parsed.message?.tool_calls;
                            if (nativeToolCallsEnd?.length) {
                                for (const tc of nativeToolCallsEnd) {
                                    const fn = tc.function;
                                    const args = typeof fn.arguments === 'string'
                                        ? JSON.parse(fn.arguments)
                                        : (fn.arguments || {});
                                    streamingToolCalls.push({ name: fn.name, arguments: args });
                                }
                            }
                        } catch {}
                    }

                    onChunk('', true);

                    if (streamingToolCalls.length > 0) {
                        const converted = streamingToolCalls
                            .map(tc => JSON.stringify({ tool: tc.name, ...tc.arguments }))
                            .join('\n');
                        const fullResult = thinkingText.trim()
                            ? `<think>${thinkingText}</think>\n${converted}`
                            : converted;
                        console.log(`[OllamaApi] Streaming: Native tool_calls converted, count: ${streamingToolCalls.length}`);
                        resolve(fullResult);
                        return;
                    }

                    if (thinkingText.trim()) {
                        let responseBody = fullText;
                        if (!fullText.trim()) {
                            const extracted = this.extractToolCallsFromThinking(thinkingText);
                            if (extracted) {
                                console.log(`[OllamaApi] Streaming: Extracted tool calls from thinking (${extracted.length} chars)`);
                                responseBody = extracted;
                            }
                        }
                        const result = `<think>${thinkingText}</think>${responseBody ? '\n' + responseBody : ''}`;
                        resolve(result);
                        return;
                    }

                    resolve(fullText);
                });
            });

            req.on('error', (err: NodeJS.ErrnoException) => {
                onChunk('', true);
                if (RETRYABLE_ERROR_CODES.includes(err.code || '')) {
                    reject(new RetryableNetworkError(`Network error (${err.code}): ${err.message}`));
                } else {
                    reject(new Error(`Network error: ${err.message}`));
                }
            });

            if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                    req.destroy();
                    onChunk('', true);
                    reject(new Error('Request aborted'));
                });
            }

            req.write(JSON.stringify(requestData));
            req.end();
        });
    }
}
