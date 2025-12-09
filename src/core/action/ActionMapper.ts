/**
 * Action Mapper
 * LLM 응답을 액션으로 매핑하는 클래스
 */

import {
    Action,
    ActionType,
    ActionParams,
    LLMResponse,
    ActionMappingResult,
    Permission,
    FileOperationType
} from './types';

export class ActionMapper {
    private actionIdCounter = 0;
    private readonly MAX_TERMINAL_COMMANDS = 8;

    /**
     * LLM 응답을 액션 배열로 매핑합니다
     */
    public mapResponse(llmResponse: LLMResponse): ActionMappingResult {
        console.log('[ActionMapper] Mapping LLM response to actions');

        // LLM이 이미 액션을 제공한 경우
        if (llmResponse.actions && llmResponse.actions.length > 0) {
            return {
                actions: llmResponse.actions,
                explanation: llmResponse.explanation,
                confidence: 0.95
            };
        }

        // 텍스트에서 액션 추출
        const actions = this.extractActionsFromText(llmResponse.content);

        return {
            actions,
            explanation: llmResponse.explanation,
            confidence: this.calculateConfidence(actions, llmResponse.content)
        };
    }

    /**
     * 텍스트에서 액션을 추출합니다
     */
    private extractActionsFromText(content: string): Action[] {
        const actions: Action[] = [];

        // 코드 블록 추출 (파일 작성/수정)
        const codeBlockActions = this.extractCodeBlocks(content);
        actions.push(...codeBlockActions);

        // 터미널 명령어 추출
        const commandActions = this.extractCommands(content);
        actions.push(...commandActions);

        // 파일 작업 추출
        const fileOpActions = this.extractFileOperations(content);
        actions.push(...fileOpActions);

        console.log(`[ActionMapper] Extracted ${actions.length} actions from text`);
        // 중복 제거 (같은 터미널 명령은 한 번만 실행)
        return this.deduplicateTerminalCommands(actions);
    }

