import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { StorageService } from '../services/storage';

export class OllamaApi {
    private apiUrl: string;
    private endpoint: string = '/api/generate';
    private modelName: string = 'gemma3:27b';
    private storageService: StorageService | null;

    constructor(apiUrl?: string, endpoint?: string, storageService?: StorageService) {
        this.apiUrl = apiUrl || 'http://localhost:11434';
        this.endpoint = endpoint || '/api/generate';
        this.storageService = storageService || null;
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
        if (!this.storageService) return;

        try {
            const serverType = await this.storageService.getOllamaServerType();
            if (serverType === 'remote') {
                const remoteApiUrl = await this.storageService.getRemoteOllamaApiUrl();
                const remoteEndpoint = await this.storageService.getRemoteOllamaEndpoint();
                const remoteModel = await this.storageService.getRemoteOllamaModel();

                if (remoteApiUrl) this.setApiUrl(remoteApiUrl);
                if (remoteEndpoint) this.setEndpoint(remoteEndpoint);
                if (remoteModel) this.setModel(remoteModel);
            } else {
                const localApiUrl = await this.storageService.getOllamaApiUrl();
                const localEndpoint = await this.storageService.getOllamaEndpoint();
                const localModel = await this.storageService.getOllamaModel();

                if (localApiUrl) this.setApiUrl(localApiUrl);
                if (localEndpoint) this.setEndpoint(localEndpoint);
                if (localModel) this.setModel(localModel);
            }
        } catch (error) {
            console.error('[OllamaApi] Failed to load settings from storage:', error);
        }
    }

    public async sendMessage(message: string, options?: { signal?: AbortSignal, retries?: number }): Promise<string> {
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

    private async sendMessageInternal(message: string, options?: { signal?: AbortSignal }): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.apiUrl}${this.endpoint}`);

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
                            resolve(response.response);
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

    public async sendMessageWithSystemPrompt(systemPrompt: string, userParts: any[], options?: { signal?: AbortSignal }): Promise<string> {
        const fullPrompt = `${systemPrompt}\n\n${userParts.map(part => part.text).join('\n')}`;
        return this.sendMessage(fullPrompt, options);
    }
}
