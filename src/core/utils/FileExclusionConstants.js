/**
 * 파일 참조에서 제외해야 하는 라이브러리 및 빌드 경로 상수
 * 프로젝트 인덱싱, 파일 검색, 스택 트레이스 분석 등에서 사용
 */
export const EXCLUDED_LIBRARY_PATHS = [
    // --- Package Managers & Dependencies ---
    'node_modules', '.npm', 'npm-cache', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '.pnpm-store', '.yarn',
    'vendor', 'pkg', 'Cargo.lock', 'composer', '.bundle', 'bundle', 'site-packages', '.pip', 'venv', 'env', '.venv',
    'bin', 'obj', 'packages', '.nuget', 'bower_components', '.pnp', '.pnp.js', '.yarn-integrity',
    // --- Build & Cache (General) ---
    'dist', 'out', '.build', 'target', 'build', '.gradle', 'gradle', '.m2',
    '__pycache__', '.pytest_cache', 'coverage', '.coverage', '.tox', '.nox', '.mypy_cache', '.ruff_cache',
    '.cache', 'cache', 'tmp', 'temp', '.tmp', '.temp', '.output',
    // --- Web Frameworks (Vite, Next, etc.) ---
    '.vite', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', '.netlify', '.astro',
    '.parcel-cache', '.sass-cache', '.angular', '.webpack',
    // --- IDE & Tools ---
    '.vscode', '.idea', '.eclipse', '.settings', '.project', '.classpath', '.vs',
    '.terraform', '.serverless', '.expo', '.docusaurus',
    // --- Version Control ---
    '.git', '.svn', '.hg', '.bzr',
    // --- System & OS Logs ---
    'logs', '.logs', '.DS_Store', 'Thumbs.db', '.Spotlight-V100', '.Trashes', '.fseventsd', '.TemporaryItems',
    'desktop.ini', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
    // --- Test & Coverage ---
    '.nyc_output', 'htmlcov', '.tox', 'junit.xml', 'test-results'
];
/**
 * 기본 제외 목록 + 유저 커스텀 제외 패턴을 병합하여 반환
 * - 비활성화된 기본 패턴은 제외
 * - 유저 커스텀 패턴을 추가
 */
export function getAllExclusionPaths() {
    try {
        // 기본 패턴에서 비활성화된 것 제거
        const base = EXCLUDED_LIBRARY_PATHS.filter(p => !_cachedDisabledPatterns.includes(p));
        // 커스텀 패턴 병합
        const merged = [...base];
        for (const p of _cachedCustomPatterns) {
            if (p && !merged.includes(p)) {
                merged.push(p);
            }
        }
        return merged;
    }
    catch {
        // vscode API 사용 불가능한 환경에서는 기본값만 반환
    }
    return [...EXCLUDED_LIBRARY_PATHS];
}
/** 커스텀 패턴 캐시 (globalState에서 로드된 값) */
let _cachedCustomPatterns = [];
/** 비활성화된 기본 패턴 캐시 */
let _cachedDisabledPatterns = [];
/**
 * ExtensionContext에서 커스텀 제외 패턴 + 비활성화 패턴을 로드하여 캐시에 저장
 * extension 활성화 시 한 번 호출
 */
export function loadCustomExclusionPatterns(context) {
    _cachedCustomPatterns = context.globalState.get('contextExclusionPatterns', []) || [];
    _cachedDisabledPatterns = context.globalState.get('contextExclusionDisabled', []) || [];
}
/**
 * 캐시된 커스텀 제외 패턴을 갱신 (설정 변경 시 호출)
 */
export function updateCustomExclusionCache(patterns) {
    _cachedCustomPatterns = patterns || [];
}
/**
 * 캐시된 비활성화 패턴을 갱신 (설정 변경 시 호출)
 */
export function updateDisabledExclusionCache(patterns) {
    _cachedDisabledPatterns = patterns || [];
}
//# sourceMappingURL=FileExclusionConstants.js.map