    /**
     * 코드 블록에서 액션을 추출합니다
     */
    private extractCodeBlocks(content: string): Action[] {
        const actions: Action[] = [];

        // 파일 경로와 코드 블록을 함께 추출하는 정규식
        // 예: ```typescript:src/example.ts ... ```
        const codeBlockPattern = /```(?:[\w]+)?:?([\w\/\.\-]+)?\n([\s\S]*?)```/g;
        let match;

        while ((match = codeBlockPattern.exec(content)) !== null) {
            const filePath = match[1];
            const code = match[2].trim();

            if (filePath && code) {
                actions.push(this.createCodeGenerationAction(filePath, code));
            }
        }

        // 파일 경로가 명시된 패턴 (예: "Create file src/example.ts:")
        const filePathPattern = /(?:Create|Update|Modify)\s+(?:file\s+)?[`"]?([\/\w\.\-]+)[`"]?:?\s*```[\w]*\n([\s\S]*?)```/gi;

        while ((match = filePathPattern.exec(content)) !== null) {
            const filePath = match[1];
            const code = match[2].trim();

            if (filePath && code) {
                // 중복 체크
                const isDuplicate = actions.some(a =>
                    a.type === ActionType.CODE_GENERATION &&
                    a.params.filePath === filePath
                );

                if (!isDuplicate) {
                    actions.push(this.createCodeGenerationAction(filePath, code));
                }
            }
        }

        // 한국어 지시어 패턴: "새 파일:" 또는 "수정 파일:" 다음에 파일 경로와 코드 블록
        // 예: "새 파일: src/example.ts\n```typescript\n...```"
        const koreanCodeBlockPattern = /(?:##\s*)?(새 파일|수정 파일):\s*([^\r\n]+?)(?:\s*\r?\n\s*\r?\n|\s*\r?\n)\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```/g;

        while ((match = koreanCodeBlockPattern.exec(content)) !== null) {
            const directive = match[1].trim(); // "새 파일" or "수정 파일"
            let filePath = match[2].trim();
            const code = match[3].trim();

            // 파일 경로 정리
            filePath = filePath.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();

            if (filePath && code) {
                // 중복 체크
                const isDuplicate = actions.some(a =>
                    a.type === ActionType.CODE_GENERATION &&
                    a.params.filePath === filePath
                );

                if (!isDuplicate) {
                    actions.push(this.createCodeGenerationAction(filePath, code));
                }
            }
        }

        // 한국어 마크다운 파일 패턴: "새 파일:" 또는 "수정 파일:" 다음에 .md 파일과 내용
        const koreanMarkdownPattern = /(새 파일|수정 파일):\s*([^\r\n]+\.md)\s*\r?\n\s*\r?\n?([\s\S]*?)(?=\r?\n\s*(?:새 파일|수정 파일|삭제 파일|--- 작업 요약|--- 작업 수행 설명|$))/gs;

        while ((match = koreanMarkdownPattern.exec(content)) !== null) {
            const directive = match[1].trim();
            let filePath = match[2].trim();
            const content = match[3].trim();

            // 파일 경로 정리
            filePath = filePath.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();

            if (filePath && content) {
                // 중복 체크
                const isDuplicate = actions.some(a =>
                    a.type === ActionType.CODE_GENERATION &&
                    a.params.filePath === filePath
                );

                if (!isDuplicate) {
                    actions.push(this.createCodeGenerationAction(filePath, content, 'markdown'));
                }
            }
        }

        return actions;
    }

    /**
     * 터미널 명령어를 추출합니다
     */
    private extractCommands(content: string): Action[] {
        const actions: Action[] = [];

        // bash, sh, shell, powershell, cmd 코드 블록
        const commandBlockPattern = /```(?:bash|sh|shell|powershell|cmd|terminal)\n([\s\S]*?)```/g;
        let match;

        while ((match = commandBlockPattern.exec(content)) !== null) {
            const block = this.normalizeCommandBlock(match[1]);
            const commands = block.split('\n');

            for (const cmd of commands) {
                const cleanCmd = cmd.trim();
                if (cleanCmd && !cleanCmd.startsWith('#') && !cleanCmd.startsWith('//') && this.isLikelyCommand(cleanCmd)) {
                    actions.push(this.createTerminalCommandAction(cleanCmd));
                }
            }
        }

        // 명령어 패턴 (예: "Run: npm install" 또는 "Execute: ...")
        const commandPattern = /(?:Run|Execute|Command):\s*`([^`]+)`/gi;

        while ((match = commandPattern.exec(content)) !== null) {
            const command = match[1].trim();
            if (command) {
                actions.push(this.createTerminalCommandAction(command));
            }
        }

        // 인라인 백틱에 포함된 쉘 명령 추출 (테이블/문단 내 `npm install`, `npm run dev` 등)
        const inlineCommandPattern = /`([^`]+)`/g;
        while ((match = inlineCommandPattern.exec(content)) !== null) {
            const command = match[1].trim();
            if (this.isLikelyCommand(command)) {
                actions.push(this.createTerminalCommandAction(command));
            }
        }

        // 개수 제한 및 중복 제거
        const deduped = this.deduplicateTerminalCommands(actions);
        const filtered = this.filterInstallFlow(deduped);
        return filtered.slice(0, this.MAX_TERMINAL_COMMANDS);
    }

    /**
     * 코드블록에서 추출한 명령 문자열을 정규화합니다.
     * - \r 제거
     * - 이스케이프된 \n을 실제 개행으로 변환
     */
    private normalizeCommandBlock(block: string): string {
        let normalized = block.replace(/\r/g, '');
        normalized = normalized.replace(/\\n/g, '\n');
        return normalized.trim();
    }

    /**
     * 터미널 명령 액션 중 중복을 제거합니다.
     */
    private deduplicateTerminalCommands(actions: Action[]): Action[] {
        const seen = new Set<string>();
        const result: Action[] = [];

        for (const action of actions) {
            if (action.type !== ActionType.TERMINAL_COMMAND) {
                result.push(action);
                continue;
            }
            const cmd = (action.params.command || '').trim();
            const key = `terminal:${cmd}`;
            if (!cmd || seen.has(key)) {
                continue;
            }
            seen.add(key);
            result.push(action);
        }

        return result;
    }

    /**
     * npm install/ci 플로우일 때 필수 명령만 남기고 나머지를 제거합니다.
     * - 허용: node -v, npm -v, npm install, npm ci
     * - 플레이스홀더 경로 포함 명령은 제거
     * - 최대 4개로 제한
     */
    private filterInstallFlow(actions: Action[]): Action[] {
        const placeholderPatterns = [
            /\/path\/to\/your\/project/i,
            /<path[-_ ]?to[-_ ]?project>/i,
            /\$PROJECT_ROOT/i,
            /PROJECT_ROOT/i
        ];

        const filtered: Action[] = [];
        let keptVersionCheck = false;
        let keptInstall = false;

        const isVersionCheck = (cmd: string) =>
            /^node\s+-v\b/i.test(cmd) ||
            /^npm\s+-v\b/i.test(cmd) ||
            /^yarn\s+-v\b/i.test(cmd) ||
            /^pnpm\s+-v\b/i.test(cmd) ||
            /^node\s+-v\b.*npm\s+-v\b/i.test(cmd) ||
            /^npm\s+-v\b.*node\s+-v\b/i.test(cmd);

        const isInstall = (cmd: string) =>
            /(npm|yarn|pnpm)\s+(install|ci|add)\b/i.test(cmd);

        const isAuditOrList = (cmd: string) =>
            /\b(npm\s+audit|npm\s+list|npm\s+outdated|yarn\s+audit|pnpm\s+audit)\b/i.test(cmd);

        const isInit = (cmd: string) =>
            /\b(npm\s+init|yarn\s+init|pnpm\s+init)\b/i.test(cmd);

        for (const action of actions) {
            if (action.type !== ActionType.TERMINAL_COMMAND) {
                continue;
            }
            const cmd = (action.params.command || '').trim();
            if (!cmd) continue;
            if (placeholderPatterns.some(p => p.test(cmd))) continue;

            // 불필요 명령 스킵
            if (isAuditOrList(cmd)) continue;
            if (isInit(cmd)) continue;
            if (/dependencies\.txt/i.test(cmd)) continue;

            // 버전 확인: 한 번만
            if (isVersionCheck(cmd)) {
                if (keptVersionCheck) continue;
                keptVersionCheck = true;
                filtered.push(action);
                continue;
            }

            // 설치: 한 번만
            if (isInstall(cmd)) {
                if (keptInstall) continue;
                keptInstall = true;
                filtered.push(action);
                continue;
            }

            // 기타 명령은 설치 플로우에서는 스킵
            continue;
        }

        return filtered.length > 0 ? filtered.slice(0, this.MAX_TERMINAL_COMMANDS) : actions;
    }

    /**
     * 인라인 코드가 쉘 명령으로 추정되는지 확인
     */
    private isLikelyCommand(command: string): boolean {
        if (!command || command.includes('\n')) return false;

        // 마크다운 강조/섹션 텍스트는 제외
        if (/\*\*/.test(command)) return false;

        // 한글만 있고 키워드/연산자가 없는 설명성 텍스트 제외
        const hasKorean = /[ㄱ-ㅎ가-힣]/.test(command);

        const keywords = [
            // JS/Node
            'npm', 'yarn', 'pnpm', 'node', 'npx', 'bun', 'deno',
            // Python
            'python', 'pip', 'pip3', 'poetry',
            // Java/Build
            'go', 'mvn', 'gradle',
            // Ops/CLI
            'docker', 'kubectl', 'bash', 'sh', 'chmod', 'make',
            // Git/Utils
            'git', 'curl', 'wget', 'ls', 'pwd', 'cat', 'grep', 'find', 'ps', 'echo', 'which', 'whoami'
        ];

        const lower = command.toLowerCase();
        const startsWithKeyword = keywords.some(k => lower.startsWith(k + ' ') || lower === k);
        const containsKeyword = keywords.some(k => lower.includes(` ${k} `) || lower.endsWith(` ${k}`));
        const hasPathPrefix = lower.startsWith('./') || lower.startsWith('../') || lower.startsWith('cd ');

        // 연산자 기반(파이프/AND) 명령 감지
        const hasShellOperator = /(\|\||&&|\|)/.test(command);

        // 설명성 텍스트가 명령으로 오인되지 않도록 키워드/경로/연산자 중 하나는 있어야 함
        if (!(startsWithKeyword || containsKeyword || hasPathPrefix || hasShellOperator)) {
            return false;
        }

        // echo/printf 안내만 있는 경우 제외 (명령 안내 차단)
        if (/^(echo|printf)\b/i.test(lower)) {
            return false;
        }

        // if/elif/else 로 시작하는 스크립트 제어문은 실행 명령으로 취급하지 않음
        if (/^(if|elif|else)\b/i.test(lower)) {
            return false;
        }

        // 한글이 포함되었는데 명령 키워드가 없으면 제외
        if (hasKorean && !(startsWithKeyword || containsKeyword)) {
            return false;
        }

        return true;
    }

    /**
     * 파일 작업을 추출합니다
     */
    private extractFileOperations(content: string): Action[] {
        const actions: Action[] = [];

        // 파일 삭제 패턴 (영어)
        const deletePattern = /(?:Delete|Remove)\s+(?:file\s+)?[`"]?([\/\w\.\-]+)[`"]?/gi;
        let match;

        while ((match = deletePattern.exec(content)) !== null) {
            const filePath = match[1];
            actions.push(this.createFileOperationAction(FileOperationType.DELETE, filePath));
        }

        // 한국어 삭제 패턴: "삭제 파일: ..."
        const koreanDeletePattern = /삭제 파일:\s+(.+?)(?:\r?\n|$)/g;

        while ((match = koreanDeletePattern.exec(content)) !== null) {
            let filePath = match[1].trim();
            // 파일 경로 정리
            filePath = filePath.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();
            if (filePath) {
                actions.push(this.createFileOperationAction(FileOperationType.DELETE, filePath));
            }
        }

        // 파일 이름 변경 패턴
        const renamePattern = /Rename\s+[`"]?([\/\w\.\-]+)[`"]?\s+to\s+[`"]?([\/\w\.\-]+)[`"]?/gi;

        while ((match = renamePattern.exec(content)) !== null) {
            const sourcePath = match[1];
            const targetPath = match[2];
            actions.push(this.createFileOperationAction(FileOperationType.RENAME, sourcePath, targetPath));
        }

        // 파일 이동 패턴
        const movePattern = /Move\s+[`"]?([\/\w\.\-]+)[`"]?\s+to\s+[`"]?([\/\w\.\-]+)[`"]?/gi;

        while ((match = movePattern.exec(content)) !== null) {
            const sourcePath = match[1];
            const targetPath = match[2];
            actions.push(this.createFileOperationAction(FileOperationType.MOVE, sourcePath, targetPath));
        }

        return actions;
    }

    /**
     * CODE_GENERATION 액션을 생성합니다
     */
    private createCodeGenerationAction(filePath: string, code: string, language?: string): Action {
        return {
            id: this.generateActionId(),
            type: ActionType.CODE_GENERATION,
            params: {
                filePath,
                code,
                language: language || this.detectLanguage(filePath),
                description: `Generate/update file: ${filePath}`
            },
            permissions: [Permission.READ_FILE, Permission.WRITE_FILE],
            validation: [
                { field: 'filePath', type: 'required', message: 'File path is required' },
                { field: 'code', type: 'required', message: 'Code content is required' }
            ],
            metadata: {
                source: 'llm',
                timestamp: Date.now(),
                confidence: 0.9
            }
        };
    }

    /**
     * TERMINAL_COMMAND 액션을 생성합니다
     */
    private createTerminalCommandAction(command: string, cwd?: string): Action {
        return {
            id: this.generateActionId(),
            type: ActionType.TERMINAL_COMMAND,
            params: {
                command,
                cwd,
                description: `Execute: ${command}`
            },
            permissions: [Permission.EXECUTE_COMMAND],
            validation: [
                { field: 'command', type: 'required', message: 'Command is required' }
            ],
            metadata: {
                source: 'llm',
                timestamp: Date.now(),
                confidence: 0.85
            }
        };
    }

    /**
     * FILE_OPERATION 액션을 생성합니다
     */
    private createFileOperationAction(
        operation: FileOperationType,
        sourcePath: string,
        targetPath?: string,
        content?: string
    ): Action {
        const permissions: Permission[] = [Permission.READ_FILE];

        if (operation === FileOperationType.DELETE) {
            permissions.push(Permission.DELETE_FILE);
        } else {
            permissions.push(Permission.WRITE_FILE);
        }

        return {
            id: this.generateActionId(),
            type: ActionType.FILE_OPERATION,
            params: {
                operation,
                sourcePath,
                targetPath,
                content,
                description: `${operation} file: ${sourcePath}${targetPath ? ` → ${targetPath}` : ''}`
            },
            permissions,
            validation: [
                { field: 'operation', type: 'required', message: 'Operation type is required' },
                { field: 'sourcePath', type: 'required', message: 'Source path is required' }
            ],
            metadata: {
                source: 'llm',
                timestamp: Date.now(),
                confidence: 0.8
            }
        };
    }

    /**
     * 파일 확장자로부터 언어를 감지합니다
     */
    private detectLanguage(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase();

        const languageMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust',
            'c': 'c',
            'cpp': 'cpp',
            'cs': 'csharp',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kt': 'kotlin',
            'dart': 'dart',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'sql': 'sql'
        };

        return ext ? (languageMap[ext] || ext) : 'text';
    }

    /**
     * 신뢰도를 계산합니다
     */
    private calculateConfidence(actions: Action[], content: string): number {
        if (actions.length === 0) {
            return 0;
        }

        let totalConfidence = 0;
        for (const action of actions) {
            totalConfidence += action.metadata?.confidence || 0.5;
        }

        const averageConfidence = totalConfidence / actions.length;

        // 코드 블록이나 명령어 블록이 명확하게 있으면 신뢰도 증가
        const hasCodeBlocks = /```[\s\S]*?```/.test(content);
        const confidenceBonus = hasCodeBlocks ? 0.1 : 0;

        return Math.min(averageConfidence + confidenceBonus, 1.0);
    }

    /**
     * 고유한 액션 ID를 생성합니다
     */
    private generateActionId(): string {
        return `action_${Date.now()}_${++this.actionIdCounter}`;
    }

    /**
     * 카운터를 리셋합니다 (테스트용)
     */
    public resetCounter(): void {
        this.actionIdCounter = 0;
    }
}

