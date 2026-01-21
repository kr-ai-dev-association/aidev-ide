import {
    ILLMAdapter,
    SystemPromptContext,
    UserPromptContext,
    CodeGenerationContext,
    ErrorCorrectionContext,
    CommandExecutionContext,
    ParsedLLMResponse,
    StreamingChunk,
    LLMRequestOptions,
    LLMFeature,
} from './ILLMAdapter';
import { AiModelType } from '../../../../services';
import { PromptComposer } from '../../context/prompts/PromptComposer';
import { ProjectManager } from '../../project/ProjectManager';
import {
    getAgentRole,
    getCodeGenerationGuide,
    getErrorCorrectionGuide,
    getCommandExecutionGuide,
    buildShellSpecificPrompt,
    getDefaultOutputFormat,
} from '../../context/prompts/base';

/**
 * Gemma LLM 어댑터
 * Gemma 계열 모델용 프롬프트/응답 처리
 */
export class GemmaAdapter implements ILLMAdapter {
    readonly llmId = 'gemma';
    readonly llmName = 'Gemma';
    readonly modelName = 'gemma';

    // ==================== 프롬프트 생성 ====================

    buildSystemPrompt(context: SystemPromptContext): string {
        try {
            const composerOptions = {
                userOS: context.osName,
                modelType: AiModelType.OLLAMA,
                taskType: undefined as 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal' | undefined,
                frameworkName: context.framework && context.framework.length > 0 ? context.framework[0].toLowerCase() : undefined,
                projectType: context.projectType,
            };

            return PromptComposer.composeSystemPrompt(composerOptions);
        } catch (error) {
            console.warn('[GemmaAdapter] PromptComposer 사용 실패, 기본 프롬프트 사용:', error);

            const parts: string[] = [];
            parts.push(getAgentRole());
            parts.push(PromptComposer.getOSPrompt(context.osName));
            parts.push(getCodeGenerationGuide());
            // Gemma 특화 프롬프트는 PromptComposer에서 이미 포함됨
            // 프레임워크별 프롬프트는 제거됨 - LLM이 프로젝트 파일을 읽고 판단
            return parts.join('\n\n');
        }
    }

    buildUserPrompt(context: UserPromptContext): string {
        const parts: string[] = [];

        if (context.conversationHistory && context.conversationHistory.length > 0) {
            parts.push('## 대화 기록:');
            context.conversationHistory.forEach((msg, idx) => {
                parts.push(`[${idx + 1}] ${msg.role}: ${msg.content}`);
            });
            parts.push('');
        }

        if (context.includedFiles && context.includedFiles.length > 0) {
            parts.push('## 컨텍스트 파일:');
            context.includedFiles.forEach(file => {
                parts.push(`### ${file.name}`);
                parts.push('```');
                parts.push(file.content);
                parts.push('```');
                parts.push('');
            });
        }

        parts.push('## 사용자 요청:');
        parts.push(context.query);

        return parts.join('\n');
    }

    buildCodeGenerationPrompt(context: CodeGenerationContext): string {
        const parts: string[] = [
            getCodeGenerationGuide(),
            '',
            `프로젝트 타입: ${context.projectType}`,
            `기술 스택: ${context.framework.join(', ')}`,
            '',
            '## 요구사항:',
            context.requirements,
        ];

        if (context.existingFiles && context.existingFiles.length > 0) {
            parts.push('', '## 기존 파일:');
            context.existingFiles.forEach(file => {
                parts.push(`### ${file.path}`);
                parts.push('```');
                parts.push(file.content);
                parts.push('```');
            });
        }

        parts.push('', '## 출력 형식:', getDefaultOutputFormat());
        return parts.join('\n');
    }

    buildErrorCorrectionPrompt(context: ErrorCorrectionContext): string {
        const parts: string[] = [
            getErrorCorrectionGuide(),
            '',
            `에러 타입: ${context.errorType}`,
            '',
            '## 에러 메시지:',
            context.errorMessage,
        ];

        if (context.commandExecuted) {
            parts.push('', '## 실행된 명령어:', context.commandExecuted);
        }

        if (context.terminalOutput) {
            parts.push('', '## 터미널 출력:', context.terminalOutput);
        }

        if (context.relevantFiles && context.relevantFiles.length > 0) {
            parts.push('', '## 관련 파일:');
            context.relevantFiles.forEach(file => {
                parts.push(`### ${file.path}`);
                parts.push('```');
                parts.push(file.content);
                parts.push('```');
            });
        }

        parts.push('', '## 수정 방법:', '에러를 분석하고 수정된 명령어 또는 코드를 제공해주세요.');

        return parts.join('\n');
    }

