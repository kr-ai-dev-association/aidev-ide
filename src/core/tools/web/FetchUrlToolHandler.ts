/**
 * Fetch URL Tool Handler
 * URL 내용 가져오기 (웹페이지, API 문서 등)
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as https from 'https';
import * as http from 'http';

export class FetchUrlToolHandler implements IToolHandler {
    readonly name = Tool.FETCH_URL;

    getDescription(toolUse: ToolUse): string {
        const url = toolUse.params?.url || '';
        return url ? `URL 가져오기: ${url}` : 'URL 가져오기';
    }

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const { url } = toolUse.params;

        if (!url) {
            return {
                success: false,
                message: 'URL parameter is required.',
                error: { code: 'MISSING_URL', message: 'URL is required' }
            };
        }

        try {
            // URL 파싱 검증
            new URL(url);

            // HTTP(S) 요청
            const content = await this.fetchContent(url);

            // 내용이 너무 길면 자르기
            const MAX_LENGTH = 50000;
            let result = content;
            let truncated = false;

            if (content.length > MAX_LENGTH) {
                result = content.substring(0, MAX_LENGTH);
                result += '\n\n... [truncated, content too long] ...';
                truncated = true;
            }

            // HTML에서 주요 텍스트 추출 시도
            if (content.includes('<html') || content.includes('<!DOCTYPE')) {
                result = this.extractTextFromHtml(result);
            }

            return {
                success: true,
                message: `=== URL: ${url} ===\nLength: ${content.length} chars${truncated ? ' (truncated)' : ''}\n\n${result}`,
                data: {
                    url: url,
                    length: content.length,
                    truncated: truncated
                }
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `Failed to fetch URL: ${errorMessage}`,
                error: { code: 'FETCH_ERROR', message: errorMessage }
            };
        }
    }

    private fetchContent(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const timeout = 10000; // 10초 타임아웃

            const req = protocol.get(url, {
                headers: {
                    'User-Agent': 'CodePilot/1.0 (VSCode Extension)',
                    'Accept': 'text/html,application/json,text/plain,*/*'
                },
                timeout: timeout
            }, (res) => {
                // 리다이렉트 처리
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    this.fetchContent(res.headers.location).then(resolve).catch(reject);
                    return;
                }

                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
                res.on('error', reject);
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        });
    }

    private extractTextFromHtml(html: string): string {
        // 간단한 HTML 텍스트 추출
        let text = html
            // script, style 태그 제거
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            // HTML 태그 제거
            .replace(/<[^>]+>/g, ' ')
            // HTML 엔티티 디코딩
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            // 여러 공백/줄바꿈 정리
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        return text;
    }
}
