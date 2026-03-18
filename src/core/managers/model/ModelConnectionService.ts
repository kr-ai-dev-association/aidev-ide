import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { DEFAULT_OLLAMA_URL } from '../../config/ApiDefaults';

export interface ConnectionTestResult {
    success: boolean;
    data?: any;
    error?: string;
}

export class ModelConnectionService {
    /**
     * Ollama 모델 목록을 조회합니다.
     */
    static async getOllamaModels(apiUrl?: string): Promise<string[]> {
        const resolvedApiUrl = apiUrl || DEFAULT_OLLAMA_URL;
        const url = new URL('/api/tags', resolvedApiUrl);
        const client = url.protocol === 'https:' ? https : http;

        return new Promise<string[]>((resolve, reject) => {
            const req = client.request(
                {
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            const list: string[] = Array.isArray(parsed?.models)
                                ? parsed.models.map((m: any) => m?.name).filter((n: any) => typeof n === 'string')
                                : [];
                            resolve(list);
                        } catch (e) {
                            reject(e);
                        }
                    });
                },
            );
            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Ollama 연결을 테스트합니다.
     */
    static async testOllamaConnection(apiUrl?: string): Promise<ConnectionTestResult> {
        try {
            const resolvedApiUrl = apiUrl || DEFAULT_OLLAMA_URL;
            const url = new URL('/api/tags', resolvedApiUrl);
            const client = url.protocol === 'https:' ? https : http;

            const data = await new Promise<any>((resolve, reject) => {
                const req = client.request(
                    {
                        hostname: url.hostname,
                        port: url.port || (url.protocol === 'https:' ? 443 : 80),
                        path: url.pathname + url.search,
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                    },
                    (res) => {
                        let buf = '';
                        res.on('data', (chunk) => (buf += chunk));
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(buf);
                                resolve(parsed);
                            } catch (e) {
                                reject(e);
                            }
                        });
                    },
                );
                req.on('error', reject);
                req.end();
            });

            return { success: true, data };
        } catch (error: any) {
            return { success: false, error: error?.message || String(error) };
        }
    }

    /**
     * Ollama 모델의 context length를 조회합니다 (/api/show).
     * num_ctx(실제 설정) 우선, 없으면 general.context_length(최대 지원) fallback.
     * 조회 실패 시 null 반환.
     */
    static async getOllamaModelContextLength(modelName: string, apiUrl?: string): Promise<number | null> {
        try {
            const resolvedApiUrl = apiUrl || DEFAULT_OLLAMA_URL;
            const url = new URL('/api/show', resolvedApiUrl);
            const client = url.protocol === 'https:' ? https : http;
            const requestData = JSON.stringify({ name: modelName });

            const parsed = await new Promise<any>((resolve, reject) => {
                const req = client.request(
                    {
                        hostname: url.hostname,
                        port: url.port || (url.protocol === 'https:' ? 443 : 80),
                        path: url.pathname + url.search,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(requestData),
                        },
                        timeout: 5000,
                    },
                    (res) => {
                        let buf = '';
                        res.on('data', (chunk) => (buf += chunk));
                        res.on('end', () => {
                            try { resolve(JSON.parse(buf)); }
                            catch (e) { reject(e); }
                        });
                    },
                );
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                req.write(requestData);
                req.end();
            });

            // 1순위: parameters 문자열에서 num_ctx 파싱 (실제 설정값)
            if (typeof parsed?.parameters === 'string') {
                const match = parsed.parameters.match(/num_ctx\s+(\d+)/);
                if (match) {
                    const numCtx = parseInt(match[1], 10);
                    if (numCtx > 0) {
                        console.log(`[ModelConnectionService] Ollama ${modelName}: num_ctx=${numCtx} (실제 설정)`);
                        return numCtx;
                    }
                }
            }

            // 2순위: model_info에서 general.context_length (모델 최대 지원)
            const modelInfo = parsed?.model_info;
            if (modelInfo) {
                const ctxLength = modelInfo['general.context_length'];
                if (typeof ctxLength === 'number' && ctxLength > 0) {
                    console.log(`[ModelConnectionService] Ollama ${modelName}: context_length=${ctxLength} (모델 최대)`);
                    return ctxLength;
                }
            }

            // context length 정보 없으면 보수적 기본값 사용
            const DEFAULT_OLLAMA_CONTEXT = 65536;
            console.log(`[ModelConnectionService] Ollama ${modelName}: context length 정보 없음, 기본값 ${DEFAULT_OLLAMA_CONTEXT} 사용`);
            return DEFAULT_OLLAMA_CONTEXT;
        } catch (error) {
            console.warn(`[ModelConnectionService] Ollama /api/show 실패 (${modelName}):`, error);
            return null;
        }
    }

    /**
     * Ollama 모델을 다운로드합니다. 진행 상황은 콜백으로 전달됩니다.
     */
    static async downloadOllamaModel(
        modelName: string,
        apiUrl?: string,
        onProgress?: (progress: number, status?: string) => void,
    ): Promise<void> {
        const resolvedApiUrl = apiUrl || DEFAULT_OLLAMA_URL;
        const url = new URL('/api/pull', resolvedApiUrl);
        const client = url.protocol === 'https:' ? https : http;
        const requestData = JSON.stringify({ name: modelName });

        await new Promise<void>((resolve, reject) => {
            const req = client.request(
                {
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(requestData),
                    },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => {
                        data += chunk;
                        try {
                            const lines = data.split('\n');
                            for (const line of lines) {
                                if (!line.trim()) continue;
                                const parsed = JSON.parse(line);
                                if (parsed.status) {
                                    const progress =
                                        parsed.completed && parsed.total
                                            ? Math.round((parsed.completed / parsed.total) * 100)
                                            : 0;
                                    onProgress?.(progress, parsed.status);
                                }
                            }
                        } catch {
                            // 진행 상황 파싱 실패는 무시
                        }
                    });
                    res.on('end', () => resolve());
                    res.on('error', reject);
                },
            );
            req.on('error', reject);
            req.write(requestData);
            req.end();
        });
    }

}

