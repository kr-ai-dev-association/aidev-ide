import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { StateManager } from '../../core/managers/state/StateManager';

type SendOptions = { signal?: AbortSignal; retries?: number; xmlRetry?: boolean };

export class OllamaApi {
    private apiUrl: string;
    private endpoint: string = '/api/generate';
    private modelName: string = '';
    private extensionContext: vscode.ExtensionContext | undefined;

    constructor(apiUrl?: string, endpoint?: string, extensionContext?: vscode.ExtensionContext) {
        this.apiUrl = apiUrl || 'http://localhost:11434';
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

    public getCurrentModelName(): string {
        return this.modelName;
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
        let currentMessage = message;
        let currentOptions = { ...options };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.sendMessageInternal(currentMessage, currentOptions);
            } catch (error: any) {
                lastError = error;
                const errorMsg = error.message || '';
                console.warn(`[OllamaApi] Attempt ${attempt}/${maxRetries} failed:`, errorMsg);

                // 모델을 찾을 수 없는 경우(404)는 재시도해도 소용없으므로 즉시 중단
                if (errorMsg.includes('404') && errorMsg.includes('not found')) {
                    console.error(`[OllamaApi] Model '${this.modelName}' not found in Ollama. Please pull the model first.`);
                    break;
                }

                // XML 형식이 필요하지만 응답이 비어있거나 생각만 있는 경우 프롬프트 보강 후 재시도
                if (attempt < maxRetries) {
                    if (error.message.includes("생각만 수행")) {
                        currentMessage = `${message}\n\nCRITICAL: You provided thoughts but NO actions or summary in the response field. 
If you are NOT DONE, you MUST output actual XML tool calls (e.g., <list_files>, <read_file>, <plan>) in your FINAL RESPONSE. 
If you HAVE FINISHED all tasks, you MUST provide a final summary of your work in the FINAL RESPONSE. 
Do NOT leave the response field empty. Every turn must produce a non-empty response.`;
                    } else if (!currentOptions.xmlRetry) {
                        currentMessage = `${message}\n\nCRITICAL: Output ONLY XML tool calls in <tool_name>...</tool_name>. Do NOT put tool calls in thinking.`;
                        currentOptions.xmlRetry = true;
                    }
                }

                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    /**
     * 실제 요청 및 파싱을 담당하는 내부 메서드
     */
    private async sendMessageInternal(message: string, options?: SendOptions): Promise<string> {
        const url = new URL(`${this.apiUrl}${this.endpoint}`);
        const requestData = {
            model: this.modelName,
            prompt: message,
            stream: false
        };

        console.log(`[OllamaApi] Sending request to ${url.toString()} with model ${this.modelName}`);

        // 1. 요청 로직을 별도 Promise로 분리
        const rawResponse = await this.makeHttpRequest(url, requestData, options);

        console.log('[OllamaApi] Raw response received:', JSON.stringify(rawResponse).length > 500 ? JSON.stringify(rawResponse).substring(0, 500) + '...' : JSON.stringify(rawResponse));

        // 2. 응답 데이터 추출 (다양한 포맷 대응)
        const responseContent = this.parseResponseFormat(rawResponse);
        const thinkingContent = rawResponse.thinking || '';

        // [수정] thinking 데이터를 함부로 response로 사용하지 않음
        // 1. responseContent가 시스템 에코나 Junk(예: "Wait...", "We need result")인 경우 필터링
        const isJunkResponse = responseContent && (
            responseContent.includes('=== Tool Execution Results') ||
            responseContent.includes('Wait: We should produce') ||
            responseContent.match(/^We need result\./i) ||
            // 단순히 read_file 문자열만 있고 태그 형식이 아니면서 매우 짧은 경우만 junk로 간주
            (responseContent.length < 20 && responseContent.includes('read_file') && !responseContent.includes('<'))
        );

        // 2. response가 유효하지 않은 경우 (비어있거나 junk인 경우)
        if (!responseContent || isJunkResponse) {
            // 생각 데이터는 있지만 실제 응답이 없는 경우, 에러를 던져 재시도 유도 (xmlRetry 옵션 활용)
            if (thinkingContent && thinkingContent.length > 0) {
                console.log('[OllamaApi] Thought detected but response is empty or junk. Triggering retry for XML output.');
                // 텔레메트리나 로그를 위해 thinking 내용을 에러에 포함
                throw new Error(`모델이 생각만 수행했습니다. 도구 호출이 포함된 답변이 필요합니다. (Thinking length: ${thinkingContent.length})`);
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
}
