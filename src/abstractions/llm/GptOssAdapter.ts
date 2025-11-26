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
    COMMON_SYSTEM_PROMPTS,
} from './ILLMAdapter';

/**
 * GPT-OSS LLM 어댑터
 * Ollama 기반 gpt-oss-120b 모델에 최적화
 */
export class GptOssAdapter implements ILLMAdapter {
    readonly llmId = 'gpt-oss';
    readonly llmName = 'GPT-OSS';
    readonly modelName = 'gpt-oss-120b:cloud';

    // ==================== 프롬프트 생성 ====================

    buildSystemPrompt(context: SystemPromptContext): string {
        const parts: string[] = [];

        // 공통 베이스 프롬프트
        parts.push(COMMON_SYSTEM_PROMPTS.BASE);

        // OS별 프롬프트
        parts.push(this.getOSSpecificPrompt(context));

        // 코드 생성 가이드
        parts.push(COMMON_SYSTEM_PROMPTS.CODE_GENERATION);

        // GPT-OSS 특화 프롬프트
        parts.push(this.getGptOssSpecificPrompt(context));

        // 프로젝트 타입별 프롬프트
        if (context.projectType) {
            parts.push(this.getProjectTypePrompt(context.projectType, context.techStack));
        }

        return parts.join('\n\n');
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
            COMMON_SYSTEM_PROMPTS.CODE_GENERATION,
            '',
            `프로젝트 타입: ${context.projectType}`,
            `기술 스택: ${context.techStack.join(', ')}`,
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

        // GPT-OSS 특화: 명확한 출력 형식 지정
        parts.push('', '## 출력 형식:', this.getGptOssOutputFormat());

        return parts.join('\n');
    }

    buildErrorCorrectionPrompt(context: ErrorCorrectionContext): string {
        const parts: string[] = [
            COMMON_SYSTEM_PROMPTS.ERROR_CORRECTION,
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
        const shellPrompt = this.getShellSpecificPrompt(context.shellType, context.osType);
        
        const parts: string[] = [
            COMMON_SYSTEM_PROMPTS.COMMAND_EXECUTION,
            '',
            shellPrompt,
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
                .filter(line => line.trim() && !line.trim().startsWith('#'))
                .map(line => line.trim());
            result.commands!.push(...commands);
        }

        return result;
    }

    handleStreamingChunk(chunk: string): StreamingChunk | null {
        // GPT-OSS 스트리밍 형식 처리
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
        return 128000; // GPT-OSS 120B의 컨텍스트 윈도우
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
        // Ollama API 엔드포인트
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

    // ==================== Private 헬퍼 메서드 ====================

    private getOSSpecificPrompt(context: SystemPromptContext): string {
        const osInfo = `당신은 ${context.osName} (${context.osType}) 환경에서 작동하고 있습니다.
셸 타입: ${context.shellType}

명령어 생성 시 다음을 준수하세요:
${context.osType === 'win32' ? 
    '- Windows PowerShell 또는 CMD 문법 사용\n- 경로 구분자로 백슬래시(\\) 사용\n- .exe 확장자 포함' :
    '- Bash/Zsh 문법 사용\n- 경로 구분자로 슬래시(/) 사용\n- Unix 스타일 명령어 사용'}`;

        return osInfo;
    }

    private getGptOssSpecificPrompt(context: SystemPromptContext): string {
        return `## GPT-OSS 특화 가이드라인:

1. **명확한 구조**: 응답은 명확한 섹션으로 구분하세요
2. **완전한 코드**: 부분 코드가 아닌 전체 파일 내용을 제공하세요
3. **단계별 설명**: 복잡한 작업은 단계별로 나누어 설명하세요
4. **에러 예방**: 잠재적 문제점과 해결책을 함께 제시하세요
5. **테스트 방법**: 생성한 코드의 테스트 방법을 포함하세요`;
    }

    private getProjectTypePrompt(projectType: string, techStack?: string[]): string {
        let prompt = `\n## 프로젝트 컨텍스트:\n프로젝트 타입: ${projectType}`;
        
        if (techStack && techStack.length > 0) {
            prompt += `\n기술 스택: ${techStack.join(', ')}`;
        }

        // 프로젝트 타입별 특화 가이드
        const typeGuides: Record<string, string> = {
            'Node.js': '- package.json 의존성을 고려하세요\n- ES6+ 문법을 사용하세요',
            'TypeScript': '- 타입 안정성을 보장하세요\n- tsconfig.json 설정을 준수하세요',
            'Spring Boot': '- Spring 어노테이션을 적절히 사용하세요\n- 의존성 주입 패턴을 따르세요',
            'React': '- React Hooks를 활용하세요\n- 컴포넌트 재사용성을 고려하세요',
            'Vue': '- Composition API를 우선 사용하세요\n- Vue 3 문법을 따르세요',
        };

        if (typeGuides[projectType]) {
            prompt += `\n\n${projectType} 특화 가이드:\n${typeGuides[projectType]}`;
        }

        return prompt;
    }

    private getShellSpecificPrompt(shellType: string, osType: string): string {
        const shellGuides: Record<string, string> = {
            bash: '```bash\n# Bash 명령어 예시\ncommand --option value\n```',
            zsh: '```zsh\n# Zsh 명령어 예시\ncommand --option value\n```',
            powershell: '```powershell\n# PowerShell 명령어 예시\nCommand-Verb -Parameter Value\n```',
            cmd: '```cmd\n# CMD 명령어 예시\ncommand /option value\n```',
        };

        return `명령어는 **${shellType}** 문법으로 작성하세요.\n\n예시:\n${shellGuides[shellType] || shellGuides.bash}`;
    }

    private getGptOssOutputFormat(): string {
        return `1. **작업 요약**: 수행할 작업의 개요를 먼저 작성
2. **파일 작업**: 각 파일마다 다음 형식 사용:
   - 새 파일: 파일경로
   - 수정 파일: 파일경로
   - 삭제 파일: 파일경로
3. **코드**: 마크다운 코드 블록으로 전체 내용 제공
4. **설명**: 변경사항에 대한 상세 설명
5. **테스트**: 동작 확인 방법`;
    }
}

