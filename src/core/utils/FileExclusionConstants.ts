import * as vscode from 'vscode';

/**
 * 파일 참조에서 제외해야 하는 라이브러리 및 빌드 경로 상수
 * 프로젝트 인덱싱, 파일 검색, 스택 트레이스 분석 등에서 사용
 */
/**
 * 기본 제외 경로
 */
export const EXCLUDED_LIBRARY_PATHS: string[] = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    '.next',
    '.nuxt',
    '.output',
    '.cache',
    '.turbo',
    'coverage',
    '__pycache__',
    '.pytest_cache',
    'venv',
    '.venv',
    'env',
    '.idea',
    '.vscode',
    '*.min.js',
    '*.min.css',
    '*.map',
    '*.lock',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'vendor',
    'target',
    '.gradle',
    'Pods',
];

/**
 * 기본 제외 목록 + 유저 커스텀 제외 패턴을 병합하여 반환
 * - 비활성화된 기본 패턴은 제외
 * - 유저 커스텀 패턴을 추가
 */
export function getAllExclusionPaths(): string[] {
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

        // 서버 제외 패턴 병합
        for (const p of _cachedServerPatterns) {
            if (p && !merged.includes(p)) {
                merged.push(p);
            }
        }

        // 서버 필수(required) 패턴은 비활성화 목록에 있더라도 반드시 포함
        for (const p of _cachedServerRequiredPatterns) {
            if (p && !merged.includes(p)) {
                merged.push(p);
            }
        }

        return merged;
    } catch {
        // vscode API 사용 불가능한 환경에서는 빈 배열 반환
    }
    return [];
}

/** 커스텀 패턴 캐시 (globalState에서 로드된 값) */
let _cachedCustomPatterns: string[] = [];
/** 비활성화된 기본 패턴 캐시 */
let _cachedDisabledPatterns: string[] = [];
/** 서버에서 제공된 제외 패턴 캐시 (recommended + required) */
let _cachedServerPatterns: string[] = [];
/** 서버에서 제공된 필수 제외 패턴 캐시 (절대 제거 불가) */
let _cachedServerRequiredPatterns: string[] = [];

/**
 * ExtensionContext에서 커스텀 제외 패턴 + 비활성화 패턴을 로드하여 캐시에 저장
 * extension 활성화 시 한 번 호출
 */
export function loadCustomExclusionPatterns(context: vscode.ExtensionContext): void {
    _cachedCustomPatterns = context.globalState.get<string[]>('contextExclusionPatterns', []) || [];
    _cachedDisabledPatterns = context.globalState.get<string[]>('contextExclusionDisabled', []) || [];

    // 서버 제외 패턴도 로드 (비동기, 실패 시 무시)
    loadServerExcludePatterns();
}

/**
 * 서버에서 제공된 제외 패턴을 로드하여 캐시에 저장
 * SettingsManager를 동적 import하여 순환 의존성 방지
 */
export async function loadServerExcludePatterns(): Promise<void> {
    try {
        const { SettingsManager } = await import('../managers/state/SettingsManager');
        const serverPatterns = SettingsManager.getInstance().getServerExcludePatterns();

        const allPatterns: string[] = [];
        const requiredPatterns: string[] = [];

        for (const entry of serverPatterns) {
            const pattern = entry.pattern;
            if (!pattern) continue;

            allPatterns.push(pattern);

            if (entry.enforcement === 'required') {
                requiredPatterns.push(pattern);
            }
        }

        _cachedServerPatterns = allPatterns;
        _cachedServerRequiredPatterns = requiredPatterns;
    } catch {
        // SettingsManager 미초기화 또는 서버 설정 로드 실패 시 무시
    }
}

/**
 * 캐시된 커스텀 제외 패턴을 갱신 (설정 변경 시 호출)
 */
export function updateCustomExclusionCache(patterns: string[]): void {
    _cachedCustomPatterns = patterns || [];
}

/**
 * 캐시된 비활성화 패턴을 갱신 (설정 변경 시 호출)
 */
export function updateDisabledExclusionCache(patterns: string[]): void {
    _cachedDisabledPatterns = patterns || [];
}
