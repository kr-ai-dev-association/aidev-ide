"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaApi = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const StateManager_1 = require("../../core/managers/state/StateManager");
class OllamaApi {
    apiUrl;
    endpoint = '/api/generate';
    modelName = '';
    extensionContext;
    constructor(apiUrl, endpoint, extensionContext) {
        this.apiUrl = apiUrl || 'http://localhost:11434';
        this.endpoint = endpoint || '/api/generate';
        this.extensionContext = extensionContext;
    }
    getApiUrl() {
        return this.apiUrl;
    }
    getEndpoint() {
        return this.endpoint;
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
    setEndpoint(endpoint) {
        this.endpoint = endpoint;
    }
    async loadSettingsFromStorage() {
        if (!this.extensionContext)
            return;
        try {
            const stateManager = StateManager_1.StateManager.getInstance(this.extensionContext);
            const serverType = await stateManager.getOllamaServerType();
            if (serverType === 'remote') {
                const remoteApiUrl = await stateManager.getRemoteOllamaApiUrl();
                const remoteEndpoint = await stateManager.getRemoteOllamaEndpoint();
                const remoteModel = await stateManager.getRemoteOllamaModel();
                if (remoteApiUrl)
                    this.setApiUrl(remoteApiUrl);
                if (remoteEndpoint)
                    this.setEndpoint(remoteEndpoint);
                // 저장된 모델명이 있으면 설정
                if (remoteModel) {
                    this.setModel(remoteModel);
                }
            }
            else {
                const localApiUrl = await stateManager.getOllamaApiUrl();
                const localEndpoint = await stateManager.getOllamaEndpoint();
                const localModel = await stateManager.getOllamaModel();
                if (localApiUrl)
                    this.setApiUrl(localApiUrl);
                if (localEndpoint)
                    this.setEndpoint(localEndpoint);
                // 저장된 모델명이 있으면 설정
                if (localModel) {
                    this.setModel(localModel);
                }
            }
        }
        catch (error) {
            console.error('[OllamaApi] Failed to load settings from storage:', error);
        }
    }
    /**
     * 외부에서 호출하는 메인 메시지 전송 메서드
     */
    async sendMessage(message, options) {
        const maxRetries = options?.retries || 3;
        let lastError = null;
        let currentMessage = message;
        let currentOptions = { ...options };
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.sendMessageInternal(currentMessage, currentOptions);
            }
            catch (error) {
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
                    }
                    else if (!currentOptions.xmlRetry) {
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
    async sendMessageInternal(message, options) {
        const url = new url_1.URL(`${this.apiUrl}${this.endpoint}`);
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
        const isJunkResponse = responseContent && (responseContent.includes('=== Tool Execution Results') ||
            responseContent.includes('Wait: We should produce') ||
            responseContent.match(/^We need result\./i) ||
            // 단순히 read_file 문자열만 있고 태그 형식이 아니면서 매우 짧은 경우만 junk로 간주
            (responseContent.length < 20 && responseContent.includes('read_file') && !responseContent.includes('<')));
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
    async makeHttpRequest(url, requestData, options) {
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
                    }
                    catch (e) {
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
    parseResponseFormat(response) {
        if (!response)
            return null;
        if (typeof response === 'string')
            return response;
        // Ollama 기본 포맷
        if (response.response)
            return response.response;
        // OpenAI / 기타 호환 포맷
        if (response.choices?.[0]?.message?.content)
            return response.choices[0].message.content;
        if (response.message?.content)
            return response.message.content;
        // 기타 content/text 필드
        if (response.content)
            return response.content;
        if (response.text)
            return response.text;
        return null;
    }
    async sendMessageWithSystemPrompt(systemPrompt, userParts, options) {
        const fullPrompt = `${systemPrompt}\n\n${userParts.map(part => part.text).join('\n')}`;
        return this.sendMessage(fullPrompt, options);
    }
}
exports.OllamaApi = OllamaApi;
//# sourceMappingURL=OllamaApi.js.map