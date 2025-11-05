import { OllamaApi } from './ollama';

export type IntentCategory = 'code' | 'execution' | 'analysis' | 'documentation' | 'terminal';

export type IntentSubtype =
    | 'code_generate'
    | 'code_modify'
    | 'code_remove'
    | 'execution_build'
    | 'execution_run'
    | 'execution_install'
    | 'execution_deploy'
    | 'analysis_structure'
    | 'analysis_technology'
    | 'analysis_function'
    | 'analysis_branch'
    | 'documentation_general'
    | 'terminal_error_fix';

export type TaskType = 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal';

export interface IntentDetectionResult {
    category: IntentCategory;
    subtype: IntentSubtype;
    taskType: TaskType;
    confidence: number;
    keywords: string[];
    reasoning: string;
}

export class IntentDetectionService {
    private fallbackModelName = 'gemma2:2b';
    private keywordDictionary: Record<IntentSubtype, string[]> = {
        code_generate: ['생성', '만들', '작성', '추가', '새로', '새로운', '추가해', 'create', 'generate', 'implement', '작성해줘'],
        code_modify: ['수정', '변경', '고쳐', '리팩터', '정리', '개선', 'refactor', 'modify', 'update', '보완', '개편'],
        code_remove: ['삭제', '제거', '없애', '지워', 'remove', 'delete', '빼줘', '제거해줘'],
        execution_build: ['빌드', '컴파일', 'package', 'build', 'compile', 'bundle', '패키징'],
        execution_run: ['실행', '구동', 'run', 'start', 'launch', 'serve', '테스트 실행', '돌려줘'],
        execution_install: ['설치', 'install', '설정', 'setup', 'configure', '인스톨'],
        execution_deploy: ['배포', 'deploy', '배치', '배치', '배포해', 'deployment'],
        analysis_structure: ['구조', '구성', 'architecture', 'structure', '다이어그램', '트리', '파일 구성'],
        analysis_technology: ['기술', '언어', '프레임워크', '기술스택', 'stack', 'framework', 'library', '알고리즘'],
        analysis_function: ['기능', '동작', '설명', '사용자', 'feature', 'behavior', 'flow', 'use case'],
        analysis_branch: ['브랜치', 'branch', '이슈', 'issue', '문제점', '개선', '분석', '리뷰', '코드리뷰', '품질', 'quality', 'health', '상태', '정리', '정리해줘'],
        documentation_general: ['문서', 'documentation', 'README', '설명서', 'guide', 'manual', '정리해줘', '문서화'],
        terminal_error_fix: ['오류', '에러', 'error', '실패', 'fail', '문제', 'issue', '해결', 'fix', '수정', '고쳐', '터미널', 'terminal', '로그', 'log', '포트', 'port', 'kill', '죽여', '종료', 'stop']
    };

    private subtypeToCategory: Record<IntentSubtype, IntentCategory> = {
        code_generate: 'code',
        code_modify: 'code',
        code_remove: 'code',
        execution_build: 'execution',
        execution_run: 'execution',
        execution_install: 'execution',
        execution_deploy: 'execution',
        analysis_structure: 'analysis',
        analysis_technology: 'analysis',
        analysis_function: 'analysis',
        analysis_branch: 'analysis',
        documentation_general: 'documentation',
        terminal_error_fix: 'terminal'
    };

    private subtypeToTaskType: Record<IntentSubtype, TaskType> = {
        code_generate: 'code_work',
        code_modify: 'code_work',
        code_remove: 'code_work',
        execution_build: 'execution_work',
        execution_run: 'execution_work',
        execution_install: 'execution_work',
        execution_deploy: 'execution_work',
        analysis_structure: 'analysis',
        analysis_technology: 'analysis',
        analysis_function: 'analysis',
        analysis_branch: 'analysis',
        documentation_general: 'documentation',
        terminal_error_fix: 'terminal'
    };