    buildCommandExecutionPrompt(context: CommandExecutionContext): string {
        const parts: string[] = [
            getCommandExecutionGuide(),
            '',
            buildShellSpecificPrompt(context.shellType),
            '',
            `프로젝트 타입: ${context.projectType}`,
            `현재 디렉토리: ${context.currentDirectory}`,
            '',
            '## 요청:',
            context.intent,
        ];

        return parts.join('\n');
    }

    // ==================== 응답 처리 ====================

    parseResponse(response: string): ParsedLLMResponse {
        const result: ParsedLLMResponse = {
            text: response,
            codeBlocks: [],
            fileOperations: [],
            commands: [],
        };

        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(response)) !== null) {
            result.codeBlocks!.push({
                language: match[1] || 'text',
                code: match[2],
            });
        }

        // 파일 작업 추출 (한국어 + 영어 범용)
        const fileOperationRegex = /(?:##\s*)?(새 파일|수정 파일|삭제 파일|New file|Create file|Modified file|Update file|Modify file|Delete file|Remove file):\s+([^\r\n]+?)(?:\r?\n\s*\r?\n```[^\n]*\r?\n([\s\S]*?)\r?\n```)/gi;
        while ((match = fileOperationRegex.exec(response)) !== null) {
            const opKeyword = match[1].toLowerCase();
            const operation = (opKeyword.includes('새') || opKeyword.includes('new') || opKeyword.includes('create'))
                ? 'create'
                : (opKeyword.includes('수정') || opKeyword.includes('modified') || opKeyword.includes('update') || opKeyword.includes('modify'))
                    ? 'modify'
                    : 'delete';
            result.fileOperations!.push({
                operation,
                path: match[2].trim().replace(/\*\*$/, ''),
                content: match[3],
            });
        }

        const commandRegex = /```(?:bash|powershell|sh|cmd)\n([\s\S]*?)```/g;
        while ((match = commandRegex.exec(response)) !== null) {
            const commands = match[1]
                .split('\n')
                .map(line => this.stripInlineComment(line.trim()))
                .filter(line => line && !line.startsWith('#'));
            result.commands!.push(...commands);
        }

        return result;
    }

    /**
     * 한 줄 명령에서 인라인 주석(#, //)을 제거합니다.
     */
    private stripInlineComment(command: string): string {
        if (!command) return '';
        let cleaned = command.replace(/\s+#.*$/, '').replace(/\s+\/\/.*$/, '');
        return cleaned.trim();
    }

    handleStreamingChunk(chunk: string): StreamingChunk | null {
        if (chunk.includes('[DONE]')) {
            return { type: 'complete', content: '' };
        }

        try {
            const data = JSON.parse(chunk);
            if (data.response) {
                return { type: 'text', content: data.response };
            }
        } catch (e) {
            return { type: 'text', content: chunk };
        }

        return null;
    }

    // ==================== 토큰 관리 ====================

    getMaxInputTokens(): number {
        return 128000;
    }

    getMaxOutputTokens(): number {
        return 8192;
    }

    estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    // ==================== API 설정 ====================

    getApiEndpoint(): string {
        return '/api/generate';
    }

    getApiHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json',
        };
    }

    buildApiRequestBody(prompt: string, options?: LLMRequestOptions): any {
        return {
            model: this.modelName,
            prompt: prompt,
            stream: options?.stream ?? true,
            options: {
                temperature: options?.temperature ?? 0.7,
                num_predict: options?.maxTokens ?? 4096,
                top_p: options?.topP ?? 0.9,
                stop: options?.stopSequences ?? [],
            },
        };
    }

    // ==================== LLM별 특화 기능 ====================

    getSupportedFeatures(): LLMFeature[] {
        return [
            LLMFeature.STREAMING,
            LLMFeature.CODE_GENERATION,
            LLMFeature.ERROR_CORRECTION,
            LLMFeature.MULTI_TURN,
            LLMFeature.FILE_OPERATIONS,
            LLMFeature.COMMAND_EXECUTION,
        ];
    }

    supportsFeature(feature: LLMFeature): boolean {
        return this.getSupportedFeatures().includes(feature);
    }

    getModelSpecificSettings(): Record<string, any> {
        return {
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 4096,
            streamingEnabled: true,
            contextWindow: 128000,
        };
    }

}

