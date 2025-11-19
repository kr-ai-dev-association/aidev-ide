// src/api/gemini.ts

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, Part, GenerateContentRequest, Content, RequestOptions } from '@google/generative-ai';

declare module '@google/generative-ai' {
    interface RequestOptions {
        signal?: AbortSignal;
    }
}


export class GeminiApi {
    private genAI: GoogleGenerativeAI | undefined;
    private model: any; // SDK의 GenerativeModel 타입으로 지정 권장 (GenerativeModel)
    public apiKey: string | undefined;

    private readonly MODEL_NAME = "gemini-flash-latest";
    //private readonly MODEL_NAME = "gemini-1.5-flash";
    //private readonly MODEL_NAME = "gemini-1.5-pro";
    //private readonly MODEL_NAME = "gemini-2.0-flash-exp"; // Experimental

    private readonly defaultGenerationConfig: GenerationConfig = {
        temperature: 0.7,
        topK: 1,
        topP: 1,
        maxOutputTokens: 500000,
    };

    private readonly defaultSafetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    constructor(apiKey?: string) {
        console.log('[GeminiApi] Constructor called', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length || 0,
            apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
            apiKeyTrimmed: apiKey ? apiKey.trim() : 'N/A'
        });
        if (apiKey && apiKey.trim() !== '') {
            this.apiKey = apiKey; // API 키를 인스턴스 변수에 저장
            this.initializeApi(apiKey);
        } else {
            console.warn('[GeminiApi] API Key is not provided at construction.');
            this.apiKey = undefined;
        }
    }

    private initializeApi(apiKey: string, systemInstructionText?: string): void {
        console.log('[GeminiApi] initializeApi called', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length || 0,
            apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
            apiKeyTrimmed: apiKey ? apiKey.trim() : 'N/A',
            hasSystemInstruction: !!systemInstructionText
        });
        try {
            if (!apiKey || apiKey.trim() === '') {
                console.error('[GeminiApi] API initialization failed: API key is empty');
                this.genAI = undefined;
                this.model = undefined;
                console.log('[GeminiApi] Initialization state after failure:', {
                    genAI: !!this.genAI,
                    model: !!this.model,
                    isInitialized: this.isInitialized()
                });
                return;
            }
            console.log('[GeminiApi] Creating GoogleGenerativeAI instance...');
            this.genAI = new GoogleGenerativeAI(apiKey);
            console.log('[GeminiApi] GoogleGenerativeAI instance created', {
                genAI: !!this.genAI,
                modelName: this.MODEL_NAME
            });
            
            console.log('[GeminiApi] Getting generative model...');
            this.model = this.genAI.getGenerativeModel({
                model: this.MODEL_NAME,
                safetySettings: this.defaultSafetySettings,
            });
            console.log('[GeminiApi] Generative model obtained', {
                model: !!this.model
            });
            
            console.log(`[GeminiApi] API initialized with model: ${this.MODEL_NAME}${systemInstructionText ? " and system instruction." : "."}`);
            
            // 초기화 후 검증
            const isInitialized = this.isInitialized();
            console.log('[GeminiApi] Initialization verification', {
                genAI: !!this.genAI,
                model: !!this.model,
                isInitialized: isInitialized
            });
            
            if (!isInitialized) {
                console.error('[GeminiApi] API initialization failed: genAI or model is null/undefined', {
                    genAI: !!this.genAI,
                    model: !!this.model,
                    genAIType: typeof this.genAI,
                    modelType: typeof this.model
                });
            }
        } catch (error) {
            console.error('[GeminiApi] Error initializing API:', error);
            console.error('[GeminiApi] Error details:', {
                errorName: (error as any)?.name,
                errorMessage: (error as any)?.message,
                errorStack: (error as any)?.stack,
                apiKeyLength: apiKey?.length || 0,
                apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A'
            });
            this.genAI = undefined;
            this.model = undefined;
            console.log('[GeminiApi] Initialization state after error:', {
                genAI: !!this.genAI,
                model: !!this.model,
                isInitialized: this.isInitialized()
            });
        }
    }

    updateApiKey(apiKey: string | undefined): boolean {
        console.log('[GeminiApi] updateApiKey called', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length || 0,
            apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
            previousApiKeyExists: !!this.apiKey
        });
        
        this.apiKey = apiKey;
        if (apiKey && apiKey.trim() !== '') {
            console.log('[GeminiApi] Updating API key and initializing...');
            this.initializeApi(apiKey);
            const initialized = this.isInitialized();
            console.log('[GeminiApi] updateApiKey result', {
                initialized: initialized,
                hasModel: !!this.model,
                hasGenAI: !!this.genAI
            });
            
            if (initialized) {
                console.log('[GeminiApi] API Key updated and initialized successfully.');
            } else {
                console.error('[GeminiApi] API Key updated but initialization failed. Full status:', {
                    hasApiKey: !!this.apiKey,
                    apiKeyLength: this.apiKey?.length || 0,
                    apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
                    hasModel: !!this.model,
                    hasGenAI: !!this.genAI,
                    modelType: typeof this.model,
                    genAIType: typeof this.genAI
                });
            }
            return initialized;
        } else {
            console.log('[GeminiApi] Removing API key...');
            this.genAI = undefined;
            this.model = undefined;
            console.warn('[GeminiApi] API Key removed. API is now uninitialized.');
            return false;
        }
    }

    public isInitialized(): boolean {
        const initialized = !!this.model && !!this.genAI;
        if (!initialized) {
            console.log('[GeminiApi] isInitialized check', {
                hasModel: !!this.model,
                hasGenAI: !!this.genAI,
                hasApiKey: !!this.apiKey,
                apiKeyLength: this.apiKey?.length || 0,
                modelType: typeof this.model,
                genAIType: typeof this.genAI
            });
        }
        return initialized;
    }

    async sendMessage(message: string, generationConfigParam?: GenerationConfig, options?: RequestOptions): Promise<string> {
        console.log('[GeminiApi] sendMessage called', {
            messageLength: message?.length || 0,
            isInitialized: this.isInitialized(),
            hasApiKey: !!this.apiKey,
            apiKeyLength: this.apiKey?.length || 0
        });
        
        // API 키가 있지만 초기화되지 않은 경우 재시도
        if (!this.isInitialized()) {
            console.warn('[GeminiApi] API not initialized, checking API key...', {
                hasApiKey: !!this.apiKey,
                apiKeyLength: this.apiKey?.length || 0,
                apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
                apiKeyTrimmed: this.apiKey ? this.apiKey.trim() : 'N/A'
            });
            
            if (this.apiKey && this.apiKey.trim() !== '') {
                console.warn('[GeminiApi] API not initialized but API key exists. Attempting to reinitialize...');
                this.initializeApi(this.apiKey);
                
                const reinitialized = this.isInitialized();
                console.log('[GeminiApi] Reinitialization result', {
                    success: reinitialized,
                    hasModel: !!this.model,
                    hasGenAI: !!this.genAI
                });
                
                if (!reinitialized) {
                    console.error('[GeminiApi] API reinitialization failed. Full status:', {
                        hasApiKey: !!this.apiKey,
                        apiKeyLength: this.apiKey?.length || 0,
                        apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
                        apiKeyTrimmed: this.apiKey ? this.apiKey.trim() : 'N/A',
                        hasModel: !!this.model,
                        hasGenAI: !!this.genAI,
                        modelType: typeof this.model,
                        genAIType: typeof this.genAI
                    });
                    throw new Error("AIDEV-IDE API is not initialized. Please set your API Key in the AIDEV-IDE settings (License section).");
                }
                console.log('[GeminiApi] API reinitialized successfully.');
            } else {
                console.error('[GeminiApi] API not initialized and no API key available', {
                    hasApiKey: !!this.apiKey,
                    apiKeyValue: this.apiKey || 'undefined',
                    apiKeyType: typeof this.apiKey
                });
                throw new Error("AIDEV-IDE API is not initialized. Please set your API Key in the AIDEV-IDE settings (License section).");
            }
        }

        try {
            // generateContent API를 사용해 요청 객체를 전달 (옵션과 함께 Abort 지원)
            const request: GenerateContentRequest = {
                contents: [{ role: "user", parts: [{ text: message }] }],
                generationConfig: generationConfigParam || this.defaultGenerationConfig,
            };
            const result = await this.model.generateContent(request, options);
            const response = result.response;
            const text = response.text();
            console.log('Banya Response (sendMessage):', text);
            return text;
        } catch (error: any) {
            console.error('Error calling AIDEV-IDE API (sendMessage):', error);
            console.error('API Key present:', !!this.apiKey);
            console.error('API Key length:', this.apiKey?.length || 0);
            console.error('Is initialized:', this.isInitialized());
            console.error('Error details:', {
                name: error?.name,
                message: error?.message,
                status: error?.status,
                statusText: error?.statusText,
                code: error?.code
            });
            return this.handleApiError(error);
        }
    }
    // <-- 수정 끝 -->

    // <-- 수정: sendMessageWithSystemPrompt 메서드에서 webSearch 기능 제거 -->
    // userPrompt: string 대신 userParts: Part[]를 받도록 변경
    async sendMessageWithSystemPrompt(systemInstructionText: string, userParts: Part[], options?: RequestOptions): Promise<string> {
        console.log('[GeminiApi] sendMessageWithSystemPrompt called', {
            systemInstructionLength: systemInstructionText?.length || 0,
            userPartsCount: userParts?.length || 0,
            isInitialized: this.isInitialized(),
            hasApiKey: !!this.apiKey,
            apiKeyLength: this.apiKey?.length || 0
        });
        
        // API 키가 있지만 초기화되지 않은 경우 재시도
        if (!this.isInitialized()) {
            console.warn('[GeminiApi] API not initialized, checking API key...', {
                hasApiKey: !!this.apiKey,
                apiKeyLength: this.apiKey?.length || 0,
                apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
                apiKeyTrimmed: this.apiKey ? this.apiKey.trim() : 'N/A'
            });
            
            if (this.apiKey && this.apiKey.trim() !== '') {
                console.warn('[GeminiApi] API not initialized but API key exists. Attempting to reinitialize...');
                this.initializeApi(this.apiKey, systemInstructionText);
                
                const reinitialized = this.isInitialized();
                console.log('[GeminiApi] Reinitialization result', {
                    success: reinitialized,
                    hasModel: !!this.model,
                    hasGenAI: !!this.genAI
                });
                
                if (!reinitialized) {
                    console.error('[GeminiApi] API reinitialization failed. Full status:', {
                        hasApiKey: !!this.apiKey,
                        apiKeyLength: this.apiKey?.length || 0,
                        apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
                        apiKeyTrimmed: this.apiKey ? this.apiKey.trim() : 'N/A',
                        hasModel: !!this.model,
                        hasGenAI: !!this.genAI,
                        modelType: typeof this.model,
                        genAIType: typeof this.genAI
                    });
                    throw new Error("AIDEV-IDE API is not initialized. Please set your API Key in the AIDEV-IDE settings (License section).");
                }
                console.log('[GeminiApi] API reinitialized successfully.');
            } else {
                console.error('[GeminiApi] API not initialized and no API key available', {
                    hasApiKey: !!this.apiKey,
                    apiKeyValue: this.apiKey || 'undefined',
                    apiKeyType: typeof this.apiKey
                });
                throw new Error("AIDEV-IDE API is not initialized. Please set your API Key in the AIDEV-IDE settings (License section).");
            }
        }

        try {
            // systemInstruction을 포함하는 request 형태로 호출 (SDK가 지원)
            const request: any = {
                systemInstruction: { role: "user", parts: [{ text: systemInstructionText }] },
                contents: [{ role: "user", parts: userParts }],
                generationConfig: this.defaultGenerationConfig,
                safetySettings: this.defaultSafetySettings,
                model: this.MODEL_NAME,
            };
            // @types 제한으로 any 사용. SDK는 request 내 systemInstruction를 허용
            const result = await (this.model as any).generateContent(request, options);

            const response = result.response;
            if (response.promptFeedback && response.promptFeedback.blockReason) {
                console.warn(`AIDEV-IDE API response blocked. Reason: ${response.promptFeedback.blockReason}`, response.promptFeedback);
                throw new Error(`Response was blocked by safety settings. Reason: ${response.promptFeedback.blockReason}. Please adjust your prompt or safety settings.`);
            }
            const text = response.text();
            // console.log('Banya Response (sendMessageWithSystemPrompt):', text);
            console.log('Banya Response (sendMessageWithSystemPrompt):', text);
            return text;

        } catch (error: any) {
            console.error('Error calling AIDEV-IDE API (sendMessageWithSystemPrompt):', error);
            console.error('API Key present:', !!this.apiKey);
            console.error('API Key length:', this.apiKey?.length || 0);
            console.error('Is initialized:', this.isInitialized());
            console.error('Error details:', {
                name: error?.name,
                message: error?.message,
                status: error?.status,
                statusText: error?.statusText,
                code: error?.code
            });
            return this.handleApiError(error);
        }
    }
    // <-- 수정 끝 -->

    private handleApiError(error: any): string {
        if (error.name === 'AbortError') {
            return "Error: AIDEV-IDE API call was cancelled.";
        }
        
        // API 키가 없거나 초기화되지 않은 경우
        if (!this.apiKey || !this.isInitialized()) {
            return "Error: AIDEV-IDE API is not initialized. Please set your API Key in the AIDEV-IDE settings (License section).";
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
                // Special marker that upstream can detect to trigger offline fallback
                return 'OFFLINE: Network unavailable for Gemini. Falling back is recommended.';
            }
            // Common explicit causes
            if (error.message.includes('quota') || error.message.includes('Quota')) {
                return "Error: AIDEV-IDE API quota exceeded. Please check your AIDEV-IDE License detail.";
            }
            if (error.message.includes('Billing account not found')) {
                return "Error: Billing account not found or not associated with the project. Please check your AIDEV-IDE payment account.";
            }
            if (error.message.includes('LOCATION_INVALID')) {
                return "Error: Invalid location or model not available in the region. Please check model availability.";
            }
            if (error.message.includes('Response was blocked')) {
                return error.message;
            }
            // Auth / key / permission patterns
            // HTTP 상태 코드나 에러 코드도 확인
            const statusCode = error.status || error.code || error.response?.status;
            if (statusCode === 401 || lowerMsg.includes('401') || lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid api key') || lowerMsg.includes('apikey') || lowerMsg.includes('api key') || lowerMsg.includes('api_key')) {
                console.error('Authentication error detected. API Key status:', {
                    hasApiKey: !!this.apiKey,
                    apiKeyLength: this.apiKey?.length || 0,
                    apiKeyPrefix: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'N/A',
                    isInitialized: this.isInitialized()
                });
                return 'Error: Authentication failed. Please verify your Gemini API key in Settings. The API key may be invalid or expired.';
            }
            if (statusCode === 403 || lowerMsg.includes('403') || lowerMsg.includes('forbidden')) {
                // API 키가 유출되었다고 보고된 경우
                if (lowerMsg.includes('leaked') || lowerMsg.includes('reported as leaked')) {
                    return 'Error: Your API key was reported as leaked. Please generate a new API key from Google AI Studio and update it in Settings.';
                }
                // 일반적인 권한 문제
                if (lowerMsg.includes('permission') || lowerMsg.includes('permission denied')) {
                    return 'Error: Access forbidden. Check project permissions and billing enablement.';
                }
                return 'Error: Access forbidden (403). Please check your API key permissions and billing account status.';
            }
            // Model/endpoint issues
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
            return `Error communicating with AIDEV-IDE API: AIDEV-IDE agent orchestration service aborted LLM calling`;
        }
        return "Error: An unknown error occurred while communicating with the AIDEV-IDE API.";
    }

    /**
     * Gemini API 연결을 테스트합니다.
     */
    async testConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            if (!this.apiKey) {
                return { success: false, error: 'No API key configured' };
            }

            // 간단한 테스트 요청
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);

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