    /**
     * 사용자 쿼리에서 코드 작성 vs 쉘 스크립트 작업(설치, 빌드, 배포, 실행)을 구별합니다.
     * 이는 매우 중요한 구별입니다 - 코드 작성은 소스 코드 파일을 생성/수정하는 것이고,
     * 쉘 스크립트 작업은 프로젝트의 설치, 빌드, 배포, 실행을 위한 스크립트를 생성하는 것입니다.
     */
    private determineTaskType(userQuery: string, subtype: IntentSubtype): TaskType {
        const lowerQuery = userQuery.toLowerCase();

        // 프로젝트 생성 관련 키워드 (항상 code_work로 분류)
        // "프로젝트 생성", "프로젝트 만들기" 등은 항상 소스 코드 파일 생성이므로 code_work
        const projectCreationKeywords = [
            '프로젝트 생성', '프로젝트 만들', '프로젝트 추가', '새 프로젝트', '프로젝트 초기화',
            'project create', 'project generate', 'new project', 'create project',
            '프로젝트 생성하고', '프로젝트 만들고', '프로젝트 생성해', '프로젝트 만들어',
            '프로젝트를 생성', '프로젝트를 만들', '프로젝트를 추가', '프로젝트를 초기화',
            '스프링 부트 프로젝트 생성', '스프링 프로젝트 생성', 'spring boot 프로젝트 생성',
            'react 프로젝트 생성', 'vue 프로젝트 생성', 'node 프로젝트 생성',
            'python 프로젝트 생성', 'java 프로젝트 생성', 'go 프로젝트 생성'
        ];

        // 개별 키워드로도 체크 (더 포괄적)
        const hasProjectKeyword = lowerQuery.includes('프로젝트') || lowerQuery.includes('project');
        const hasCreationKeyword = lowerQuery.includes('생성') || lowerQuery.includes('만들') ||
            lowerQuery.includes('create') || lowerQuery.includes('generate') ||
            lowerQuery.includes('추가') || lowerQuery.includes('초기화');

        const isProjectCreation = projectCreationKeywords.some(keyword => lowerQuery.includes(keyword)) ||
            (hasProjectKeyword && hasCreationKeyword && subtype === 'code_generate');

        // 순수 실행 관련 키워드 (빌드만, 실행만 할 때)
        const pureExecutionKeywords = [
            '빌드만', 'build only', '실행만', 'run only', '컴파일만', 'compile only',
            '빌드해줘', 'build 해줘', '실행해줘', 'run 해줘', '컴파일해줘', 'compile 해줘',
            'npm install', 'yarn install', 'pip install', 'mvn install', 'mvn compile',
            'mvn package', 'mvn clean', 'gradle build', 'gradle run'
        ];

        const isPureExecution = pureExecutionKeywords.some(keyword => lowerQuery.includes(keyword));

        // 일반 execution 관련 키워드
        const executionKeywords = [
            '설치', 'install', 'setup', '빌드', 'build', 'compile', '실행', 'run', 'start',
            '배포', 'deploy', '배치', 'serve', 'launch', '컴파일', '패키징', 'package',
            'docker', '스크립트', 'script', '.sh', '.bat', '.ps1', 'shell', 'bash', 'zsh'
        ];

        const hasExecutionKeywords = executionKeywords.some(keyword => lowerQuery.includes(keyword));

        // 코드 작성 관련 키워드
        const codeWorkKeywords = [
            '함수', 'function', '클래스', 'class', '모듈', 'module', '컴포넌트', 'component',
            'api', 'endpoint', 'route', 'handler', 'service', 'controller', 'model', 'view',
            '구현', 'implement', '작성', 'create', 'generate', '코드', 'code', '생성', '만들'
        ];

        const hasCodeWorkKeywords = codeWorkKeywords.some(keyword => lowerQuery.includes(keyword));

        // 1. 프로젝트 생성이 포함된 경우 - 항상 code_work (생성 + 빌드도 생성이 우선)
        if (isProjectCreation) {
            return 'code_work';
        }

        // 2. subtype이 code_generate인 경우 - code_work 우선
        if (subtype === 'code_generate' || subtype === 'code_modify' || subtype === 'code_remove') {
            // 단, "빌드만", "실행만" 같은 순수 실행 요청이면 execution_work
            if (isPureExecution && !hasCodeWorkKeywords) {
                return 'execution_work';
            }
            // 프로젝트 생성이 포함되거나 코드 생성이면 code_work
            return 'code_work';
        }

        // 3. subtype이 execution_*인 경우
        if (subtype === 'execution_build' || subtype === 'execution_run' || subtype === 'execution_install' || subtype === 'execution_deploy') {
            return 'execution_work';
        }

        // 4. subtype 기반 판단
        if (this.subtypeToTaskType[subtype]) {
            const baseTaskType = this.subtypeToTaskType[subtype];

            // 코드 생성인데 순수 실행만 요청하는 경우만 execution_work로 변경
            if (baseTaskType === 'code_work' && isPureExecution && !hasCodeWorkKeywords && !isProjectCreation) {
                return 'execution_work';
            }

            return baseTaskType;
        }

        // 5. 기본 판단: 순수 실행 요청이면 execution_work
        if (isPureExecution && !hasCodeWorkKeywords) {
            return 'execution_work';
        }

        // 6. 코드 관련 키워드가 있으면 code_work
        if (hasCodeWorkKeywords) {
            return 'code_work';
        }

        // 7. execution 키워드만 있으면 execution_work
        if (hasExecutionKeywords) {
            return 'execution_work';
        }

        // 8. 코드 관련 subtype이면 code_work
        if (subtype.startsWith('code_')) {
            return 'code_work';
        }

        // 기본값
        return 'analysis';
    }

