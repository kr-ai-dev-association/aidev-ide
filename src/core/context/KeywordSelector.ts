export interface KeywordSelectionResult {
    keywords: string[];
    reasoning: string;
    confidence: number;
}

export interface ProjectContext {
    framework: string;
    projectType: string;
    fileNames: string[];
    directoryNames: string[];
}

export class KeywordSelector {
    // 현재 구현은 LLM 호출 없이, 또는 간단한 스텁으로 동작합니다.
    // 향후 ModelManager/ActionManager와 통합하여 실제 LLM 호출로 교체할 수 있습니다.

    /**
     * LLM을 사용하여 사용자 질의에서 관련 키워드를 선택합니다.
     * @param userQuery 사용자의 질의
     * @param projectContext 프로젝트 컨텍스트
     * @param availableKeywords 사용 가능한 키워드 목록
     * @returns 선택된 키워드와 추론 과정
     */
    async selectKeywordsWithLLM(
        userQuery: string,
        projectContext: ProjectContext,
        availableKeywords: string[]
    ): Promise<KeywordSelectionResult> {
        try {
            const systemPrompt = this.createSystemPrompt(projectContext, availableKeywords);
            const userPrompt = this.createUserPrompt(userQuery);

            // TODO: ModelManager를 이용한 실제 LLM 호출로 교체
            const response = await this.callCurrentLLM(systemPrompt, userPrompt, availableKeywords);

            // 응답 파싱
            return this.parseKeywordSelectionResponse(response);

        } catch (error) {
            console.warn('[KeywordSelector] LLM 키워드 선택 실패:', error);
            // 실패 시 기본 키워드 선택
            return this.getFallbackKeywords(userQuery, availableKeywords);
        }
    }

    /**
     * 시스템 프롬프트를 생성합니다.
     */
    private createSystemPrompt(projectContext: ProjectContext, availableKeywords: string[]): string {
        return `당신은 코드 분석 전문가입니다. 사용자의 질의를 분석하여 가장 관련성이 높은 키워드들을 선택해야 합니다.

프로젝트 정보:
- 프레임워크: ${projectContext.framework}
- 프로젝트 타입: ${projectContext.projectType}
- 주요 파일명: ${projectContext.fileNames.slice(0, 10).join(', ')}
- 주요 디렉토리: ${projectContext.directoryNames.slice(0, 10).join(', ')}

사용 가능한 키워드 목록:
${availableKeywords.map((keyword, index) => `${index + 1}. ${keyword}`).join('\n')}

다음 JSON 형식으로 응답해주세요:
{
  "keywords": ["선택된_키워드1", "선택된_키워드2", "선택된_키워드3"],
  "reasoning": "키워드 선택 이유를 간단히 설명",
  "confidence": 0.85
}

선택 기준:
1. 사용자 질의와 직접적으로 관련된 키워드 우선
2. 프로젝트 컨텍스트와 일치하는 키워드 우선
3. 최대 5개까지만 선택
4. confidence는 0.0-1.0 사이의 값으로 설정`;
    }

    /**
     * 사용자 프롬프트를 생성합니다.
     */
    private createUserPrompt(userQuery: string): string {
        return `사용자 질의: "${userQuery}"

위 질의를 분석하여 가장 관련성이 높은 키워드들을 선택해주세요.`;
    }

    /**
     * LLM 응답을 파싱합니다.
     */
    private parseKeywordSelectionResponse(response: string): KeywordSelectionResult {
        try {
            // JSON 블록 추출
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('JSON 형식을 찾을 수 없습니다.');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
                reasoning: parsed.reasoning || '키워드 선택 완료',
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
            };

        } catch (error) {
            console.warn('[KeywordSelector] 응답 파싱 실패:', error);
            return this.getFallbackKeywords('', []);
        }
    }

    /**
     * 현재 설정된 LLM을 호출합니다.
     * 현재는 단순 스텁 구현으로, 상위에서 전달된 키워드를 그대로 일부 반환합니다.
     */
    private async callCurrentLLM(systemPrompt: string, userPrompt: string, availableKeywords: string[]): Promise<string> {
        try {
            // 임시로 기본 응답 반환 (실제 구현에서는 ModelManager/LLM 어댑터 사용)
            return JSON.stringify({
                keywords: availableKeywords.slice(0, 3),
                reasoning: 'LLM 키워드 선택 (임시 구현)',
                confidence: 0.7
            });
        } catch (error) {
            throw new Error(`LLM 호출 실패: ${error}`);
        }
    }

    /**
     * 실패 시 사용할 기본 키워드 선택
     */
    private getFallbackKeywords(userQuery: string, availableKeywords: string[]): KeywordSelectionResult {
        // 간단한 키워드 매칭
        const queryWords = userQuery.toLowerCase().split(/\s+/);
        const matchedKeywords = availableKeywords.filter(keyword =>
            queryWords.some(word => keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase()))
        );

        return {
            keywords: matchedKeywords.slice(0, 5),
            reasoning: '기본 키워드 매칭 사용',
            confidence: 0.3
        };
    }
}


