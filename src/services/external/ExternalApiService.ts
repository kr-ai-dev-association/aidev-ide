import * as vscode from 'vscode';
console.log('[ExternalApiService] Module loading...');
console.log('[ExternalApiService] Importing StateManager...');
import { StateManager } from '../../core/managers/state/StateManager';
console.log('[ExternalApiService] StateManager imported');

export interface NewsData {
    title: string;
    description: string;
    url: string;
    publishedAt: string;
    source: string;
}

// 네이버 뉴스 API 응답 타입 정의
interface NaverNewsApiResponse {
    lastBuildDate: string;
    total: number;
    start: number;
    display: number;
    items: Array<{
        title: string;
        originallink: string;
        link: string;
        description: string;
        pubDate: string;
    }>;
}

export class ExternalApiService {
    private stateManager: StateManager;

    constructor(context: vscode.ExtensionContext) {
        this.stateManager = StateManager.getInstance(context);
    }

    /**
     * 뉴스 정보를 가져옵니다 (네이버 뉴스 검색 API 사용)
     */
    async getNewsData(query: string = 'IT', count: number = 10): Promise<NewsData[]> {
        try {
            const clientId = await this.stateManager.getNewsApiKey();
            const clientSecret = await this.stateManager.getNewsApiSecret();

            if (!clientId || !clientSecret) {
                console.warn('Naver News API credentials not configured');
                return [];
            }

            // 네이버 API는 한 번에 최대 100개까지 요청 가능하지만, 
            // 실제로는 10-20개 정도가 적절한 응답 시간을 보장
            const displayCount = Math.min(count, 20);

            const response = await fetch(
                `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${displayCount}&sort=date`,
                {
                    headers: {
                        'X-Naver-Client-Id': clientId,
                        'X-Naver-Client-Secret': clientSecret
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Naver News API error: ${response.status}`);
            }

            const data = await response.json() as NaverNewsApiResponse;

            return data.items.map((item) => ({
                title: this.decodeHtmlEntities(item.title),
                description: this.decodeHtmlEntities(item.description),
                url: item.link,
                publishedAt: new Date(item.pubDate).toLocaleString('ko-KR'),
                source: this.extractSourceFromUrl(item.originallink)
            }));
        } catch (error) {
            console.error('Error fetching news data:', error);
            return [];
        }
    }

    /**
     * HTML 엔티티를 디코딩합니다 (네이버 API 응답에서 HTML 태그 제거)
     */
    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]*>/g, '') // HTML 태그 제거
            .trim();
    }

    /**
     * URL에서 뉴스 소스를 추출합니다
     */
    private extractSourceFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;

            // 주요 뉴스 사이트 매핑
            const sourceMap: { [key: string]: string } = {
                'news.naver.com': '네이버뉴스',
                'www.chosun.com': '조선일보',
                'www.donga.com': '동아일보',
                'www.hani.co.kr': '한겨레',
                'www.khan.co.kr': '경향신문',
                'www.kyunghyang.com': '경향신문',
                'www.mk.co.kr': '매일경제',
                'www.hankyung.com': '한국경제',
                'www.etnews.com': '전자신문',
                'www.zdnet.co.kr': 'ZDNet Korea',
                'www.itworld.co.kr': 'ITWorld',
                'www.ciokorea.com': 'CIO Korea'
            };

            return sourceMap[hostname] || hostname.replace('www.', '');
        } catch {
            return '알 수 없음';
        }
    }

    /**
     * 실시간 정보 요약을 생성합니다
     */
    async getRealTimeSummary(newsQuery?: string): Promise<string> {
        let summary = '## 실시간 정보 요약\n\n';

        // 뉴스 정보
        if (newsQuery) {
            const news = await this.getNewsData(newsQuery, 3);
            if (news.length > 0) {
                summary += `### 📰 ${newsQuery} 관련 뉴스\n`;
                news.forEach((item, index) => {
                    summary += `${index + 1}. **${item.title}**\n`;
                    summary += `   - ${item.description}\n`;
                    summary += `   - 출처: ${item.source} (${item.publishedAt})\n\n`;
                });
            }
        }

        return summary;
    }

    /**
     * 뉴스 API 연결 테스트 (API 키만으로 테스트)
     */
    static async testNewsApiConnection(apiKey: string): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            const url = `https://newsapi.org/v2/top-headlines?country=kr&apiKey=${apiKey}`;
            const res = await fetch(url, { method: 'GET' });
            const data = await res.json();
            if (!res.ok) {
                return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
            }
            return { success: true, data };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