    constructor(private ollamaApi: OllamaApi) { }

    public async detectIntent(userQuery: string): Promise<IntentDetectionResult> {
        const keywordScore = this.keywordVote(userQuery);
        let bestSubtype = keywordScore.bestSubtype;
        let reasoning = keywordScore.reasoning;
        let confidence = keywordScore.confidence;

        console.log('[IntentDetectionService] Keyword vote result:', keywordScore);

        if (confidence < 0.6) {
            try {
                const llmRaw = await this.queryLLMForIntent(userQuery);
                if (llmRaw) {
                    bestSubtype = llmRaw.subtype;
                    reasoning = llmRaw.reasoning;
                    confidence = llmRaw.confidence;
                    console.log('[IntentDetectionService] Fallback gemma2 intent result:', llmRaw);
                }
            } catch (error) {
                console.warn('[IntentDetectionService] gemma2:2b 의도 판별 실패, 키워드 기반 결과 사용:', error);
            }
        }

        const uniqueKeywords = Array.from(new Set(keywordScore.matchedKeywords));

        // taskType 판별 (코드 작성 vs 쉘 스크립트 작업 구별)
        const taskType = this.determineTaskType(userQuery, bestSubtype);

        const result: IntentDetectionResult = {
            category: this.subtypeToCategory[bestSubtype],
            subtype: bestSubtype,
            taskType: taskType,
            confidence,
            keywords: uniqueKeywords,
            reasoning: `${reasoning} | TaskType: ${taskType}`
        };

        console.log('[IntentDetectionService] Final intent result:', result);
        return result;
    }

    private keywordVote(userQuery: string): {
        bestSubtype: IntentSubtype;
        confidence: number;
        matchedKeywords: string[];
        reasoning: string;
    } {
        const lowerQuery = userQuery.toLowerCase();
        let bestSubtype: IntentSubtype = 'analysis_structure';
        let bestScore = 0;
        const matchedKeywords: string[] = [];

        for (const [subtype, keywords] of Object.entries(this.keywordDictionary) as Array<[IntentSubtype, string[]]>) {
            let score = 0;
            const matchedForSubtype: string[] = [];
            for (const keyword of keywords) {
                if (lowerQuery.includes(keyword.toLowerCase())) {
                    score += 1;
                    matchedKeywords.push(keyword);
                    matchedForSubtype.push(keyword);
                }
            }
            if (matchedForSubtype.length > 0) {
                console.log(`[IntentDetectionService] Matched keywords for ${subtype}:`, matchedForSubtype);
            }
            if (score > bestScore) {
                bestScore = score;
                bestSubtype = subtype;
            }
        }

        const confidence = Math.min(0.9, 0.3 + bestScore * 0.2);
        const reasoning = bestScore > 0
            ? `키워드 매칭 (${matchedKeywords.join(', ')}) 기반으로 '${bestSubtype}' 의도로 판단.`
            : '명확한 키워드가 없어 기본 의도를 사용.';

        return { bestSubtype, confidence, matchedKeywords, reasoning };
    }

