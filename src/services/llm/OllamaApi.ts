import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { StateManager } from '../../core/managers/state/StateManager';
import { DEFAULT_OLLAMA_URL } from '../../core/config/ApiDefaults';

type SendOptions = { signal?: AbortSignal; retries?: number; xmlRetry?: boolean; disableThinking?: boolean };

/**
 * thinking 내용만 있고 response가 비어있을 때 발생하는 에러
 * sendMessage에서 thinking 내용을 추적하기 위해 사용
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
    private endpoint: string = '/api/generate';
    private modelName: string = '';
    private extensionContext: vscode.ExtensionContext | undefined;

    constructor(apiUrl?: string, endpoint?: string, extensionContext?: vscode.ExtensionContext) {
        this.apiUrl = apiUrl || DEFAULT_OLLAMA_URL;
        this.endpoint = endpoint || '/api/generate';
        this.extensionContext = extensionContext;
    }

    public getApiUrl(): string {
        return this.apiUrl;
    }

    public getEndpoint(): string {
        return this.endpoint;
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

    public setEndpoint(endpoint: string): void {
        this.endpoint = endpoint;
    }

    public async loadSettingsFromStorage(): Promise<void> {
        if (!this.extensionContext) return;

        try {
            const stateManager = StateManager.getInstance(this.extensionContext);
            const serverType = await stateManager.getOllamaServerType();
            if (serverType === 'remote') {
                const remoteApiUrl = await stateManager.getRemoteOllamaApiUrl();
                const remoteEndpoint = await stateManager.getRemoteOllamaEndpoint();
                const remoteModel = await stateManager.getRemoteOllamaModel();

                if (remoteApiUrl) this.setApiUrl(remoteApiUrl);
                if (remoteEndpoint) this.setEndpoint(remoteEndpoint);

                // 저장된 모델명이 있으면 설정
                if (remoteModel) {
                    this.setModel(remoteModel);
                }
            } else {
                const localApiUrl = await stateManager.getOllamaApiUrl();
                const localEndpoint = await stateManager.getOllamaEndpoint();
                const localModel = await stateManager.getOllamaModel();

                if (localApiUrl) this.setApiUrl(localApiUrl);
                if (localEndpoint) this.setEndpoint(localEndpoint);

                // 저장된 모델명이 있으면 설정
                if (localModel) {
                    this.setModel(localModel);
                }
            }
        } catch (error) {
            console.error('[OllamaApi] Failed to load settings from storage:', error);
        }
    }

    /**
     * 외부에서 호출하는 메인 메시지 전송 메서드
     */
    public async sendMessage(message: string, options?: SendOptions): Promise<string> {
        const maxRetries = options?.retries || 3;
        let lastError: Error | null = null;
        let lastThinking: string | null = null;
        let currentMessage = message;
        let currentOptions = { ...options };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.sendMessageInternal(currentMessage, currentOptions);
            } catch (error: any) {
                lastError = error;
                const errorMsg = error.message || '';
                console.warn(`[OllamaApi] Attempt ${attempt}/${maxRetries} failed:`, errorMsg);

                // thinking-only 에러인 경우 thinking 내용 추적
                if (error instanceof ThinkingOnlyError) {
                    lastThinking = error.thinking;
                }

                // 모델을 찾을 수 없는 경우(404)는 재시도해도 소용없으므로 즉시 중단
                if (errorMsg.includes('404') && errorMsg.includes('not found')) {
                    console.error(`[OllamaApi] Model '${this.modelName}' not found in Ollama. Please pull the model first.`);
                    break;
                }

                // 응답이 비어있거나 생각만 있는 경우 프롬프트 보강 후 재시도
                if (attempt < maxRetries) {
                    if (error instanceof ThinkingOnlyError) {
                        currentMessage = `${message}\n\nCRITICAL: You provided thoughts but NO actions or summary in the response field.
If you are NOT DONE, you MUST output actual tool calls (e.g., { "tool": "list_files", "path": "..." }) in your FINAL RESPONSE.
If you HAVE FINISHED all tasks, you MUST provide a final summary of your work in the FINAL RESPONSE.
Do NOT leave the response field empty. Every turn must produce a non-empty response.`;
                    } else if (!currentOptions.xmlRetry) {
                        currentMessage = `${message}\n\nCRITICAL: Output ONLY tool calls in { "tool": "...", "path": "..." } format. Do NOT put tool calls in thinking.`;
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
     * 실제 요청 및 파싱을 담당하는 내부 메서드
     */
    private async sendMessageInternal(message: string, options?: SendOptions): Promise<string> {
        const url = new URL(`${this.apiUrl}${this.endpoint}`);
        const requestData: any = {
            model: this.modelName,
            prompt: message,
            stream: false
        };

        // thinking 비활성화 (tool calling과 충돌 방지)
        if (options?.disableThinking) {
            requestData.think = false;
            console.log(`[OllamaApi] Thinking disabled for this request (tool calling mode)`);
        }

        console.log(`[OllamaApi] Sending request to ${url.toString()} with model ${this.modelName}`);

        // 1. 요청 로직을 별도 Promise로 분리
        const rawResponse = await this.makeHttpRequest(url, requestData, options);

        console.log('[OllamaApi] Raw response received:', JSON.stringify(rawResponse).length > 500 ? JSON.stringify(rawResponse).substring(0, 500) + '...' : JSON.stringify(rawResponse));

        // 2. 응답 데이터 추출 (다양한 포맷 대응)
        const responseContent = this.parseResponseFormat(rawResponse);
        const thinkingContent = rawResponse.thinking || '';

        // [수정] thinking 데이터를 함부로 response로 사용하지 않음
        // 1. responseContent가 시스템 에코나 Junk(예: "Wait...", "We need result")인 경우 필터링
        // 🔥 핵심: 도구 호출이 포함된 응답은 junk가 아님 (자연어와 섞여있어도 유효)
        const hasToolCall = responseContent && (
            /\{\s*["']tool["']\s*:\s*["']/.test(responseContent)
        );

        const isJunkResponse = responseContent && !hasToolCall && (
            responseContent.includes('=== Tool Execution Results') ||
            responseContent.includes('Wait: We should produce') ||
            responseContent.match(/^We need result\./i) ||
            // 단순히 read_file 문자열만 있고 태그 형식이 아니면서 매우 짧은 경우만 junk로 간주
            (responseContent.length < 20 && responseContent.includes('read_file') && !responseContent.includes('<'))
        );

        // 2. response가 유효하지 않은 경우 (비어있거나 junk인 경우)
        if (!responseContent || isJunkResponse) {
            // 생각 데이터는 있지만 실제 응답이 없는 경우
            // 🔥 수정: REVIEW 단계에서 텍스트 요약만 있는 경우도 있으므로,
            // response가 완전히 비어있을 때만 에러 (최소한 공백이라도 있으면 허용)
            if (thinkingContent && thinkingContent.length > 0 && (!responseContent || responseContent.trim() === '')) {
                console.log('[OllamaApi] Thought detected but response is empty. Triggering retry.');
                throw new ThinkingOnlyError(thinkingContent);
            }

            // 둘 다 없는 경우
            if (!responseContent && !thinkingContent) {
                throw new Error("LLM이 아무런 응답도 생성하지 않았습니다.");
            }
        }

        // 3. 정상적인 응답 반환 (최우선: responseContent)
        if (responseContent && !isJunkResponse) {
            return responseContent;
        }

        // 4. 최후의 보루: response가 없고 thinking만 있는 경우 (이미 위에서 에러를 던졌어야 하지만, 재시도 끝에 도달한 경우)
        const extractedContent = responseContent || thinkingContent || '';
        if (!extractedContent.trim()) {
            throw new Error("LLM이 유효한 응답을 생성하지 못했습니다.");
        }

        // 만약 여기까지 왔다면, 어쩔 수 없이 thinking이라도 반환 (하지만 이미 에러를 던졌을 것)
        return extractedContent;
    }

    /**
     * thinking 내용에서 tool call JSON을 추출
     * 모델이 tool call을 thinking에 넣고 response를 비우는 경우 fallback으로 사용
     */
    private extractToolCallsFromThinking(thinking: string): string | null {
        // { "tool": "..." } 패턴을 찾아 추출
        const toolCallPattern = /\{\s*"tool"\s*:\s*"[^"]+"/g;
        const matches = thinking.match(toolCallPattern);
        if (!matches || matches.length === 0) {
            return null;
        }

        // thinking에서 JSON 블록들을 추출
        const jsonBlocks: string[] = [];
        let searchFrom = 0;
        for (const match of matches) {
            const startIdx = thinking.indexOf(match, searchFrom);
            if (startIdx === -1) continue;

            // { 시작부터 매칭되는 } 까지 추출
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
                    JSON.parse(block); // 유효한 JSON인지 확인
                    jsonBlocks.push(block);
                } catch {
                    // 유효하지 않은 JSON은 무시
                }
                searchFrom = endIdx;
            }
        }

        if (jsonBlocks.length === 0) {
            return null;
        }

        return jsonBlocks.join('\n');
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

            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));

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
     * 다양한 API 응답 포맷을 통일된 문자열로 파싱
     */
    private parseResponseFormat(response: any): string | null {
        if (!response) return null;
        if (typeof response === 'string') return response;

        // Ollama 기본 포맷
        if (response.response) return response.response;

        // OpenAI / 기타 호환 포맷
        if (response.choices?.[0]?.message?.content) return response.choices[0].message.content;
        if (response.message?.content) return response.message.content;

        // 기타 content/text 필드
        if (response.content) return response.content;
        if (response.text) return response.text;

        return null;
    }

    public async sendMessageWithSystemPrompt(systemPrompt: string, userParts: any[], options?: SendOptions): Promise<string> {
        const fullPrompt = `${systemPrompt}\n\n${userParts.map(part => part.text).join('\n')}`;
        return this.sendMessage(fullPrompt, options);
    }

    /**
     * 스트리밍 응답을 위한 메서드
     * @param systemPrompt 시스템 프롬프트
     * @param userParts 사용자 메시지 파트
     * @param onChunk 청크 수신 콜백
     * @param options 요청 옵션
     */
    public async sendMessageWithSystemPromptStreaming(
        systemPrompt: string,
        userParts: any[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        const fullPrompt = `${systemPrompt}\n\n${userParts.map(part => part.text).join('\n')}`;
        return this.sendMessageStreaming(fullPrompt, onChunk, options);
    }

    /**
     * 스트리밍 메시지 전송 메서드
     * @param message 메시지
     * @param onChunk 청크 수신 콜백
     * @param options 요청 옵션
     */
    public async sendMessageStreaming(
        message: string,
        onChunk: (chunk: string, done: boolean) => void,
        options?: SendOptions
    ): Promise<string> {
        const url = new URL(`${this.apiUrl}${this.endpoint}`);
        const requestData: any = {
            model: this.modelName,
            prompt: message,
            stream: true
        };

        // thinking 비활성화 (tool calling과 충돌 방지)
        if (options?.disableThinking) {
            requestData.think = false;
            console.log(`[OllamaApi] Streaming: Thinking disabled for this request (tool calling mode)`);
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
                    // 마지막 요소는 불완전할 수 있으므로 버퍼에 보관
                    ndjsonBuffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.response) {
                                fullText += parsed.response;
                                onChunk(parsed.response, false);
                            }
                            if (parsed.thinking) {
                                thinkingText += parsed.thinking;
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
                            if (parsed.response) {
                                fullText += parsed.response;
                                onChunk(parsed.response, false);
                            }
                            if (parsed.thinking) {
                                thinkingText += parsed.thinking;
                            }
                        } catch {}
                    }

                    onChunk('', true);

                    // thinking 내용을 <think> 태그로 래핑하여 resolve 값에 포함
                    // onChunk에는 response만 전달됐으므로 UI 스트리밍에는 영향 없음
                    // ConversationManager가 <think> 태그를 추출하여 processing-steps에 표시
                    if (thinkingText.trim()) {
                        let responseBody = fullText;
                        // thinking에 tool call이 있고 response가 비어있으면 추출
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

            req.on('error', (err) => {
                onChunk('', true);
                reject(new Error(`Network error: ${err.message}`));
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
