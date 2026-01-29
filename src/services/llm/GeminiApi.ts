// src/services/gemini.ts
// v9.1.0: REST API 직접 호출 방식 (ByteString 에러 해결)

/**
 * Part 타입 정의
 */
export interface Part {
    text?: string;
    inlineData?: {
        data: string;
        mimeType: string;
    };
}

/**
 * 요청 옵션 타입
 */
export interface RequestOptions {
    signal?: AbortSignal;
}

/**
 * Native Function Calling 응답 타입
 */
export interface GeminiNativeResponse {
    text: string;
    functionCalls?: Array<{
        name: string;
        args: Record<string, any>;
    }>;
    rawResponse?: any;
}

/**
 * Safety 설정
 */
const SAFETY_SETTINGS = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiApi {
    public apiKey: string | undefined;
    private modelName: string = "gemini-3-pro-preview";

    private readonly defaultGenerationConfig = {
        temperature: 0.7,
        topK: 1,
        topP: 1,
        maxOutputTokens: 500000,
    };

    constructor(apiKey?: string) {
        console.log('[GeminiApi] Constructor called', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length || 0,
            apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
        });
        if (apiKey && apiKey.trim() !== '') {
            this.apiKey = apiKey;
        } else {
            console.warn('[GeminiApi] API Key is not provided at construction.');
            this.apiKey = undefined;
        }
    }

    updateApiKey(apiKey: string | undefined): boolean {
        console.log('[GeminiApi] updateApiKey called', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length || 0,
            previousApiKeyExists: !!this.apiKey
        });

        this.apiKey = apiKey;
        if (apiKey && apiKey.trim() !== '') {
            console.log('[GeminiApi] API Key updated successfully.');
            return true;
        } else {
            console.warn('[GeminiApi] API Key removed.');
            return false;
        }
    }

    updateModelName(modelName: string): void {
        console.log(`[GeminiApi] Updating model name to: ${modelName}`);
        this.modelName = modelName;
    }

    public getModelName(): string {
        return this.modelName;
    }

    public getApiKey(): string | undefined {
        return this.apiKey;
    }

    public isInitialized(): boolean {
        return !!this.apiKey;
    }

    /**
     * Part[] 배열을 API 형식으로 변환
     */
    private partsToApiFormat(parts: Part[]): any[] {
        return parts.map(part => {
            if (part.inlineData) {
                return { inlineData: part.inlineData };
            }
            return { text: part.text || '' };
        });
    }

    /**
     * REST API 직접 호출 (429 자동 재시도 포함)
     */
    private async callApi(endpoint: string, body: any, signal?: AbortSignal, retryCount: number = 0): Promise<any> {
        const MAX_RETRIES = 3;
        const url = `${API_BASE_URL}${endpoint}?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            // 429 Rate Limit: exponential backoff 재시도
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000; // 1s, 2s, 4s + jitter
                console.log(`[GeminiApi] Rate limited (429). Retrying in ${Math.round(delay)}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApi(endpoint, body, signal, retryCount + 1);
            }

            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error?.message) {
                    errorMessage = errorJson.error.message;
                }
            } catch {
                // JSON 파싱 실패 시 원본 텍스트 사용
                if (errorText) {
                    errorMessage = errorText;
                }
            }
            throw new Error(errorMessage);
        }

        return response.json();
    }

    /**
     * 스트리밍 REST API 호출 (429 자동 재시도 포함)
     * Gemini API는 JSON 배열 형태로 스트리밍 응답을 반환
     */
    private async callApiStreaming(
        endpoint: string,
        body: any,
        onChunk: (chunk: string, done: boolean) => void,
        signal?: AbortSignal,
        retryCount: number = 0
    ): Promise<string> {
        const MAX_RETRIES = 3;
        const url = `${API_BASE_URL}${endpoint}?key=${this.apiKey}`;

        console.log('[GeminiApi] Starting streaming request to:', endpoint);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            // 429 Rate Limit: exponential backoff 재시도
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000; // 1s, 2s, 4s + jitter
                console.log(`[GeminiApi] Rate limited (429). Retrying in ${Math.round(delay)}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApiStreaming(endpoint, body, onChunk, signal, retryCount + 1);
            }

            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error?.message) {
                    errorMessage = errorJson.error.message;
                }
            } catch {
                if (errorText) {
                    errorMessage = errorText;
                }
            }
            throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Gemini 스트리밍 응답은 JSON 객체들의 배열 형태
                // 각 청크는 완전한 JSON이 아닐 수 있으므로 파싱 시도
                // 형식: [{"candidates":[...]},{"candidates":[...]},...]

                // 완전한 JSON 객체 추출 시도
                let startIdx = 0;
                while (startIdx < buffer.length) {
                    // '[' 또는 ',' 다음의 '{' 찾기
                    let objStart = buffer.indexOf('{', startIdx);
                    if (objStart === -1) break;

                    // 중괄호 매칭으로 완전한 객체 찾기
                    let depth = 0;
                    let objEnd = -1;
                    let inString = false;
                    let escape = false;

                    for (let i = objStart; i < buffer.length; i++) {
                        const char = buffer[i];

                        if (escape) {
                            escape = false;
                            continue;
                        }

                        if (char === '\\' && inString) {
                            escape = true;
                            continue;
                        }

                        if (char === '"') {
                            inString = !inString;
                            continue;
                        }

                        if (!inString) {
                            if (char === '{') depth++;
                            else if (char === '}') {
                                depth--;
                                if (depth === 0) {
                                    objEnd = i;
                                    break;
                                }
                            }
                        }
                    }

                    if (objEnd === -1) {
                        // 완전한 객체가 없음 - 다음 청크 대기
                        break;
                    }

                    // 완전한 JSON 객체 추출
                    const jsonStr = buffer.substring(objStart, objEnd + 1);
                    startIdx = objEnd + 1;

                    try {
                        const json = JSON.parse(jsonStr);
                        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (text) {
                            fullText += text;
                            onChunk(text, false);
                        }
                    } catch (e) {
                        // JSON 파싱 실패 - 무시
                        console.warn('[GeminiApi] Failed to parse streaming chunk:', e);
                    }
                }

                // 처리된 부분 제거
                if (startIdx > 0) {
                    buffer = buffer.substring(startIdx);
                }
            }
        } finally {
            reader.releaseLock();
        }

        console.log('[GeminiApi] Streaming completed, total length:', fullText.length);
        onChunk('', true);
        return fullText;
    }

    async sendMessage(message: string, generationConfigParam?: any, options?: RequestOptions): Promise<string> {
        console.log('[GeminiApi] sendMessage called', {
            messageLength: message?.length || 0,
            hasApiKey: !!this.apiKey,
        });

        if (!this.apiKey) {
            throw new Error("CODEPILOT API is not initialized. Please set your API Key in the CODEPILOT settings (License section).");
        }

        try {
            const body = {
                contents: [{ role: 'user', parts: [{ text: message }] }],
                generationConfig: { ...this.defaultGenerationConfig, ...generationConfigParam },
                safetySettings: SAFETY_SETTINGS,
            };

            const result = await this.callApi(`/models/${this.modelName}:generateContent`, body, options?.signal);
            return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (error: any) {
            console.error('Error calling CODEPILOT API (sendMessage):', error);
            return this.handleApiError(error);
        }
    }

    /**
     * 시스템 프롬프트와 함께 메시지 전송
     */
    async sendMessageWithSystemPrompt(systemInstructionText: string, userParts: Part[], options?: RequestOptions): Promise<string> {
        if (!this.apiKey) {
            throw new Error("CODEPILOT API is not initialized. Please set your API Key in the CODEPILOT settings (License section).");
        }

        try {
            const apiParts = this.partsToApiFormat(userParts);

            const body = {
                systemInstruction: { parts: [{ text: systemInstructionText }] },
                contents: [{ role: 'user', parts: apiParts }],
                generationConfig: this.defaultGenerationConfig,
                safetySettings: SAFETY_SETTINGS,
            };

            const result = await this.callApi(`/models/${this.modelName}:generateContent`, body, options?.signal);

            // 차단 확인
            if (result.promptFeedback?.blockReason) {
                const blockReason = result.promptFeedback.blockReason;
                console.warn(`CODEPILOT API response blocked. Reason: ${blockReason}`);
                throw new Error(`Response was blocked by safety settings. Reason: ${blockReason}. Please adjust your prompt or safety settings.`);
            }

            return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (error: any) {
            console.error('Error calling CODEPILOT API (sendMessageWithSystemPrompt):', error);
            return this.handleApiError(error);
        }
    }

    private handleApiError(error: any): string {
        if (error.name === 'AbortError') {
            return "Error: API call was cancelled.";
        }

        if (!this.apiKey) {
            return "Error: CODEPILOT API is not initialized. Please set your API Key in the CODEPILOT settings (License section).";
        }

        if (error.message) {
            const lowerMsg = String(error.message).toLowerCase();
            const isOffline =
                lowerMsg.includes('err_internet_disconnected') ||
                lowerMsg.includes('fetch failed') ||
                lowerMsg.includes('network error') ||
                lowerMsg.includes('network is unreachable') ||
                lowerMsg.includes('getaddrinfo') ||
                lowerMsg.includes('enotfound') ||
                lowerMsg.includes('offline');

            if (isOffline) {
                return 'OFFLINE: Network unavailable for Gemini. Falling back is recommended.';
            }
            if (error.message.includes('quota') || error.message.includes('Quota')) {
                return "Error: CODEPILOT API quota exceeded. Please check your CODEPILOT License detail.";
            }
            if (error.message.includes('Billing account not found')) {
                return "Error: Billing account not found or not associated with the project. Please check your CODEPILOT payment account.";
            }
            if (error.message.includes('LOCATION_INVALID')) {
                return "Error: Invalid location or model not available in the region. Please check model availability.";
            }
            if (error.message.includes('Response was blocked')) {
                return error.message;
            }
            const statusCode = error.status || error.code || error.response?.status;
            if (statusCode === 401 || lowerMsg.includes('401') || lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid api key') || lowerMsg.includes('apikey') || lowerMsg.includes('api key') || lowerMsg.includes('api_key')) {
                return 'Error: Authentication failed. Please verify your Gemini API key in Settings. The API key may be invalid or expired.';
            }
            if (statusCode === 403 || lowerMsg.includes('403') || lowerMsg.includes('forbidden')) {
                if (lowerMsg.includes('leaked') || lowerMsg.includes('reported as leaked')) {
                    return 'Error: Your API key was reported as leaked. Please generate a new API key from Google AI Studio and update it in Settings.';
                }
                if (lowerMsg.includes('permission') || lowerMsg.includes('permission denied')) {
                    return 'Error: Access forbidden. Check project permissions and billing enablement.';
                }
                return 'Error: Access forbidden (403). Please check your API key permissions and billing account status.';
            }
            if (lowerMsg.includes('404') || lowerMsg.includes('not found') || lowerMsg.includes('model not found')) {
                return 'Error: API endpoint/model not found. Verify model name and API endpoint.';
            }
            if (lowerMsg.includes('429') || lowerMsg.includes('rate limit') || lowerMsg.includes('too many requests')) {
                return 'Error: Rate limit exceeded. Please slow down and try again shortly.';
            }
            if (lowerMsg.includes('deadline exceeded') || lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
                return 'Error: Request timed out. Please retry or reduce request size.';
            }
            if (lowerMsg.includes('internal') || lowerMsg.includes('server error') || lowerMsg.includes('500')) {
                return 'Error: Upstream server error. Please try again later.';
            }
            return `Error communicating with CODEPILOT: ${error.message}`;
        }
        return "Error: An unknown error occurred while communicating with the CODEPILOT.";
    }

    /**
     * 스트리밍 응답을 위한 메서드
     */
    async sendMessageWithSystemPromptStreaming(
        systemInstructionText: string,
        userParts: Part[],
        onChunk: (chunk: string, done: boolean) => void,
        options?: RequestOptions
    ): Promise<string> {
        if (!this.apiKey) {
            throw new Error("CODEPILOT API is not initialized. Please set your API Key in the CODEPILOT settings (License section).");
        }

        try {
            const apiParts = this.partsToApiFormat(userParts);

            const body = {
                systemInstruction: { parts: [{ text: systemInstructionText }] },
                contents: [{ role: 'user', parts: apiParts }],
                generationConfig: this.defaultGenerationConfig,
                safetySettings: SAFETY_SETTINGS,
            };

            return await this.callApiStreaming(
                `/models/${this.modelName}:streamGenerateContent`,
                body,
                onChunk,
                options?.signal
            );
        } catch (error: any) {
            console.error('Error calling CODEPILOT API (streaming):', error);
            onChunk('', true);
            return this.handleApiError(error);
        }
    }

    /**
     * Gemini API 연결을 테스트합니다.
     */
    async testConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            if (!this.apiKey) {
                return { success: false, error: 'No API key configured' };
            }

            const response = await fetch(`${API_BASE_URL}/models?key=${this.apiKey}`);

            if (response.ok) {
                const data = await response.json();
                return { success: true, data };
            } else {
                return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}
