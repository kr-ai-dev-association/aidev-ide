/**
 * Project Context Cache Manager
 * 프로젝트 구조 및 자주 참조하는 파일을 캐싱하여 성능 향상
 */
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
export class ProjectContextCache {
    static instance;
    context;
    options;
    cache = new Map();
    stats = { hits: 0, misses: 0 };
    cleanupTimer;
    fileWatchers = new Map();
    // 자주 참조되는 파일 목록 (우선순위 높음)
    // ⚠️ Lock 파일(package-lock.json, yarn.lock 등)은 절대 추가 금지 (수천~수만 줄)
    PRIORITY_FILES = [
        // 프로젝트 설정
        'package.json',
        'tsconfig.json',
        'jsconfig.json',
        'pyproject.toml',
        'requirements.txt',
        'go.mod',
        'pom.xml',
        'build.gradle',
        'Cargo.toml',
        '.env',
        'README.md',
        // 린트 및 포맷팅 (코드 스타일)
        '.eslintrc',
        '.eslintrc.json',
        '.eslintrc.js',
        'eslint.config.js',
        '.prettierrc',
        '.prettierrc.json',
        // 무시할 파일 설정
        '.gitignore',
        '.dockerignore',
        // 프레임워크 및 빌드 설정 (webpack.config.*는 300~1000줄 흔하므로 제외)
        'next.config.js',
        'next.config.mjs',
        'next.config.ts',
        'vite.config.ts',
        'vite.config.js',
        'tailwind.config.js',
        'tailwind.config.ts',
        // 인프라 및 실행 스크립트
        'Dockerfile',
        'docker-compose.yml',
        'docker-compose.yaml',
        'Makefile'
    ];
    constructor(context) {
        this.context = context;
        // 기본 옵션
        this.options = {
            defaultTTL: 300000, // 5분
            maxCacheSize: 10 * 1024 * 1024, // 10MB
            maxEntries: 100,
            cleanupInterval: 60000, // 1분
            persistToDisk: true
        };
        this.initialize();
    }
    static getInstance(context) {
        if (!ProjectContextCache.instance && context) {
            ProjectContextCache.instance = new ProjectContextCache(context);
        }
        return ProjectContextCache.instance;
    }
    /**
     * 초기화
     */
    async initialize() {
        try {
            // 설정 로드
            await this.loadOptions();
            // 캐시 데이터 로드 (디스크에서)
            if (this.options.persistToDisk) {
                await this.loadCacheFromDisk();
            }
            // 자동 정리 시작
            this.startCleanupTimer();
            console.log('[ProjectContextCache] Initialized');
        }
        catch (error) {
            console.error('[ProjectContextCache] Initialization failed:', error);
        }
    }
    /**
     * 파일 내용 캐싱
     */
    async cacheFile(filePath, ttl) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const stats = await fs.stat(filePath);
            const cacheData = {
                path: filePath,
                content,
                lastModified: stats.mtimeMs,
                encoding: 'utf-8'
            };
            const cacheKey = this.generateFileKey(filePath);
            this.set(cacheKey, cacheData, ttl);
            // 파일 변경 감지 (자동 무효화)
            this.watchFile(filePath);
            console.log(`[ProjectContextCache] Cached file: ${filePath}`);
        }
        catch (error) {
            console.error(`[ProjectContextCache] Failed to cache file ${filePath}:`, error);
        }
    }
    /**
     * 캐시된 파일 내용 가져오기
     */
    async getFile(filePath) {
        const cacheKey = this.generateFileKey(filePath);
        const cached = this.get(cacheKey);
        if (cached) {
            // 파일이 변경되었는지 확인
            try {
                const stats = await fs.stat(filePath);
                if (stats.mtimeMs > cached.lastModified) {
                    // 파일이 변경됨 - 캐시 무효화 및 재캐싱
                    this.invalidate(cacheKey);
                    await this.cacheFile(filePath);
                    const newCached = this.get(cacheKey);
                    return newCached?.content || null;
                }
            }
            catch (error) {
                // 파일이 삭제됨 - 캐시 무효화
                this.invalidate(cacheKey);
                return null;
            }
            return cached.content;
        }
        return null;
    }
    /**
     * 프로젝트 구조 캐싱
     */
    cacheProjectStructure(projectRoot, structure, configFiles, ttl) {
        const cacheData = {
            projectRoot,
            structure,
            configFiles,
            lastScanned: Date.now()
        };
        const cacheKey = this.generateProjectStructureKey(projectRoot);
        this.set(cacheKey, cacheData, ttl || this.options.defaultTTL * 2); // 프로젝트 구조는 더 오래 유지
        console.log(`[ProjectContextCache] Cached project structure: ${projectRoot}`);
    }
    /**
     * 캐시된 프로젝트 구조 가져오기
     */
    getProjectStructure(projectRoot) {
        const cacheKey = this.generateProjectStructureKey(projectRoot);
        return this.get(cacheKey);
    }
    /**
     * 프로젝트의 우선순위 파일 미리 캐싱
     */
    async preloadPriorityFiles(projectRoot) {
        console.log(`[ProjectContextCache] Preloading priority files for ${projectRoot}`);
        const preloadPromises = [];
        for (const fileName of this.PRIORITY_FILES) {
            const filePath = path.join(projectRoot, fileName);
            preloadPromises.push((async () => {
                try {
                    // 파일 존재 여부 먼저 확인
                    await fs.access(filePath);
                    await this.cacheFile(filePath);
                }
                catch {
                    // 파일이 없으면 조용히 무시
                }
            })());
        }
        await Promise.all(preloadPromises);
        console.log(`[ProjectContextCache] Preloading completed`);
    }
    /**
     * 범용 캐시 설정
     */
    set(key, value, ttl) {
        const size = this.estimateSize(value);
        const currentSize = this.getTotalSize();
        // 캐시 크기 초과 시 LRU 정책으로 제거
        if (currentSize + size > this.options.maxCacheSize) {
            this.evictLRU(size);
        }
        // 엔트리 수 초과 시 LRU 정책으로 제거
        if (this.cache.size >= this.options.maxEntries) {
            this.evictLRU(0);
        }
        const entry = {
            key,
            value,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 0,
            ttl: ttl || this.options.defaultTTL,
            size
        };
        this.cache.set(key, entry);
        // 디스크에 영구 저장
        if (this.options.persistToDisk) {
            this.saveCacheToDisk();
        }
    }
    /**
     * 범용 캐시 가져오기
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        // TTL 체크
        if (Date.now() - entry.createdAt > entry.ttl) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        // 액세스 정보 업데이트
        entry.lastAccessedAt = Date.now();
        entry.accessCount++;
        this.stats.hits++;
        return entry.value;
    }
    /**
     * 캐시 무효화
     */
    invalidate(key) {
        this.cache.delete(key);
        // 파일 감시 중지
        const watcher = this.fileWatchers.get(key);
        if (watcher) {
            watcher.dispose();
            this.fileWatchers.delete(key);
        }
        console.log(`[ProjectContextCache] Invalidated cache: ${key}`);
    }
    /**
     * 패턴으로 캐시 무효화
     */
    invalidateByPattern(pattern) {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.invalidate(key);
                count++;
            }
        }
        console.log(`[ProjectContextCache] Invalidated ${count} cache entries by pattern`);
        return count;
    }
    /**
     * 프로젝트별 캐시 무효화
     */
    invalidateProject(projectRoot) {
        const pattern = new RegExp(`^project:${projectRoot.replace(/\\/g, '\\\\')}`);
        this.invalidateByPattern(pattern);
    }
    /**
     * 전체 캐시 초기화
     */
    clearAll() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0 };
        // 모든 파일 감시 중지
        for (const watcher of this.fileWatchers.values()) {
            watcher.dispose();
        }
        this.fileWatchers.clear();
        console.log('[ProjectContextCache] Cleared all cache');
    }
    /**
     * 캐시 통계 가져오기
     */
    getStats() {
        const entries = Array.from(this.cache.values());
        const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
        const totalAccess = this.stats.hits + this.stats.misses;
        return {
            totalEntries: this.cache.size,
            totalSize,
            hitCount: this.stats.hits,
            missCount: this.stats.misses,
            hitRate: totalAccess > 0 ? this.stats.hits / totalAccess : 0,
            oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.createdAt)) : undefined,
            newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.createdAt)) : undefined
        };
    }
    /**
     * LRU 정책으로 캐시 제거
     */
    evictLRU(requiredSpace) {
        const entries = Array.from(this.cache.entries());
        // 마지막 액세스 시간 기준 정렬
        entries.sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
        let freedSpace = 0;
        for (const [key, entry] of entries) {
            this.cache.delete(key);
            freedSpace += entry.size;
            if (freedSpace >= requiredSpace || this.cache.size < this.options.maxEntries) {
                break;
            }
        }
        console.log(`[ProjectContextCache] Evicted LRU entries, freed ${freedSpace} bytes`);
    }
    /**
     * 만료된 캐시 정리
     */
    cleanupExpired() {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.createdAt > entry.ttl) {
                this.cache.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[ProjectContextCache] Cleaned up ${removed} expired entries`);
        }
    }
    /**
     * 자동 정리 타이머 시작
     */
    startCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpired();
        }, this.options.cleanupInterval);
        console.log(`[ProjectContextCache] Cleanup timer started (interval: ${this.options.cleanupInterval}ms)`);
    }
    /**
     * 자동 정리 타이머 중지
     */
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
            console.log('[ProjectContextCache] Cleanup timer stopped');
        }
    }
    /**
     * 파일 변경 감지
     */
    watchFile(filePath) {
        const cacheKey = this.generateFileKey(filePath);
        // 이미 감시 중이면 스킵
        if (this.fileWatchers.has(cacheKey)) {
            return;
        }
        const watcher = vscode.workspace.createFileSystemWatcher(filePath);
        watcher.onDidChange(() => {
            console.log(`[ProjectContextCache] File changed, invalidating cache: ${filePath}`);
            this.invalidate(cacheKey);
        });
        watcher.onDidDelete(() => {
            console.log(`[ProjectContextCache] File deleted, invalidating cache: ${filePath}`);
            this.invalidate(cacheKey);
        });
        this.fileWatchers.set(cacheKey, watcher);
    }
    /**
     * 캐시 키 생성 (파일)
     */
    generateFileKey(filePath) {
        return `file:${filePath}`;
    }
    /**
     * 캐시 키 생성 (프로젝트 구조)
     */
    generateProjectStructureKey(projectRoot) {
        return `project:${projectRoot}:structure`;
    }
    /**
     * 데이터 크기 추정
     */
    estimateSize(value) {
        const json = JSON.stringify(value);
        return Buffer.byteLength(json, 'utf-8');
    }
    /**
     * 전체 캐시 크기 계산
     */
    getTotalSize() {
        let total = 0;
        for (const entry of this.cache.values()) {
            total += entry.size;
        }
        return total;
    }
    /**
     * 디스크에 캐시 저장
     */
    async saveCacheToDisk() {
        try {
            // 캐시 데이터를 직렬화 가능한 형태로 변환
            const cacheData = Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                value: entry.value,
                createdAt: entry.createdAt,
                ttl: entry.ttl
            }));
            await this.context.globalState.update('codepilot.projectContextCache', {
                cache: cacheData,
                stats: this.stats
            });
        }
        catch (error) {
            console.error('[ProjectContextCache] Failed to save cache to disk:', error);
        }
    }
    /**
     * 디스크에서 캐시 로드
     */
    async loadCacheFromDisk() {
        try {
            const stored = this.context.globalState.get('codepilot.projectContextCache');
            if (stored) {
                const now = Date.now();
                for (const item of stored.cache) {
                    // 만료되지 않은 항목만 로드
                    if (now - item.createdAt < item.ttl) {
                        const entry = {
                            key: item.key,
                            value: item.value,
                            createdAt: item.createdAt,
                            lastAccessedAt: now,
                            accessCount: 0,
                            ttl: item.ttl,
                            size: this.estimateSize(item.value)
                        };
                        this.cache.set(item.key, entry);
                    }
                }
                if (stored.stats) {
                    this.stats = stored.stats;
                }
                console.log(`[ProjectContextCache] Loaded ${this.cache.size} cache entries from disk`);
            }
        }
        catch (error) {
            console.error('[ProjectContextCache] Failed to load cache from disk:', error);
        }
    }
    /**
     * 옵션 로드
     */
    async loadOptions() {
        const stored = this.context.globalState.get('codepilot.projectContextCacheOptions');
        if (stored) {
            this.options = { ...this.options, ...stored };
        }
    }
    /**
     * 옵션 저장
     */
    async saveOptions(options) {
        this.options = { ...this.options, ...options };
        await this.context.globalState.update('codepilot.projectContextCacheOptions', this.options);
        // 정리 타이머 재시작
        this.startCleanupTimer();
        console.log('[ProjectContextCache] Options saved');
    }
    /**
     * 옵션 가져오기
     */
    getOptions() {
        return { ...this.options };
    }
    /**
     * 정리 (dispose)
     */
    dispose() {
        this.stopCleanupTimer();
        // 모든 파일 감시 중지
        for (const watcher of this.fileWatchers.values()) {
            watcher.dispose();
        }
        this.fileWatchers.clear();
        // 캐시 저장
        if (this.options.persistToDisk) {
            this.saveCacheToDisk();
        }
        console.log('[ProjectContextCache] Disposed');
    }
}
//# sourceMappingURL=ProjectContextCache.js.map