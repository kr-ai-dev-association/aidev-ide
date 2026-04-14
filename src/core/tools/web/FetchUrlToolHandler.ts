/**
 * Fetch URL Tool Handler
 * Fetch URL content (web pages, API docs, etc.)
 * cheerio-based HTML to Markdown conversion
 */

import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import * as https from 'https';
import * as http from 'http';
import * as cheerio from 'cheerio';

export class FetchUrlToolHandler implements IToolHandler {
    readonly name = Tool.FETCH_URL;

    private static readonly MAX_LENGTH = 50000;
    /** Reduced limit for URL auto-detection */
    private static readonly AUTO_FETCH_MAX_LENGTH = 30000;

    getDescription(toolUse: ToolUse): string {
        const url = toolUse.params?.url || '';
        return url ? `Fetch URL: ${url}` : 'Fetch URL';
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
            // URL parsing validation
            new URL(url);

            // HTTP(S) request
            const content = await FetchUrlToolHandler.fetchContent(url);

            // HTML detection -> Markdown conversion -> truncation (extract from original then truncate)
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

    // --- Static public methods (reused in A1 URL auto-detection) ---

    /**
     * Fetches raw content from URL
     */
    public static fetchContent(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const timeout = 10000; // 10 second timeout

            const req = protocol.get(url, {
                headers: {
                    'User-Agent': 'AgentGoCoder/1.0 (VSCode Extension)',
                    'Accept': 'text/html,application/json,text/plain,*/*'
                },
                timeout: timeout
            }, (res) => {
                // Handle redirects
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
     * URL fetch + HTML detection + Markdown conversion + truncation (for URL auto-detection)
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

    // --- cheerio-based HTML to Markdown conversion ---

    /**
     * Parses HTML with cheerio and converts to Markdown-style text
     */
    public static extractTextFromHtml(html: string): string {
        const $ = cheerio.load(html);

        // Remove unnecessary elements
        $('script, style, nav, header, footer, aside, iframe, noscript, svg, form, button, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();

        // Replace pre/code blocks with markers (preserve internal content)
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
                $el.replaceWith(`[Image: ${alt}]`);
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
                // Add separator line after first row (header row)
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

        // Remove remaining tags -> extract text only
        let text = $('body').text() || $.root().text();

        // Restore code block markers
        for (let i = 0; i < codeBlocks.length; i++) {
            text = text.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
        }

        // Clean up HTML entities (cheerio handles most, but some remain)
        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        // Clean up excessive newlines/whitespace
        text = text
            .replace(/[ \t]+/g, ' ')           // Consecutive spaces -> single space
            .replace(/ \n/g, '\n')             // Remove space before newline
            .replace(/\n /g, '\n')             // Remove space after newline
            .replace(/\n{4,}/g, '\n\n\n')      // 3+ blank lines -> 2 lines
            .trim();

        return text;
    }
}
