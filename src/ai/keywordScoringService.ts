// @ts-ignore
import * as evaluate from 'evaluate';

export interface KeywordScore {
    keyword: string;
    score: number;
    metrics: {
        bleu: number;
        rougeL: number;
        meteor: number;
        bertScore: number;
    };
}

export interface ProjectContext {
    framework: string;
    projectType: string;
    fileNames: string[];
    directoryNames: string[];
}

export class KeywordScoringService {
    private evaluate: any;

    constructor() {
        this.evaluate = evaluate;
    }

    /**
     * 사용자 질의어와 키워드들 간의 관련성을 다중 메트릭으로 평가합니다.
     * @param userQuery 사용자의 질의어
     * @param keywords 평가할 키워드 목록
     * @param projectContext 프로젝트 컨텍스트 정보
     * @returns 점수가 매겨진 키워드 목록
     */
    async scoreKeywords(
        userQuery: string,
        keywords: string[],
        projectContext: ProjectContext
    ): Promise<KeywordScore[]> {
        const scoredKeywords: KeywordScore[] = [];

        for (const keyword of keywords) {
            try {
                const metrics = await this.calculateMetrics(userQuery, keyword, projectContext);
                const combinedScore = this.calculateHarmonicMean(metrics);
                
                scoredKeywords.push({
                    keyword,
                    score: combinedScore,
                    metrics
                });
            } catch (error) {
                console.warn(`[KeywordScoringService] Failed to score keyword "${keyword}":`, error);
                // 실패한 경우 기본 점수 부여
                scoredKeywords.push({
                    keyword,
                    score: 0.1,
                    metrics: {
                        bleu: 0.1,
                        rougeL: 0.1,
                        meteor: 0.1,
                        bertScore: 0.1
                    }
                });
            }
        }

        // 점수 순으로 정렬
        return scoredKeywords.sort((a, b) => b.score - a.score);
    }

    /**
     * 다중 메트릭을 계산합니다.
     */
    private async calculateMetrics(
        userQuery: string,
        keyword: string,
        projectContext: ProjectContext
    ): Promise<{ bleu: number; rougeL: number; meteor: number; bertScore: number }> {
        // 텍스트 정규화
        const normalizedQuery = this.normalizeText(userQuery);
        const normalizedKeyword = this.normalizeText(keyword);

        // BLEU 점수 계산
        const bleuScore = await this.calculateBLEU(normalizedQuery, normalizedKeyword);
        
        // ROUGE-L 점수 계산
        const rougeLScore = await this.calculateROUGEL(normalizedQuery, normalizedKeyword);
        
        // METEOR 점수 계산
        const meteorScore = await this.calculateMETEOR(normalizedQuery, normalizedKeyword);
        
        // BERTScore 계산 (프로젝트 컨텍스트 고려)
        const bertScore = await this.calculateBERTScore(normalizedQuery, normalizedKeyword, projectContext);

        return {
            bleu: bleuScore,
            rougeL: rougeLScore,
            meteor: meteorScore,
            bertScore: bertScore
        };
    }

    /**
     * BLEU 점수를 계산합니다.
     */
    private async calculateBLEU(query: string, keyword: string): Promise<number> {
        try {
            const bleu = await this.evaluate.load('bleu');
            const result = await bleu.compute({
                predictions: [query],
                references: [[keyword]]
            });
            return result.bleu || 0;
        } catch (error) {
            console.warn('[KeywordScoringService] BLEU calculation failed:', error);
            return this.calculateSimpleBLEU(query, keyword);
        }
    }

    /**
     * ROUGE-L 점수를 계산합니다.
     */
    private async calculateROUGEL(query: string, keyword: string): Promise<number> {
        try {
            const rouge = await this.evaluate.load('rouge');
            const result = await rouge.compute({
                predictions: [query],
                references: [[keyword]]
            });
            return result.rougeL || 0;
        } catch (error) {
            console.warn('[KeywordScoringService] ROUGE-L calculation failed:', error);
            return this.calculateSimpleROUGEL(query, keyword);
        }
    }

