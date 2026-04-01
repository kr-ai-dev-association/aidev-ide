/**
 * StreamingCodeApplier
 * Output text with typing effect to chat panel
 *
 * v9.2.0: Changed to XML-style file_content tags
 * - { "tool": ... }<file_content>...</file_content> -> ```language\ncode\n```
 * - Typing effect for both natural language text and code blocks
 */

export interface StreamingTextCallbacks {
    /** Output text chunk (for chat) */
    onTextChunk?: (chunk: string) => void;
    /** Called when streaming is complete */
    onComplete?: () => void;
}

/**
 * Output text with typing effect to chat panel
 *
 * Core principles:
 * 1. LLM chunks -> accumulate in rawBuffer (fast)
 * 2. interval pulls from rawBuffer at constant speed for output (typing effect)
 * 3. Convert CODE blocks to markdown code blocks
 */
export class StreamingCodeApplier {
    // Raw buffer: LLM에서 받은 그대로
    private rawBuffer: string = '';
    // Display buffer: interval이 처리 중인 텍스트
    private displayBuffer: string = '';
    private displayIndex: number = 0;

    private callbacks: StreamingTextCallbacks;
    private processingInterval: NodeJS.Timeout | null = null;
    private isDone: boolean = false;
    private isFinalized: boolean = false;

