import { OllamaApi } from './ollama';

export type IntentCategory = 'code' | 'execution' | 'analysis' | 'documentation' | 'terminal';

export type IntentSubtype =
    | 'code_generate'
    | 'code_modify'
    | 'code_remove'
    | 'execution_build'
    | 'execution_run'
    | 'analysis_structure'
    | 'analysis_technology'
    | 'analysis_function'
    | 'analysis_branch'
    | 'documentation_general'
    | 'terminal_error_fix';

export interface IntentDetectionResult {
    category: IntentCategory;
    subtype: IntentSubtype;
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
        analysis_structure: 'analysis',
        analysis_technology: 'analysis',
        analysis_function: 'analysis',
        analysis_branch: 'analysis',
        documentation_general: 'documentation',
        terminal_error_fix: 'terminal'
    };

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

        const result: IntentDetectionResult = {
            category: this.subtypeToCategory[bestSubtype],
            subtype: bestSubtype,
            confidence,
            keywords: uniqueKeywords,
            reasoning
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

카테고리 및 세부 유형 목록:
1. 코드
  - code_generate: 새 코드를 작성
  - code_modify: 기존 코드를 수정/개선
  - code_remove: 기존 코드나 기능 제거
2. 실행
  - execution_build: 프로젝트 빌드(compile 등)
  - execution_run: 프로젝트 실행(run, serve 등)
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