    /**
     * METEOR 점수를 계산합니다.
     */
    private async calculateMETEOR(query: string, keyword: string): Promise<number> {
        try {
            const meteor = await this.evaluate.load('meteor');
            const result = await meteor.compute({
                predictions: [query],
                references: [[keyword]]
            });
            return result.meteor || 0;
        } catch (error) {
            console.warn('[KeywordScoringService] METEOR calculation failed:', error);
            return this.calculateSimpleMETEOR(query, keyword);
        }
    }

    /**
     * BERTScore를 계산합니다 (프로젝트 컨텍스트 고려).
     */
    private async calculateBERTScore(
        query: string,
        keyword: string,
        projectContext: ProjectContext
    ): Promise<number> {
        try {
            const bertScore = await this.evaluate.load('bertscore');
            const result = await bertScore.compute({
                predictions: [query],
                references: [[keyword]],
                model_type: 'microsoft/DialoGPT-medium' // 한국어 지원 모델
            });
            return result.f1[0] || 0;
        } catch (error) {
            console.warn('[KeywordScoringService] BERTScore calculation failed:', error);
            return this.calculateContextualSimilarity(query, keyword, projectContext);
        }
    }

    /**
     * 조화 평균을 계산합니다.
     */
    private calculateHarmonicMean(metrics: { bleu: number; rougeL: number; meteor: number; bertScore: number }): number {
        const { bleu, rougeL, meteor, bertScore } = metrics;
        
        // 0이 아닌 값들만 고려
        const values = [bleu, rougeL, meteor, bertScore].filter(v => v > 0);
        
        if (values.length === 0) return 0;
        
        // 조화 평균 계산
        const harmonicMean = values.length / values.reduce((sum, val) => sum + 1 / val, 0);
        
        // BERTScore에 더 높은 가중치 부여 (의미적 유사도가 더 중요)
        const weightedScore = (bleu * 0.2 + rougeL * 0.2 + meteor * 0.2 + bertScore * 0.4);
        
        return Math.max(harmonicMean, weightedScore);
    }