    // CODE block patterns (convert to markdown) - XML style
    // Complete CODE block: { "tool": ... }<file_content>...</file_content>
    private static readonly CODE_BLOCK_PATTERN = /\{\s*["']tool["']\s*:\s*["']([^"']+)["'][^}]*["']path["']\s*:\s*["']([^"']+)["'][^}]*\}\s*<file_content>\s*([\s\S]*?)<\/file_content>/g;
    // JSON-only tool call (no CODE block)
    private static readonly TOOL_JSON_ONLY = /\{\s*["']tool["']\s*:\s*["']([^"']+)["'][^}]*\}(?!\s*<file_content>)/g;
    // Detect partial tool start
    private static readonly PARTIAL_TOOL_START = /\{\s*["']tool["']\s*:/;
    // Detect partial CODE block start
    private static readonly PARTIAL_CODE_START = /<file_content>/;

    // Typing speed settings
    private static readonly CHARS_PER_TICK = 8; // Slightly faster since code is also output
    private static readonly TICK_INTERVAL_MS = 16; // interval 주기 (16ms ≈ 60fps)
    // Buffer size limit (memory stability)
    private static readonly MAX_RAW_BUFFER_SIZE = 512000; // 512KB

    constructor(callbacks: StreamingTextCallbacks = {}) {
        this.callbacks = callbacks;
    }

    /**
     * Start streaming
     */
    start(): void {
        if (this.processingInterval) return;

        this.processingInterval = setInterval(() => {
            this.processDisplayBuffer();
        }, StreamingCodeApplier.TICK_INTERVAL_MS);
    }

    /**
     * Receive LLM chunk (SYNC - only append to rawBuffer)
     */
    processChunk(chunk: string): void {
        this.rawBuffer += chunk;

        // Buffer overflow prevention: force flush when limit exceeded
        if (this.rawBuffer.length > StreamingCodeApplier.MAX_RAW_BUFFER_SIZE) {
            console.warn(
                `[StreamingCodeApplier] rawBuffer overflow (${(this.rawBuffer.length / 1024).toFixed(0)}KB), flushing`,
            );
            // Clear buffer if tool call pattern exists, otherwise move to displayBuffer
            if (/\{\s*["']tool["']\s*:/.test(this.rawBuffer)) {
                this.rawBuffer = '';
            } else {
                this.displayBuffer += this.rawBuffer;
                this.rawBuffer = '';
            }
        }

        // Start interval if not running
        if (!this.processingInterval) {
            this.start();
        }
    }

    /**
     * Process display buffer at constant speed (typing effect)
     */
    private processDisplayBuffer(): void {
        if (this.isFinalized) return;

        // Move rawBuffer -> displayBuffer (remove tool calls)
        if (this.rawBuffer.length > 0) {
            // 도구 호출이 완성되지 않았을 수 있으므로 안전한 부분만 이동
            const safeText = this.extractSafeText(this.rawBuffer);
            if (safeText.extracted.length > 0) {
                this.displayBuffer += safeText.extracted;
                this.rawBuffer = safeText.remaining;
            }
        }

        // 처리할 것이 없으면 종료 또는 finalize
        if (this.displayIndex >= this.displayBuffer.length) {
            if (this.isDone && this.rawBuffer.length === 0) {
                this.finalize();
            }
            return;
        }

        // 한 번에 출력할 글자 수 계산
        const remaining = this.displayBuffer.length - this.displayIndex;
        const charsToOutput = Math.min(StreamingCodeApplier.CHARS_PER_TICK, remaining);
        const chunk = this.displayBuffer.substring(this.displayIndex, this.displayIndex + charsToOutput);
        this.displayIndex += charsToOutput;

        // 채팅에 출력
        if (chunk) {
            this.callbacks.onTextChunk?.(chunk);
        }
    }

    /**
     * CODE 블록을 마크다운으로 변환하고 안전한 텍스트 추출
     * 🔥 v8.9.9: 도구 호출이 포함된 응답에서는 전체 텍스트 출력 차단
     */
    private extractSafeText(text: string): { extracted: string; remaining: string } {
        // 🔥 핵심: 도구 호출 패턴이 있으면 전체 텍스트 출력 차단
        // EXECUTION 단계에서 CODE 블록이 패널에 표시되는 문제 해결
        if (/\{\s*["']tool["']\s*:/.test(text)) {
            return { extracted: '', remaining: text };
        }

        let result = text;

        // 1. 완성된 CODE 블록을 마크다운 코드 블록으로 변환 (도구 호출이 없는 경우에만 도달)
        result = result.replace(StreamingCodeApplier.CODE_BLOCK_PATTERN, (match, tool, path, code) => {
            const lang = this.getLanguageFromPath(path);
            const cleanCode = code.trim();
            // 파일 경로와 함께 마크다운 코드 블록으로 변환
            return `\n📄 **${path}**\n\`\`\`${lang}\n${cleanCode}\n\`\`\`\n`;
        });

        // 2. JSON만 있는 도구 호출 (read_file, run_terminal 등) 처리
        result = result.replace(StreamingCodeApplier.TOOL_JSON_ONLY, (match, tool) => {
            // 읽기/실행 도구는 간단히 표시
            if (tool === 'read_file' || tool === 'ripgrep_search' || tool === 'list_directory') {
                return ''; // 파일 읽기는 숨김
            }
            if (tool === 'run_terminal') {
                return `\n⚡ **터미널 실행 중...**\n`;
            }
            return ''; // 기타 도구는 숨김
        });

        // 3. 부분적 CODE 블록 감지 (완성되지 않은 것)
        const partialCodeMatch = result.match(StreamingCodeApplier.PARTIAL_CODE_START);
        if (partialCodeMatch) {
            // <file_content> 이전까지만 추출
            const partialIndex = result.indexOf(partialCodeMatch[0]);
            // 그 앞의 { "tool": ... } 도 함께 보류해야 함
            const toolStartBeforeCode = result.lastIndexOf('{', partialIndex);
            if (toolStartBeforeCode !== -1) {
                return {
                    extracted: result.substring(0, toolStartBeforeCode),
                    remaining: text.substring(text.lastIndexOf('{', text.indexOf('<file_content>')))
                };
            }
        }

        // 4. 부분적 도구 시작 감지 ({ "tool": ...)
        const partialMatch = result.match(StreamingCodeApplier.PARTIAL_TOOL_START);
        if (partialMatch) {
            const partialIndex = result.indexOf(partialMatch[0]);
            return {
                extracted: result.substring(0, partialIndex),
                remaining: text.substring(text.indexOf(partialMatch[0]))
            };
        }

        // 5. 안전: { 가 있으면 도구 시작일 수 있으므로 마지막 { 이전까지만
        const lastBrace = result.lastIndexOf('{');
        if (lastBrace !== -1 && lastBrace > result.length - 20) {
            return {
                extracted: result.substring(0, lastBrace),
                remaining: text.substring(text.lastIndexOf('{'))
            };
        }

        return { extracted: result, remaining: '' };
    }

    /**
     * 파일 경로에서 언어 추출
     */
    private getLanguageFromPath(path: string): string {
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'tsx',
            'js': 'javascript',
            'jsx': 'jsx',
            'py': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'h': 'c',
            'hpp': 'cpp',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'less': 'less',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'sql': 'sql',
            'sh': 'bash',
            'bash': 'bash',
            'zsh': 'bash',
            'ps1': 'powershell',
            'dockerfile': 'dockerfile',
        };
        return langMap[ext] || ext || 'plaintext';
    }

    /**
     * 스트리밍 완료 (LLM 응답 끝)
     */
    markDone(): void {
        this.isDone = true;
    }

    /**
     * 최종 정리
     */
    private finalize(): void {
        if (this.isFinalized) return;
        this.isFinalized = true;

        // interval 정지
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }

        // 남은 텍스트 출력 (CODE 블록 → 마크다운 변환)
        if (this.rawBuffer.length > 0) {
            const { extracted } = this.extractSafeText(this.rawBuffer);
            const remaining = extracted.trim();
            if (remaining) {
                this.callbacks.onTextChunk?.(remaining);
            }
        }

        this.callbacks.onComplete?.();
    }

    /**
     * 스트리밍 완료 - interval이 자연스럽게 처리하도록 대기
     */
    async complete(): Promise<void> {
        this.markDone();

        // interval이 버퍼를 처리할 때까지 대기
        const maxWaitMs = 10000; // 최대 10초
        const startTime = Date.now();

        while (!this.isFinalized && Date.now() - startTime < maxWaitMs) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        if (!this.isFinalized) {
            this.finalize();
        }
    }

    /**
     * 코드 블록 스트리밍 중인지 (항상 false - 에디터 타이핑 안 함)
     */
    isStreaming(): boolean {
        return false;
    }

    /**
     * 리셋
     */
    reset(): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        this.rawBuffer = '';
        this.displayBuffer = '';
        this.displayIndex = 0;
        this.isDone = false;
        this.isFinalized = false;
    }
}

// 하위 호환성을 위한 타입 별칭
export type StreamingCodeCallbacks = StreamingTextCallbacks;
