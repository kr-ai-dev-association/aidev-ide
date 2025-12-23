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
import { FrameworkPromptBuilder } from '../../context/prompts/framework/FrameworkPromptBuilder';

/**
 * GPT LLM 어댑터
 * GPT 계열 모델에 최적화 (OpenAI GPT, Ollama gpt-oss 등)
 */
export class GptAdapter implements ILLMAdapter {
    readonly llmId = 'gpt';
    readonly llmName = 'GPT';
    readonly modelName = 'gpt'; // 실제 모델명은 프론트엔드에서 선택

    // ==================== 프롬프트 생성 ====================

    buildSystemPrompt(context: SystemPromptContext): string {
        // PromptComposer를 사용하여 일관된 프롬프트 생성
        try {
            // SystemPromptContext를 PromptComposerOptions로 변환
            const composerOptions = {
                userOS: context.osName,
                modelType: AiModelType.OLLAMA_GPT_OSS, // GptAdapter이므로 GPT-OSS 모델 타입 사용
                taskType: undefined as 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal' | undefined, // 컨텍스트에서 추론 불가능하므로 optional
                frameworkName: context.framework && context.framework.length > 0 ? context.framework[0].toLowerCase() : undefined,
                projectType: context.projectType,
            };

            return PromptComposer.composeSystemPrompt(composerOptions);
        } catch (error) {
            // ProjectManager가 초기화되지 않았거나 오류 발생 시 fallback
            console.warn('[GptAdapter] PromptComposer 사용 실패, 기본 프롬프트 사용:', error);

            // 기존 로직을 fallback으로 유지
            const parts: string[] = [];
            parts.push(getAgentRole());
            parts.push(PromptComposer.getOSPrompt(context.osName));
            parts.push(getCodeGenerationGuide());
            // GPT 특화 프롬프트는 PromptComposer에서 이미 포함됨
            if (context.projectType) {
                parts.push(
                    FrameworkPromptBuilder.buildProjectContextPrompt(
                        context.projectType,
                        context.framework,
                    ),
                );
            }
            return parts.join('\n\n');
        }
    }

    buildUserPrompt(context: UserPromptContext): string {
        const parts: string[] = [];

        // 대화 히스토리
        if (context.conversationHistory && context.conversationHistory.length > 0) {
            parts.push('## 대화 기록:');
            context.conversationHistory.forEach((msg, idx) => {
                parts.push(`[${idx + 1}] ${msg.role}: ${msg.content}`);
            });
            parts.push('');
        }

        // 포함된 파일
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

        // 사용자 질의
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

        // GPT 특화: 명확한 출력 형식 지정
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
        const shellPrompt = buildShellSpecificPrompt(context.shellType);

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

        // 코드 블록 추출
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(response)) !== null) {
            result.codeBlocks!.push({
                language: match[1] || 'text',
                code: match[2],
            });
        }

        // 파일 작업 추출
        const fileOperationRegex = /(?:##\s*)?(새 파일|수정 파일|삭제 파일):\s+([^\r\n]+?)(?:\r?\n\s*\r?\n```[^\n]*\r?\n([\s\S]*?)\r?\n```)/g;
        while ((match = fileOperationRegex.exec(response)) !== null) {
            const operation = match[1].includes('새') ? 'create' : match[1].includes('수정') ? 'modify' : 'delete';
            result.fileOperations!.push({
                operation,
                path: match[2].trim().replace(/\*\*$/, ''),
                content: match[3],
            });
        }

        // 명령어 추출 (bash, powershell)
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
        // GPT 스트리밍 형식 처리
        if (chunk.includes('[DONE]')) {
            return { type: 'complete', content: '' };
        }

        try {
            const data = JSON.parse(chunk);
            if (data.response) {
                return { type: 'text', content: data.response };
            }
        } catch (e) {
            // JSON 파싱 실패 시 텍스트로 처리
            return { type: 'text', content: chunk };
        }

        return null;
    }

    // ==================== 토큰 관리 ====================

    getMaxInputTokens(): number {
        return 128000; // GPT 계열의 컨텍스트 윈도우
    }

    getMaxOutputTokens(): number {
        return 8192; // 출력 토큰 제한
    }

    estimateTokenCount(text: string): number {
        // 간단한 토큰 추정 (실제로는 tiktoken 등 사용 권장)
        // 평균적으로 1 토큰 ≈ 4 문자
        return Math.ceil(text.length / 4);
    }

    // ==================== API 설정 ====================

    getApiEndpoint(): string {
        // Ollama API 엔드포인트 (GPT-OSS 등)
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

