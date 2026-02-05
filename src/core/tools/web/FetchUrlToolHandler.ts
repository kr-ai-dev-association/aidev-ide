/**
 * Fetch URL Tool Handler
 * URL 내용 가져오기 (웹페이지, API 문서 등)
 * cheerio 기반 HTML → Markdown 변환
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as https from 'https';
import * as http from 'http';
import * as cheerio from 'cheerio';

export class FetchUrlToolHandler implements IToolHandler {
    readonly name = Tool.FETCH_URL;

    private static readonly MAX_LENGTH = 50000;
    /** URL 자동 감지용 축소 한도 */
    private static readonly AUTO_FETCH_MAX_LENGTH = 30000;

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
            const content = await FetchUrlToolHandler.fetchContent(url);

            // HTML 감지 → Markdown 변환 → truncation (순서 수정: 원본에서 추출 후 자르기)
            let result: string;
            let truncated = false;

            if (content.includes('<html') || content.includes('<!DOCTYPE') || content.includes('<head')) {
                result = FetchUrlToolHandler.extractTextFromHtml(content);
            } else {
                result = content;
            }

            if (result.length > FetchUrlToolHandler.MAX_LENGTH) {
                result = result.substring(0, FetchUrlToolHandler.MAX_LENGTH);
                result += '\n\n... [truncated, content too long] ...';
                truncated = true;
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

    // ─── Static public methods (A1 URL 자동 감지에서 재사용) ───

    /**
     * URL에서 원본 콘텐츠를 가져옴
     */
    public static fetchContent(url: string): Promise<string> {
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
                    FetchUrlToolHandler.fetchContent(res.headers.location).then(resolve).catch(reject);
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

    /**
     * URL fetch + HTML 감지 + Markdown 변환 + truncation (URL 자동 감지용)
     */
    public static async fetchAndExtract(url: string): Promise<{ content: string; truncated: boolean }> {
        const raw = await FetchUrlToolHandler.fetchContent(url);

        let content: string;
        if (raw.includes('<html') || raw.includes('<!DOCTYPE') || raw.includes('<head')) {
            content = FetchUrlToolHandler.extractTextFromHtml(raw);
        } else {
            content = raw;
        }

        let truncated = false;
        if (content.length > FetchUrlToolHandler.AUTO_FETCH_MAX_LENGTH) {
            content = content.substring(0, FetchUrlToolHandler.AUTO_FETCH_MAX_LENGTH);
            content += '\n\n... [truncated] ...';
            truncated = true;
        }

        return { content, truncated };
    }

    // ─── cheerio 기반 HTML → Markdown 변환 ───

    /**
     * HTML을 cheerio로 파싱하여 Markdown 형태의 텍스트로 변환
     */
    public static extractTextFromHtml(html: string): string {
        const $ = cheerio.load(html);

        // 불필요한 요소 제거
        $('script, style, nav, header, footer, aside, iframe, noscript, svg, form, button, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

        // pre/code 블록을 마커로 치환 (내부 내용 보존)
        const codeBlocks: string[] = [];
        $('pre').each((_i, el) => {
            const $el = $(el);
            const codeEl = $el.find('code');
            const lang = codeEl.attr('class')?.match(/language-(\w+)/)?.[1] || '';
            const codeText = codeEl.length > 0 ? codeEl.text() : $el.text();
            const idx = codeBlocks.length;
            codeBlocks.push(`\n\`\`\`${lang}\n${codeText.trim()}\n\`\`\`\n`);
            $el.replaceWith(`__CODE_BLOCK_${idx}__`);
        });

        // inline code
        $('code').each((_i, el) => {
            const $el = $(el);
            $el.replaceWith(`\`${$el.text()}\``);
        });

        // headings → markdown headings
        for (let level = 1; level <= 6; level++) {
            const prefix = '#'.repeat(level);
            $(`h${level}`).each((_i, el) => {
                const $el = $(el);
                $el.replaceWith(`\n${prefix} ${$el.text().trim()}\n`);
            });
        }

        // links → markdown links
        $('a[href]').each((_i, el) => {
            const $el = $(el);
            const href = $el.attr('href') || '';
            const text = $el.text().trim();
            if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                $el.replaceWith(`[${text}](${href})`);
            } else {
                $el.replaceWith(text);
            }
        });

        // images → alt text
        $('img[alt]').each((_i, el) => {
            const $el = $(el);
            const alt = $el.attr('alt')?.trim();
            if (alt) {
                $el.replaceWith(`[이미지: ${alt}]`);
            } else {
                $el.remove();
            }
        });

        // unordered list items
        $('ul li').each((_i, el) => {
            const $el = $(el);
            $el.replaceWith(`\n- ${$el.text().trim()}`);
        });

        // ordered list items
        $('ol').each((_i, ol) => {
            $(ol).find('li').each((idx, el) => {
                const $el = $(el);
                $el.replaceWith(`\n${idx + 1}. ${$el.text().trim()}`);
            });
        });

        // tables → pipe-delimited text
        $('table').each((_i, table) => {
            const $table = $(table);
            const rows: string[] = [];

            $table.find('tr').each((_ri, tr) => {
                const cells: string[] = [];
                $(tr).find('th, td').each((_ci, cell) => {
                    cells.push($(cell).text().trim());
                });
                if (cells.length > 0) {
                    rows.push(`| ${cells.join(' | ')} |`);
                }
            });

            if (rows.length > 0) {
                // 첫 행 다음에 구분선 추가 (header row)
                const headerSep = rows.length > 1
                    ? `\n| ${rows[0].split('|').filter(c => c.trim()).map(() => '---').join(' | ')} |`
                    : '';
                const tableText = rows[0] + headerSep + '\n' + rows.slice(1).join('\n');
                $table.replaceWith(`\n${tableText}\n`);
            } else {
                $table.remove();
            }
        });

        // paragraphs → newline preserved
        $('p').each((_i, el) => {
            const $el = $(el);
            $el.replaceWith(`\n${$el.text().trim()}\n`);
        });

        // blockquote
        $('blockquote').each((_i, el) => {
            const $el = $(el);
            const lines = $el.text().trim().split('\n').map(l => `> ${l.trim()}`).join('\n');
            $el.replaceWith(`\n${lines}\n`);
        });

        // hr
        $('hr').each((_i, el) => {
            $(el).replaceWith('\n---\n');
        });

        // 나머지 태그 제거 → 텍스트만 추출
        let text = $('body').text() || $.root().text();

        // 코드 블록 마커 복원
        for (let i = 0; i < codeBlocks.length; i++) {
            text = text.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
        }

        // HTML 엔티티 정리 (cheerio가 대부분 처리하지만 잔여분)
        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        // 과도한 줄바꿈/공백 정리
        text = text
            .replace(/[ \t]+/g, ' ')           // 연속 공백 → 단일 공백
            .replace(/ \n/g, '\n')             // 줄바꿈 앞 공백 제거
            .replace(/\n /g, '\n')             // 줄바꿈 뒤 공백 제거
            .replace(/\n{4,}/g, '\n\n\n')      // 3줄 이상 빈 줄 → 2줄
            .trim();

        return text;
    }
}
