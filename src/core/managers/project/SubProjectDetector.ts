/**
 * SubProjectDetector
 * 워크스페이스 루트에서 서브프로젝트(모노레포, 멀티 디렉토리)를 자동 감지합니다.
 * 감지된 구조를 시스템 프롬프트에 주입하여 LLM의 경로 판단을 돕습니다.
 *
 * 범용적: 특정 프로젝트 이름이나 경로를 하드코딩하지 않습니다.
 */

import * as fs from 'fs';
import * as path from 'path';

/** 서브프로젝트 정보 */
export interface SubProject {
    /** 워크스페이스 루트 기준 상대 경로 */
    relativePath: string;
    /** 감지된 manifest 파일 목록 (e.g. package.json, tsconfig.json) */
    manifests: string[];
    /** 프로젝트 이름 (manifest에서 추출, 없으면 디렉토리명) */
    name: string;
    /** entry point 파일 (존재하는 경우) */
    entryPoints: string[];
}

/** 감지할 manifest 파일 목록 */
const MANIFEST_FILES = [
    'package.json',
    'tsconfig.json',
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'go.mod',
    'Cargo.toml',
    'Gemfile',
    'composer.json',
    'pubspec.yaml',
    'build.gradle',
    'build.gradle.kts',
    'pom.xml',
    'Package.swift',
    'mix.exs',
    'deno.json',
    'deno.jsonc',
];

/** 일반적인 entry point 패턴 */
const ENTRY_POINT_PATTERNS = [
    'src/index.ts', 'src/index.tsx', 'src/index.js', 'src/index.jsx',
    'src/main.ts', 'src/main.tsx', 'src/main.js', 'src/main.jsx',
    'src/App.ts', 'src/App.tsx', 'src/App.js', 'src/App.jsx',
    'src/app.ts', 'src/app.tsx', 'src/app.js', 'src/app.jsx',
    'app.py', 'main.py', 'manage.py',
    'main.go', 'cmd/main.go',
    'src/main.rs', 'src/lib.rs',
    'index.ts', 'index.js', 'server.ts', 'server.js',
];

/** 무시할 디렉토리 */
const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
    '.next', '.nuxt', '.output', '__pycache__', '.venv', 'venv',
    'vendor', 'target', '.gradle', '.idea', '.vscode',
    'coverage', '.cache', '.turbo', '.nx',
]);

export class SubProjectDetector {
    private static _cache: Map<string, { result: SubProject[]; timestamp: number }> = new Map();
    private static readonly CACHE_TTL_MS = 60_000; // 1분 캐시

    /**
     * 워크스페이스 루트에서 서브프로젝트를 감지합니다.
     * 최대 2단계 깊이까지 스캔합니다.
     */
    public static detect(workspaceRoot: string): SubProject[] {
        // 캐시 확인
        const cached = SubProjectDetector._cache.get(workspaceRoot);
        if (cached && Date.now() - cached.timestamp < SubProjectDetector.CACHE_TTL_MS) {
            return cached.result;
        }

        const subProjects: SubProject[] = [];

        try {
            // 루트의 manifest 확인 (루트 자체가 단일 프로젝트인 경우)
            const rootManifests = SubProjectDetector.findManifests(workspaceRoot);

            // 1단계 서브디렉토리 스캔
            const entries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) {
                    continue;
                }

                const subDir = path.join(workspaceRoot, entry.name);
                const manifests = SubProjectDetector.findManifests(subDir);

                if (manifests.length > 0) {
                    subProjects.push(SubProjectDetector.buildSubProject(workspaceRoot, subDir, manifests));
                }

                // 2단계 스캔 (packages/*, apps/*, services/*, libs/*, projects/* 등 모노레포 패턴)
                try {
                    const subEntries = fs.readdirSync(subDir, { withFileTypes: true });
                    for (const subEntry of subEntries) {
                        if (!subEntry.isDirectory() || IGNORE_DIRS.has(subEntry.name) || subEntry.name.startsWith('.')) {
                            continue;
                        }
                        const deepDir = path.join(subDir, subEntry.name);
                        const deepManifests = SubProjectDetector.findManifests(deepDir);
                        if (deepManifests.length > 0) {
                            subProjects.push(SubProjectDetector.buildSubProject(workspaceRoot, deepDir, deepManifests));
                        }
                    }
                } catch {
                    // 하위 디렉토리 읽기 실패 시 무시
                }
            }

