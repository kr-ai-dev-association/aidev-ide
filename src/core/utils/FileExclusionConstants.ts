/**
 * 파일 참조에서 제외해야 하는 라이브러리 및 빌드 경로 상수
 * 프로젝트 인덱싱, 파일 검색, 스택 트레이스 분석 등에서 사용
 */
export const EXCLUDED_LIBRARY_PATHS = [
    // --- Package Managers & Dependencies ---
    'node_modules', '.npm', 'npm-cache', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '.pnpm-store', '.yarn',
    'vendor', 'pkg', 'Cargo.lock', 'composer', '.bundle', 'bundle', 'site-packages', '.pip', 'venv', 'env', '.venv',
    'bin', 'obj', 'packages', '.nuget',

    // --- Build & Cache (General) ---
    'dist', 'out', '.build', 'target', 'build', '.gradle', 'gradle', '.m2',
    '__pycache__', '.pytest_cache', 'coverage', '.coverage',
    '.cache', 'cache', 'tmp', 'temp', '.tmp', '.temp',

    // --- Web Frameworks (Vite, Next, etc.) ---
    '.vite', '.next', '.nuxt', '.svelte-kit', '.turbo', '.vercel', '.netlify', '.astro',

    // --- IDE & Tools ---
    '.vscode', '.idea', '.eclipse', '.settings', '.project', '.classpath',
    '.terraform', '.serverless', '.expo',

    // --- Version Control ---
    '.git', '.svn', '.hg', '.bzr',

    // --- System & OS Logs ---
    'logs', '.logs', '.DS_Store', 'Thumbs.db', '.Spotlight-V100', '.Trashes', '.fseventsd', '.TemporaryItems',
    'desktop.ini', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*'
];
