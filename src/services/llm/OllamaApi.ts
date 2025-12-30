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

                // 주의: 명시적으로 모델명이 설정된 경우(예: dropdown 선택) 
                // 저장된 설정을 덮어쓰지 않도록 체크가 필요할 수 있음
                // 여기서는 일단 remoteModel이 있을 때만 설정
                if (remoteModel && !this.modelName.includes('-cloud')) {
                    this.setModel(remoteModel);
                }
            } else {
                const localApiUrl = await stateManager.getOllamaApiUrl();
                const localEndpoint = await stateManager.getOllamaEndpoint();
                const localModel = await stateManager.getOllamaModel();

                if (localApiUrl) this.setApiUrl(localApiUrl);
                if (localEndpoint) this.setEndpoint(localEndpoint);

                // 로컬 설정 모델이 있고, 현재 모델이 기본값이거나 비어있는 경우에만 덮어씀
                if (localModel && (this.modelName === 'gemma2:9b' || !this.modelName)) {
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

                // XML 형식이 필요하지만 응답이 비어있는 경우 프롬프트 보강 후 재시도
                if (attempt < maxRetries && !currentOptions.xmlRetry) {
                    currentMessage = `${message}\n\nCRITICAL: Output ONLY XML tool calls in <tool_name>...</tool_name>. Do NOT put tool calls in thinking.`;
                    currentOptions.xmlRetry = true;
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

        console.log('[OllamaApi] Raw response received:', JSON.stringify(rawResponse).substring(0, 500) + '...');

        // 2. 응답 데이터 추출 (다양한 포맷 대응)
        const responseContent = this.parseResponseFormat(rawResponse);
        const thinkingContent = rawResponse.thinking || '';

        // [수정] 사용자의 요청대로 thinking 데이터를 우선시하거나 Junk 응답을 필터링함
        // 1. responseContent가 시스템 에코나 Junk(예: "Wait...", "We need result")인 경우 필터링 시도
        const isJunkResponse = responseContent && (
            responseContent.includes('=== Tool Execution Results') ||
            responseContent.includes('Wait: We should produce') ||
            responseContent.match(/^We need result\./i) ||
            (responseContent.length < 50 && responseContent.includes('read_file'))
        );

        // 2. thinking 데이터가 있고 response가 junk라면 thinking을 response로 사용
        if (thinkingContent && (!responseContent || isJunkResponse)) {
            console.log('[OllamaApi] Using thinking as primary response because response field is empty or junk');
            return thinkingContent;
        }

        // 3. 둘 다 있다면 (보통의 경우) thinking을 무시하고 responseContent만 사용
        // (사용자 피드백: 'think 패널 출력 지워줘' 반영)
        if (responseContent && !isJunkResponse) {
            return responseContent;
        }

        const extractedContent = responseContent || thinkingContent;

        // 4. 내용이 비어있을 경우 에러를 던져 상위 sendMessage에서 재시도하게 함
        if (!extractedContent || extractedContent.trim().length === 0) {
            throw new Error("LLM이 유효한 응답을 생성하지 못했습니다.");
        }

        return extractedContent;

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