    /**
     * 텍스트를 정규화합니다.
     */
    private normalizeText(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\s가-힣]/g, ' ') // 특수문자 제거
            .replace(/\s+/g, ' ') // 연속 공백 제거
            .trim();
    }

    /**
     * 프로젝트 컨텍스트를 고려한 유사도 계산
     */
    private calculateContextualSimilarity(
        query: string,
        keyword: string,
        projectContext: ProjectContext
    ): number {
        let score = 0;
        
        // 기본 문자열 유사도
        score += this.calculateJaccardSimilarity(query, keyword) * 0.3;
        
        // 프레임워크 관련 키워드 보너스
        if (this.isFrameworkRelated(keyword, projectContext.framework)) {
            score += 0.2;
        }
        
        // 파일명 관련 키워드 보너스
        if (this.isFileNameRelated(keyword, projectContext.fileNames)) {
            score += 0.2;
        }
        
        // 디렉토리명 관련 키워드 보너스
        if (this.isDirectoryRelated(keyword, projectContext.directoryNames)) {
            score += 0.1;
        }
        
        // 프로젝트 타입 관련 키워드 보너스
        if (this.isProjectTypeRelated(keyword, projectContext.projectType)) {
            score += 0.2;
        }
        
        return Math.min(score, 1.0);
    }

    /**
     * Jaccard 유사도 계산
     */
    private calculateJaccardSimilarity(text1: string, text2: string): number {
        const words1 = new Set(text1.split(' '));
        const words2 = new Set(text2.split(' '));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    /**
     * 프레임워크 관련 키워드인지 확인
     */
    private isFrameworkRelated(keyword: string, framework: string): boolean {
        const frameworkKeywords: { [key: string]: string[] } = {
            'react': ['react', 'jsx', 'component', 'hook', 'state', 'props'],
            'vue': ['vue', 'component', 'template', 'script', 'style'],
            'angular': ['angular', 'component', 'service', 'directive', 'module'],
            'spring': ['spring', 'boot', 'controller', 'service', 'repository'],
            'django': ['django', 'model', 'view', 'template', 'url'],
            'flask': ['flask', 'route', 'template', 'blueprint'],
            'fastapi': ['fastapi', 'endpoint', 'pydantic', 'async'],
            'express': ['express', 'route', 'middleware', 'controller'],
            'next': ['next', 'page', 'api', 'ssr', 'ssg']
        };
        
        const keywords = frameworkKeywords[framework.toLowerCase()] || [];
        return keywords.some((k: string) => keyword.toLowerCase().includes(k));
    }

    /**
     * 파일명 관련 키워드인지 확인
     */
    private isFileNameRelated(keyword: string, fileNames: string[]): boolean {
        return fileNames.some(fileName => 
            fileName.toLowerCase().includes(keyword.toLowerCase()) ||
            keyword.toLowerCase().includes(fileName.toLowerCase())
        );
    }

    /**
     * 디렉토리명 관련 키워드인지 확인
     */
    private isDirectoryRelated(keyword: string, directoryNames: string[]): boolean {
        return directoryNames.some(dirName => 
            dirName.toLowerCase().includes(keyword.toLowerCase()) ||
            keyword.toLowerCase().includes(dirName.toLowerCase())
        );
    }

    /**
     * 프로젝트 타입 관련 키워드인지 확인
     */
    private isProjectTypeRelated(keyword: string, projectType: string): boolean {
        const typeKeywords: { [key: string]: string[] } = {
            'web': ['web', 'html', 'css', 'javascript', 'frontend', 'backend'],
            'mobile': ['mobile', 'ios', 'android', 'react-native', 'flutter'],
            'desktop': ['desktop', 'electron', 'gui', 'native'],
            'api': ['api', 'rest', 'graphql', 'endpoint', 'service'],
            'library': ['library', 'package', 'module', 'utility']
        };
        
        const keywords = typeKeywords[projectType.toLowerCase()] || [];
        return keywords.some((k: string) => keyword.toLowerCase().includes(k));
    }

    /**
     * 간단한 BLEU 점수 계산 (fallback)
     */
    private calculateSimpleBLEU(query: string, keyword: string): number {
        const queryWords = query.split(' ');
        const keywordWords = keyword.split(' ');
        
        const matches = queryWords.filter(word => keywordWords.includes(word));
        return matches.length / Math.max(queryWords.length, keywordWords.length);
    }

    /**
     * 간단한 ROUGE-L 점수 계산 (fallback)
     */
    private calculateSimpleROUGEL(query: string, keyword: string): number {
        const queryWords = query.split(' ');
        const keywordWords = keyword.split(' ');
        
        // LCS (Longest Common Subsequence) 계산
        const lcs = this.calculateLCS(queryWords, keywordWords);
        const precision = lcs / keywordWords.length;
        const recall = lcs / queryWords.length;
        
        if (precision + recall === 0) return 0;
        return (2 * precision * recall) / (precision + recall);
    }

    /**
     * 간단한 METEOR 점수 계산 (fallback)
     */
    private calculateSimpleMETEOR(query: string, keyword: string): number {
        const queryWords = query.split(' ');
        const keywordWords = keyword.split(' ');
        
        const matches = queryWords.filter(word => keywordWords.includes(word));
        const precision = matches.length / queryWords.length;
        const recall = matches.length / keywordWords.length;
        
        if (precision + recall === 0) return 0;
        return (2 * precision * recall) / (precision + recall);
    }

    /**
     * LCS (Longest Common Subsequence) 계산
     */
    private calculateLCS(arr1: string[], arr2: string[]): number {
        const m = arr1.length;
        const n = arr2.length;
        const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (arr1[i - 1] === arr2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        return dp[m][n];
    }
}