            // 루트에만 manifest가 있고 서브프로젝트가 없으면 → 단일 프로젝트, 구조 주입 불필요
            // 서브프로젝트가 있을 때만 반환
            if (subProjects.length === 0) {
                SubProjectDetector._cache.set(workspaceRoot, { result: [], timestamp: Date.now() });
                return [];
            }

            // 루트도 manifest가 있으면 루트 프로젝트 정보 포함
            if (rootManifests.length > 0) {
                subProjects.unshift(SubProjectDetector.buildSubProject(workspaceRoot, workspaceRoot, rootManifests));
            }
        } catch (error) {
            console.warn('[SubProjectDetector] Failed to scan workspace:', error);
        }

        SubProjectDetector._cache.set(workspaceRoot, { result: subProjects, timestamp: Date.now() });
        return subProjects;
    }

    /**
     * 감지된 서브프로젝트를 시스템 프롬프트용 텍스트로 포맷합니다.
     */
    public static formatForPrompt(workspaceRoot: string): string {
        const subProjects = SubProjectDetector.detect(workspaceRoot);
        if (subProjects.length === 0) {
            return '';
        }

        const lines = subProjects.map(sp => {
            const manifestsStr = sp.manifests.join(', ');
            const entryStr = sp.entryPoints.length > 0 ? `  entry: ${sp.entryPoints.join(', ')}` : '';
            const pathStr = sp.relativePath === '.' ? '/ (root)' : sp.relativePath + '/';
            return `- ${pathStr}  [${manifestsStr}]  name: "${sp.name}"${entryStr}`;
        });

        return `## 프로젝트 구조 (서브프로젝트)
이 워크스페이스에는 여러 서브프로젝트가 있습니다.
**파일 경로를 지정할 때 반드시 올바른 서브프로젝트 경로를 사용하세요.**
예: 루트에 src/가 없고 client/src/에 코드가 있다면, "client/src/App.tsx"처럼 서브프로젝트 경로를 포함해야 합니다.

${lines.join('\n')}
`;
    }

    /**
     * 주어진 상대 경로가 서브프로젝트 경로로 보정될 수 있는지 확인합니다.
     * 파일이 존재하지 않을 때 서브프로젝트 루트 기준으로 재탐색합니다.
     * @returns 보정된 절대 경로, 또는 null
     */
    public static resolveWithFallback(workspaceRoot: string, relativePath: string): string | null {
        const subProjects = SubProjectDetector.detect(workspaceRoot);
        if (subProjects.length === 0) return null;

        for (const sp of subProjects) {
            if (sp.relativePath === '.') continue; // 루트는 이미 시도됨
            const candidate = path.join(workspaceRoot, sp.relativePath, relativePath);
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    /** 디렉토리에서 manifest 파일 찾기 */
    private static findManifests(dir: string): string[] {
        const found: string[] = [];
        for (const manifest of MANIFEST_FILES) {
            if (fs.existsSync(path.join(dir, manifest))) {
                found.push(manifest);
            }
        }
        return found;
    }

    /** SubProject 객체 생성 */
    private static buildSubProject(workspaceRoot: string, dir: string, manifests: string[]): SubProject {
        const relativePath = dir === workspaceRoot ? '.' : path.relative(workspaceRoot, dir);

        // 프로젝트 이름 추출
        let name = path.basename(dir);
        if (manifests.includes('package.json')) {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
                if (pkg.name) name = pkg.name;
            } catch { /* ignore */ }
        }

        // entry point 탐색
        const entryPoints: string[] = [];
        for (const ep of ENTRY_POINT_PATTERNS) {
            if (fs.existsSync(path.join(dir, ep))) {
                entryPoints.push(ep);
                if (entryPoints.length >= 3) break; // 최대 3개
            }
        }

        return { relativePath, manifests, name, entryPoints };
    }

    /** 캐시 클리어 */
    public static clearCache(): void {
        SubProjectDetector._cache.clear();
    }
}
