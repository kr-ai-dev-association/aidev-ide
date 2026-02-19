/**
 * BaseManager
 * 모든 매니저의 공통 싱글톤 패턴을 제공하는 추상 클래스
 */
console.log('[BaseManager] Module loading...');
export class BaseManager {
    _context;
    static instances = new Map();
    constructor(_context) {
        this._context = _context;
    }
    get context() {
        return this._context;
    }
    /**
     * 싱글톤 인스턴스 가져오기
     * @param context - 첫 생성시에만 사용됨
     */
    static getInstance(context) {
        const key = this.name;
        if (!BaseManager.instances.has(key)) {
            BaseManager.instances.set(key, new this(context));
        }
        return BaseManager.instances.get(key);
    }
    /** 테스트용 */
    static clearAll() {
        BaseManager.instances.clear();
    }
}
//# sourceMappingURL=BaseManager.js.map