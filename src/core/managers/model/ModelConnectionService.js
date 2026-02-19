import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { GeminiApi } from '../../../services';
export class ModelConnectionService {
    /**
     * Ollama 모델 목록을 조회합니다.
     */
    static async getOllamaModels(apiUrl) {
        const resolvedApiUrl = apiUrl || 'http://localhost:11434';
        const url = new URL('/api/tags', resolvedApiUrl);
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
            const url = new URL('/api/tags', resolvedApiUrl);
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
        const url = new URL('/api/pull', resolvedApiUrl);
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
            const api = geminiApi ?? new GeminiApi(apiKey);
            const result = await api.testConnection();
            return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
        }
        catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    }
}
//# sourceMappingURL=ModelConnectionService.js.map