    private async queryLLMForIntent(userQuery: string): Promise<{ subtype: IntentSubtype; confidence: number; reasoning: string } | null> {
        const prompt = `다음 사용자 요청을 다섯 가지 의도 카테고리와 세부 유형으로 분류하세요.

**매우 중요: 코드 작성 vs 쉘 스크립트 작업 구별**
- 코드 작성(code_generate, code_modify, code_remove): 소스 코드 파일(.js, .ts, .py, .java 등)을 생성/수정/삭제하는 작업
  - "프로젝트 생성", "프로젝트 만들기" 등은 항상 code_generate로 분류 (소스 파일 생성)
  - "생성하고 빌드해줘" 같은 경우도 code_generate (생성이 주요 작업)
- 쉘 스크립트 작업(execution_*): 프로젝트의 설치, 빌드, 배포, 실행을 위한 스크립트(.sh, .bat, .ps1 등)를 생성하거나 터미널 명령을 실행하는 작업
  - "빌드만 해줘", "실행만 해줘" 같은 순수 실행 요청만 execution_*로 분류

카테고리 및 세부 유형 목록:
1. 코드
  - code_generate: 새 코드를 작성 (소스 코드 파일 생성)
    * "프로젝트 생성", "프로젝트 만들기" 포함
    * "생성하고 빌드" 같은 경우도 생성이 우선이므로 code_generate
  - code_modify: 기존 코드를 수정/개선 (소스 코드 파일 수정)
  - code_remove: 기존 코드나 기능 제거 (소스 코드 파일 삭제)
2. 실행 (쉘 스크립트 작업)
  - execution_install: 프로젝트 설치/설정 (npm install, pip install 등)
  - execution_build: 프로젝트 빌드만 (compile, package 등) - 생성 없이 빌드만
  - execution_run: 프로젝트 실행만 (run, start, serve 등) - 생성 없이 실행만
  - execution_deploy: 프로젝트 배포(deploy, 배치 등)
3. 분석
  - analysis_structure: 구조 분석 (다이어그램, 트리 구조 등)
  - analysis_technology: 기술/언어/프레임워크 분석
  - analysis_function: 기능 분석 (사용자 관점, 동작 설명)
4. 문서 작성
  - documentation_general: 문서/가이드 작성
5. 터미널 오류 수정
  - terminal_error_fix: 터미널 오류, 로그 문제, 포트 충돌 등 해결

출력 형식 (JSON):
{
  "subtype": "code_modify",
  "confidence": 0.8,
  "reasoning": "간단한 설명"
}

사용자 요청: "${userQuery}"`;

        const previousModel = this.ollamaApi.getModel();
        const previousEndpoint = this.ollamaApi.getEndpoint();
        const previousUrl = this.ollamaApi.getApiUrl();

        this.ollamaApi.setModel(this.fallbackModelName);
        this.ollamaApi.setEndpoint('/api/generate');
        this.ollamaApi.setApiUrl('http://localhost:11434');

        try {
            console.log('[IntentDetectionService] === INTENT PROMPT START ===');
            console.log(prompt);
            console.log('[IntentDetectionService] === INTENT PROMPT END ===');
            const response = await this.ollamaApi.sendMessage(prompt, {});
            console.log('[IntentDetectionService] Fallback gemma2 raw response:', response);
            const parsed = this.safeParseIntentResponse(response);
            if (parsed) {
                return parsed;
            }
        } finally {
            this.ollamaApi.setModel(previousModel);
            this.ollamaApi.setEndpoint(previousEndpoint);
            this.ollamaApi.setApiUrl(previousUrl);
        }

        return null;
    }

    private safeParseIntentResponse(response: string): { subtype: IntentSubtype; confidence: number; reasoning: string } | null {
        try {
            const match = response.match(/\{[\s\S]*\}/);
            if (!match) {
                return null;
            }
            const parsed = JSON.parse(match[0]);
            if (parsed.subtype && this.subtypeToCategory[parsed.subtype as IntentSubtype]) {
                return {
                    subtype: parsed.subtype as IntentSubtype,
                    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.6,
                    reasoning: parsed.reasoning || 'LLM 기반 분류 결과'
                };
            }
        } catch (error) {
            console.warn('[IntentDetectionService] 의도 응답 파싱 실패:', error);
        }
        return null;
    }
}

