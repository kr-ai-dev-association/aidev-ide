import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { StateManager } from '../../core/managers/state/StateManager';

type SendOptions = { signal?: AbortSignal; retries?: number; xmlRetry?: boolean };

export class OllamaApi {
    private apiUrl: string;
    private endpoint: string = '/api/generate';
    private modelName: string = 'gemma3:27b';
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
                if (remoteModel) this.setModel(remoteModel);
            } else {
                const localApiUrl = await stateManager.getOllamaApiUrl();
                const localEndpoint = await stateManager.getOllamaEndpoint();
                const localModel = await stateManager.getOllamaModel();

                if (localApiUrl) this.setApiUrl(localApiUrl);
                if (localEndpoint) this.setEndpoint(localEndpoint);
                if (localModel) this.setModel(localModel);
            }
        } catch (error) {
            console.error('[OllamaApi] Failed to load settings from storage:', error);
        }
    }

    public async sendMessage(message: string, options?: SendOptions): Promise<string> {
        const maxRetries = options?.retries || 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.sendMessageInternal(message, options);
                return result;
            } catch (error) {
                lastError = error as Error;
                console.warn(`[OllamaApi] Attempt ${attempt}/${maxRetries} failed:`, error);

                if (attempt < maxRetries) {
                    // 재시도 전 대기 (지수 백오프)
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.log(`[OllamaApi] Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
    }

    private async sendMessageInternal(message: string, options?: SendOptions): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.apiUrl}${this.endpoint}`);
            const isXmlRetry = !!options?.xmlRetry;

            const requestData = {
                model: this.modelName,
                prompt: message,
                stream: false
            };

            const requestOptions = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(JSON.stringify(requestData))
                }
            };

            const req = (url.protocol === 'https:' ? https : http).request(requestOptions, (res) => {
                let data = '';

                // HTTP 상태 코드 확인
                if (res.statusCode && res.statusCode >= 400) {
                    console.error(`Ollama API error: ${res.statusCode} ${res.statusMessage}`);
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        console.log('Ollama raw response:', response);

                        // Ollama API 응답 형식 확인 (여러 형식 지원)
                        if (response.response) {
                            // response 필드가 비어있지 않은 경우
                            if (response.response.trim().length > 0) {
                                resolve(response.response);
                            } else if (response.thinking) {
                                // response가 비어있고 thinking만 있는 경우
                                console.warn('[OllamaApi] Response is empty but thinking field exists (no XML). Trying XML-only retry.');
                                if (isXmlRetry) {
                                    reject(new Error(`LLM이 응답을 생성하지 못했습니다. (thinking: ${response.thinking.substring(0, 100)}...)`));
                                } else {
                                    // 비동기 재시도는 별도 async 함수로 처리 (await 사용 불가 영역)
                                    (async () => {
                                        const retryPrompt = `${message}\n\nCRITICAL: Output ONLY XML tool calls in <tool_name>...</tool_name>. Do NOT put tool calls in thinking.`;
                                        const retryResponse = await this.sendMessage(retryPrompt, { ...(options || {}), xmlRetry: true });
                                        resolve(retryResponse);
                                    })().catch((retryError: any) => reject(retryError));
                                }
                            } else {
                                // response가 비어있고 thinking도 없는 경우
                                console.error('[OllamaApi] Response is empty and no thinking field');
                                reject(new Error('LLM이 빈 응답을 반환했습니다.'));
                            }
                        } else if (response.message && response.message.content) {
                            // 다른 형식의 응답 처리
                            resolve(response.message.content);
                        } else if (response.content) {
                            // content 필드가 있는 경우
                            resolve(response.content);
                        } else if (response.text) {
                            // text 필드가 있는 경우
                            resolve(response.text);
                        } else if (response.choices && response.choices[0] && response.choices[0].message) {
                            // OpenAI 형식의 응답 처리
                            resolve(response.choices[0].message.content);
                        } else if (typeof response === 'string') {
                            // 문자열 응답 처리
                            resolve(response);
                        } else if (response.thinking) {
                            // response 필드가 없지만 thinking이 있는 경우
                            // thinking에서 tool call XML 패턴을 찾아서 시도
                            console.warn('[OllamaApi] No response field but thinking exists, attempting to extract tool calls from thinking');

                            // thinking에서 XML tool call 패턴 찾기
                            const toolCallPattern = /<(create_file|update_file|remove_file|read_file|list_files|search_files|run_command)>[\s\S]*?<\/\1>/gi;
                            const matches = response.thinking.match(toolCallPattern);

                            if (matches && matches.length > 0) {
                                // thinking에서 tool call을 찾았으면 이를 response로 사용
                                console.log('[OllamaApi] Found tool calls in thinking, using them as response');
                                resolve(matches.join('\n'));
                            } else {
                                // tool call이 없으면 한 번만 조용히 재시도 (XML만 출력하도록 재요청)
                                console.warn('[OllamaApi] No tool calls found in thinking, retrying with XML-only reminder');
                                if (isXmlRetry) {
                                    // 이미 재시도했으면 에러 반환
                                    reject(new Error(`LLM이 응답을 생성하지 못했습니다. (thinking: ${response.thinking.substring(0, 100)}...)`));
                                } else {
                                    (async () => {
                                        const retryPrompt = `${message}\n\nCRITICAL: Output ONLY XML tool calls in <tool_name>...</tool_name>. Do NOT put tool calls in thinking.`;
                                        const retryResponse = await this.sendMessage(retryPrompt, { ...(options || {}), xmlRetry: true });
                                        resolve(retryResponse);
                                    })().catch((retryError: any) => reject(retryError));
                                }
                            }
                        } else {
                            console.error('Ollama response format error:', response);
                            reject(new Error(`Invalid response format: ${JSON.stringify(response)}`));
                        }
                    } catch (error) {
                        console.error('Ollama response parse error:', error, 'Raw data:', data);
                        reject(new Error(`Failed to parse response: ${error}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
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

    public async sendMessageWithSystemPrompt(systemPrompt: string, userParts: any[], options?: SendOptions): Promise<string> {
        const fullPrompt = `${systemPrompt}\n\n${userParts.map(part => part.text).join('\n')}`;
        return this.sendMessage(fullPrompt, options);
    }
}

