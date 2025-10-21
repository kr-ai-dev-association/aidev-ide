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

    private readonly MODEL_NAME = "gemini-2.5-flash-preview-05-20";
    //private readonly MODEL_NAME = "gemini-2.5-pro-preview-05-06";

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
        if (apiKey && apiKey.trim() !== '') {
            this.initializeApi(apiKey);
        } else {
            console.warn('AIDEV-IDE API Key is not provided at construction.');
        }
    }

    private initializeApi(apiKey: string, systemInstructionText?: string): void {
        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: this.MODEL_NAME,
                safetySettings: this.defaultSafetySettings,
            });
            // console.log(`AIDEV-IDE API initialized with model: ${this.MODEL_NAME}${systemInstructionText ? " and system instruction." : "."}`);
        } catch (error) {
            console.error('Error initializing AIDEV-IDE API:', error);
            this.genAI = undefined;
            this.model = undefined;
        }
    }

    updateApiKey(apiKey: string | undefined): void {
        this.apiKey = apiKey;
        if (apiKey && apiKey.trim() !== '') {
            this.initializeApi(apiKey);
            console.log('AIDEV-IDE API Key updated.');
        } else {
            this.genAI = undefined;
            this.model = undefined;
            console.warn('AIDEV-IDE API Key removed. API is now uninitialized.');
        }
    }

    public isInitialized(): boolean {
        return !!this.model && !!this.genAI;
    }

    // <-- 수정: sendMessage 메서드에 RequestOptions를 두 번째 인자로 전달 -->
    async sendMessage(message: string, generationConfigParam?: GenerationConfig, options?: RequestOptions): Promise<string> {
        if (!this.isInitialized()) {
            throw new Error("AIDEV-IDE API is not initialized. Please set your API Key in the AIDEV-IDE settings (License section).");
        }

        try {
            const chat = this.model.startChat({
                generationConfig: generationConfigParam || this.defaultGenerationConfig,
            });
            const request: GenerateContentRequest = {
                contents: [{ role: "user", parts: [{ text: message }] }],
            };
            // <-- 수정: chat.sendMessage 호출 시 request와 options를 분리하여 두 번째 인자로 전달 -->
            const result = await chat.sendMessage(request, options); // RequestOptions를 두 번째 인자로 전달
            // <-- 수정 끝 -->

            const response = result.response;
            const text = response.text();
            console.log('Banya Response (sendMessage):', text);
            return text;
        } catch (error: any) {
            console.error('Error calling AIDEV-IDE API (sendMessage):', error);
            return this.handleApiError(error);
        }
    }
    // <-- 수정 끝 -->

    // <-- 수정: sendMessageWithSystemPrompt 메서드에서 webSearch 기능 제거 -->
    // userPrompt: string 대신 userParts: Part[]를 받도록 변경
    async sendMessageWithSystemPrompt(systemInstructionText: string, userParts: Part[], options?: RequestOptions): Promise<string> {
        if (!this.genAI) {
            throw new Error("AIDEV-IDE is not initialized. Please set your API Key.");
        }

        try {
            const tempModel = this.genAI.getGenerativeModel({
                model: this.MODEL_NAME,
                systemInstruction: systemInstructionText,
                safetySettings: this.defaultSafetySettings,
            });

            const request: GenerateContentRequest = {
                contents: [{ role: "user", parts: userParts }], // userParts 배열 사용
                generationConfig: this.defaultGenerationConfig,
            };

            // <-- 수정: generateContent 호출 시 request와 options를 분리하여 두 번째 인자로 전달 -->
            const result = await tempModel.generateContent(request, options); // RequestOptions를 두 번째 인자로 전달
            // <-- 수정 끝 -->

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
            return this.handleApiError(error);
        }
    }
    // <-- 수정 끝 -->

    private handleApiError(error: any): string {
        if (error.name === 'AbortError') {
            return "Error: AIDEV-IDE API call was cancelled.";
        }
        if (error.message) {
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
