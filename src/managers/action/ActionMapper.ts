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
        return actions;
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
            const commands = match[1].trim().split('\n');
            
            for (const cmd of commands) {
                const cleanCmd = cmd.trim();
                if (cleanCmd && !cleanCmd.startsWith('#') && !cleanCmd.startsWith('//')) {
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

        return actions;
    }

    /**
     * 파일 작업을 추출합니다
     */
    private extractFileOperations(content: string): Action[] {
        const actions: Action[] = [];

        // 파일 삭제 패턴
        const deletePattern = /(?:Delete|Remove)\s+(?:file\s+)?[`"]?([\/\w\.\-]+)[`"]?/gi;
        let match;

        while ((match = deletePattern.exec(content)) !== null) {
            const filePath = match[1];
            actions.push(this.createFileOperationAction(FileOperationType.DELETE, filePath));
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

