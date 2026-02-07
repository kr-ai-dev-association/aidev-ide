/**
 * Diff Content Provider
 * 커스텀 URI 스킴을 통해 원본 파일 내용을 제공
 */
export const DIFF_VIEW_URI_SCHEME = "aidev-diff";
export class DiffContentProvider {
    static instance;
    contentMap = new Map();
    static getInstance() {
        if (!DiffContentProvider.instance) {
            DiffContentProvider.instance = new DiffContentProvider();
        }
        return DiffContentProvider.instance;
    }
    /**
     * URI에서 텍스트 내용 제공
     * query 파라미터에 base64로 인코딩된 내용이 있으면 디코딩하여 반환
     */
    provideTextDocumentContent(uri) {
        // query 파라미터에 base64 인코딩된 내용이 있으면 디코딩
        if (uri.query) {
            try {
                return Buffer.from(uri.query, 'base64').toString('utf-8');
            }
            catch (error) {
                console.error('[DiffContentProvider] Failed to decode content from query:', error);
                return '';
            }
        }
        // 또는 contentMap에서 조회
        const content = this.contentMap.get(uri.path);
        return content || '';
    }
    /**
     * 내용을 맵에 저장 (선택적)
     */
    setContent(path, content) {
        this.contentMap.set(path, content);
    }
    /**
     * 내용 제거
     */
    clearContent(path) {
        this.contentMap.delete(path);
    }
}
//# sourceMappingURL=DiffContentProvider.js.map