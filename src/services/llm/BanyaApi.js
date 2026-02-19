import * as vscode from 'vscode';
import { StateManager } from '../../core/managers/state/StateManager';
/**
 * Banya API Client
 * Banya Solar 모델과 통신하는 클라이언트
 */
export class BanyaApi {
    apiUrl;
    apiKey = '';
    modelName = 'Banya Solar:100b';
    extensionContext;
    // 모델 매핑: UI 표시 이름 -> 실제 API 모델 경로
    modelMapping = {
        'Banya Solar:100b': {
            path: '/mnt/models/Solar-Open-100B.q4_k_m.gguf',
            port: '8080'
        },
        'Banya Qwen-Coder:32b': {
            path: '/mnt/models/qwen2.5-coder-32b-instruct-q4_k_m',
            port: '8081'
        }
    };
    constructor(apiUrl, apiKey, extensionContext) {
        this.apiUrl = apiUrl || 'http://210.109.53.87:8083/v1/chat/completions';
        this.apiKey = apiKey || '';
        this.extensionContext = extensionContext;
    }
    getApiUrl() {
        return this.apiUrl;
    }
    getModel() {
        return this.modelName;
    }
    getCurrentModelName() {
        return this.modelName;
    }
    setModel(modelName) {
        this.modelName = modelName;
    }
    setApiUrl(apiUrl) {
        this.apiUrl = apiUrl;
    }
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }
    getApiKey() {
        return this.apiKey;
    }
    /**
     * 저장된 설정을 로드합니다
     */
    async loadSettingsFromStorage() {
        if (!this.extensionContext)
            return;
        try {
            const stateManager = StateManager.getInstance(this.extensionContext);
            const config = vscode.workspace.getConfiguration('codepilot');
            // API URL 로드
            const savedApiUrl = config.get('banyaApiUrl');
            if (savedApiUrl) {
                this.setApiUrl(savedApiUrl);
            }
            // API Key 로드 (Secret Storage에서)
            const savedApiKey = await this.extensionContext.secrets.get('codepilot.banyaApiKey');
            if (savedApiKey) {
                this.setApiKey(savedApiKey);
            }
            // 모델명 로드
            const savedModel = config.get('banyaModel');
            if (savedModel) {
                this.setModel(savedModel);
            }
        }
        catch (error) {
            console.error('[BanyaApi] Failed to load settings from storage:', error);
        }
    }
    /**
     * UI 모델명을 실제 API 모델 경로로 변환
     */
    getActualModelPath(modelName) {
        const mapping = this.modelMapping[modelName];
        return mapping?.path || modelName;
    }
    /**
     * 모델에 해당하는 X-Target-Port 값 반환
     */
    getTargetPort(modelName) {
        const mapping = this.modelMapping[modelName];
        return mapping?.port || '8080';
    }
    /**
     * 단순 메시지를 전송합니다
     */
    async sendMessage(message, options) {
        const maxRetries = options?.retries || 3;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.sendMessageInternal(message, undefined, options);
            }
            catch (error) {
                // AbortError는 재시도하지 않고 즉시 throw
                if (error.name === 'AbortError') {
                    throw error;
                }
                lastError = error;
                console.warn(`[BanyaApi] Attempt ${attempt}/${maxRetries} failed:`, error.message);
                if (attempt === maxRetries) {
                    throw lastError;
                }
                // 재시도 전 대기
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        throw lastError || new Error('Unknown error occurred');
    }
    /**
     * 시스템 프롬프트와 함께 메시지를 전송합니다
     */
    async sendMessageWithSystemPrompt(systemPrompt, userParts, options) {
        const maxRetries = options?.retries || 3;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.sendMessageInternal(userParts, systemPrompt, options);
            }
            catch (error) {
                // AbortError는 재시도하지 않고 즉시 throw
                if (error.name === 'AbortError') {
                    throw error;
                }
                lastError = error;
                console.warn(`[BanyaApi] Attempt ${attempt}/${maxRetries} failed:`, error.message);
                if (attempt === maxRetries) {
                    throw lastError;
                }
                // 재시도 전 대기
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        throw lastError || new Error('Unknown error occurred');
    }
    /**
     * 내부 메시지 전송 로직
     */
    async sendMessageInternal(messageOrParts, systemPrompt, options) {
        if (!this.apiKey || this.apiKey.trim() === '') {
            throw new Error('Banya API Key is not set. Please configure it in settings.');
        }
        // 메시지 구성
        const messages = [];
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }
        // 사용자 메시지 추가
        if (typeof messageOrParts === 'string') {
            messages.push({
                role: 'user',
                content: messageOrParts
            });
        }
        else {
            const userContent = messageOrParts.map(part => part.text || '').join('\n');
            messages.push({
                role: 'user',
                content: userContent
            });
        }
        // API 요청 바디
        const requestBody = {
            model: this.getActualModelPath(this.modelName),
            messages: messages,
            stream: false
        };
        const targetPort = this.getTargetPort(this.modelName);
        console.log('[BanyaApi] Sending request:', {
            url: this.apiUrl,
            model: requestBody.model,
            targetPort: targetPort,
            messageCount: messages.length
        });
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-Target-Port': targetPort
                },
                body: JSON.stringify(requestBody),
                signal: options?.signal
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error('[BanyaApi] API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`Banya API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();
            console.log('[BanyaApi] Response received:', {
                hasChoices: !!data.choices,
                choicesLength: data.choices?.length || 0
            });
            // 응답 파싱
            if (!data.choices || data.choices.length === 0) {
                throw new Error('Invalid response from Banya API: no choices');
            }
            const choice = data.choices[0];
            if (!choice.message || !choice.message.content) {
                throw new Error('Invalid response from Banya API: no content in message');
            }
            return choice.message.content;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('[BanyaApi] Request aborted');
                throw error;
            }
            console.error('[BanyaApi] Request failed:', error);
            throw error;
        }
    }
    /**
     * 모델 이름을 가져옵니다
     */
    getModelName() {
        return this.modelName;
    }
    /**
     * 스트리밍 응답을 위한 메서드
     * @param systemPrompt 시스템 프롬프트
     * @param userParts 사용자 메시지 파트
     * @param onChunk 청크 수신 콜백
     * @param options 요청 옵션
     */
    async sendMessageWithSystemPromptStreaming(systemPrompt, userParts, onChunk, options) {
        if (!this.apiKey || this.apiKey.trim() === '') {
            throw new Error('Banya API Key is not set. Please configure it in settings.');
        }
        // 메시지 구성
        const messages = [];
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }
        const userContent = userParts.map(part => part.text || '').join('\n');
        messages.push({
            role: 'user',
            content: userContent
        });
        // API 요청 바디 (스트리밍 활성화)
        const requestBody = {
            model: this.getActualModelPath(this.modelName),
            messages: messages,
            stream: true
        };
        const targetPort = this.getTargetPort(this.modelName);
        console.log('[BanyaApi] Sending streaming request:', {
            url: this.apiUrl,
            model: requestBody.model,
            targetPort: targetPort,
            messageCount: messages.length
        });
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-Target-Port': targetPort
                },
                body: JSON.stringify(requestBody),
                signal: options?.signal
            });
            if (!response.ok) {
                const errorText = await response.text();
                onChunk('', true);
                throw new Error(`Banya API error: ${response.status} ${response.statusText} - ${errorText}`);
            }
            if (!response.body) {
                onChunk('', true);
                throw new Error('No response body for streaming');
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
                for (const line of lines) {
                    const data = line.replace('data:', '').trim();
                    if (data === '[DONE]') {
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
                    }
                    catch (e) {
                        // JSON 파싱 실패는 무시
                    }
                }
            }
            onChunk('', true);
            return fullText;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.log('[BanyaApi] Streaming request aborted');
                onChunk('', true);
                throw error;
            }
            console.error('[BanyaApi] Streaming request failed:', error);
            onChunk('', true);
            throw error;
        }
    }
}
//# sourceMappingURL=BanyaApi.js.map