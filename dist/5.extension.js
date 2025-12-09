"use strict";
exports.id = 5;
exports.ids = [5];
exports.modules = {

/***/ 298:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OllamaApi = void 0;
const http = __importStar(__webpack_require__(151));
const https = __importStar(__webpack_require__(152));
const url_1 = __webpack_require__(153);
// @deprecated StorageService는 core StateManager로 대체됨
// import { StorageService } from '../services/storage';
const StateManager_1 = __webpack_require__(123);
class OllamaApi {
    apiUrl;
    endpoint = '/api/generate';
    modelName = 'gemma3:27b';
    // @deprecated storageService는 core StateManager로 대체됨
    // private storageService: StorageService | null;
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
                if (remoteModel)
                    this.setModel(remoteModel);
            }
            else {
                const localApiUrl = await stateManager.getOllamaApiUrl();
                const localEndpoint = await stateManager.getOllamaEndpoint();
                const localModel = await stateManager.getOllamaModel();
                if (localApiUrl)
                    this.setApiUrl(localApiUrl);
                if (localEndpoint)
                    this.setEndpoint(localEndpoint);
                if (localModel)
                    this.setModel(localModel);
            }
        }
        catch (error) {
            console.error('[OllamaApi] Failed to load settings from storage:', error);
        }
    }
    async sendMessage(message, options) {
        const maxRetries = options?.retries || 3;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.sendMessageInternal(message, options);
                return result;
            }
            catch (error) {
                lastError = error;
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
    async sendMessageInternal(message, options) {
        return new Promise((resolve, reject) => {
            const url = new url_1.URL(`${this.apiUrl}${this.endpoint}`);
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
                        }
                        else if (response.message && response.message.content) {
                            // 다른 형식의 응답 처리
                            resolve(response.message.content);
                        }
                        else if (response.content) {
                            // content 필드가 있는 경우
                            resolve(response.content);
                        }
                        else if (response.text) {
                            // text 필드가 있는 경우
                            resolve(response.text);
                        }
                        else if (response.choices && response.choices[0] && response.choices[0].message) {
                            // OpenAI 형식의 응답 처리
                            resolve(response.choices[0].message.content);
                        }
                        else if (typeof response === 'string') {
                            // 문자열 응답 처리
                            resolve(response);
                        }
                        else {
                            console.error('Ollama response format error:', response);
                            reject(new Error(`Invalid response format: ${JSON.stringify(response)}`));
                        }
                    }
                    catch (error) {
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
    async sendMessageWithSystemPrompt(systemPrompt, userParts, options) {
        const fullPrompt = `${systemPrompt}\n\n${userParts.map(part => part.text).join('\n')}`;
        return this.sendMessage(fullPrompt, options);
    }
}
exports.OllamaApi = OllamaApi;


/***/ })

};
;
//# sourceMappingURL=5.extension.js.map