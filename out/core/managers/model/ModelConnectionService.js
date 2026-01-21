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
exports.ModelConnectionService = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const url_1 = require("url");
const services_1 = require("../../../services");
class ModelConnectionService {
    /**
     * Ollama 모델 목록을 조회합니다.
     */
    static async getOllamaModels(apiUrl) {
        const resolvedApiUrl = apiUrl || 'http://localhost:11434';
        const url = new url_1.URL('/api/tags', resolvedApiUrl);
        const client = url.protocol === 'https:' ? https : http;
        return new Promise((resolve, reject) => {
            const req = client.request({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        const list = Array.isArray(parsed?.models)
                            ? parsed.models.map((m) => m?.name).filter((n) => typeof n === 'string')
                            : [];
                        resolve(list);
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }
    /**
     * Ollama 연결을 테스트합니다.
     */
    static async testOllamaConnection(apiUrl) {
        try {
            const resolvedApiUrl = apiUrl || 'http://localhost:11434';
            const url = new url_1.URL('/api/tags', resolvedApiUrl);
            const client = url.protocol === 'https:' ? https : http;
            const data = await new Promise((resolve, reject) => {
                const req = client.request({
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                }, (res) => {
                    let buf = '';
                    res.on('data', (chunk) => (buf += chunk));
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(buf);
                            resolve(parsed);
                        }
                        catch (e) {
                            reject(e);
                        }
                    });
                });
                req.on('error', reject);
                req.end();
            });
            return { success: true, data };
        }
        catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    }
    /**
     * Ollama 모델을 다운로드합니다. 진행 상황은 콜백으로 전달됩니다.
     */
    static async downloadOllamaModel(modelName, apiUrl, onProgress) {
        const resolvedApiUrl = apiUrl || 'http://localhost:11434';
        const url = new url_1.URL('/api/pull', resolvedApiUrl);
        const client = url.protocol === 'https:' ? https : http;
        const requestData = JSON.stringify({ name: modelName });
        await new Promise((resolve, reject) => {
            const req = client.request({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestData),
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                    try {
                        const lines = data.split('\n');
                        for (const line of lines) {
                            if (!line.trim())
                                continue;
                            const parsed = JSON.parse(line);
                            if (parsed.status) {
                                const progress = parsed.completed && parsed.total
                                    ? Math.round((parsed.completed / parsed.total) * 100)
                                    : 0;
                                onProgress?.(progress, parsed.status);
                            }
                        }
                    }
                    catch {
                        // 진행 상황 파싱 실패는 무시
                    }
                });
                res.on('end', () => resolve());
                res.on('error', reject);
            });
            req.on('error', reject);
            req.write(requestData);
            req.end();
        });
    }
    /**
     * Gemini 연결을 테스트합니다.
     */
    static async testGeminiConnection(apiKey, geminiApi) {
        try {
            const api = geminiApi ?? new services_1.GeminiApi(apiKey);
            const result = await api.testConnection();
            return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
        }
        catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    }
}
exports.ModelConnectionService = ModelConnectionService;
//# sourceMappingURL=ModelConnectionService.js.map