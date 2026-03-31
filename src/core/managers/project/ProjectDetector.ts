/**
 * Project Detector
 * 프로젝트 타입을 감지하는 클래스
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import {
    ProjectType,
    BuildTool
} from './types';
import { AgentConfig } from '../../config/AgentConfig';
import { EnvironmentHealth } from '../conversation/handlers/ErrorClassifier';
import { fileExistsAsync, readFileAsync, readdirAsync, readJsonFileAsync } from '../../utils';

export class ProjectDetector {
    /**
     * Python 런타임 감지 캐시 (세션 당 한 번만 감지)
     */
    private static pythonRuntimeCache: string | null = null;

    /**
     * Python 런타임을 감지합니다.
     * 감지 순서: python3 → python → uv run python → .venv → 기본값(python3)
     */
    public static async detectPythonRuntime(workspaceRoot: string): Promise<string> {
        if (ProjectDetector.pythonRuntimeCache !== null) {
            return ProjectDetector.pythonRuntimeCache;
        }

        // 1순위: 시스템 python3 / python
        for (const cmd of ['python3', 'python']) {
            try {
                execSync(`${cmd} --version`, { timeout: 3000, stdio: 'pipe' });
                ProjectDetector.pythonRuntimeCache = cmd;
                console.log(`[ProjectDetector] Python runtime detected: ${cmd}`);
                return cmd;
            } catch {}
        }

        // 2순위: uv (빠른 패키지 매니저)
        try {
            execSync('uv run python --version', { timeout: 3000, stdio: 'pipe' });
            ProjectDetector.pythonRuntimeCache = 'uv run python';
            console.log('[ProjectDetector] Python runtime detected: uv run python');
            return 'uv run python';
        } catch {}

        // 3순위: 프로젝트 로컬 venv
        const venvPaths = [
            '.venv/bin/python', 'venv/bin/python',                    // macOS/Linux
            '.venv/Scripts/python.exe', 'venv/Scripts/python.exe',    // Windows
        ];
        for (const vp of venvPaths) {
            const fullPath = path.join(workspaceRoot, vp);
            if (fs.existsSync(fullPath)) {
                ProjectDetector.pythonRuntimeCache = fullPath;
                console.log(`[ProjectDetector] Python runtime detected: ${vp}`);
                return fullPath;
            }
        }

        // 기본값
        ProjectDetector.pythonRuntimeCache = 'python3';
        console.log('[ProjectDetector] Python runtime not found, using default: python3');
        return 'python3';
    }

    /**
     * 프로젝트 타입을 감지합니다
     */
    public async detectProjectType(projectRoot: string): Promise<{
        type: ProjectType;
        confidence: number;
        buildTool: BuildTool;
    }> {
        console.log(`[ProjectDetector] Detecting project type: ${projectRoot}`);

        // 파일 기반 감지 (비동기)
        const fileBasedDetection = await this.detectByFilesAsync(projectRoot);
        if (fileBasedDetection) {
            return fileBasedDetection;
        }

        // 기본값
        return {
            type: ProjectType.UNKNOWN,
            confidence: 0,
            buildTool: BuildTool.UNKNOWN
        };
    }

    /**
     * 명시적 빌드/설정 파일 목록 (프로젝트 타입 감지에 사용)
     * 캐시나 부산물 디렉토리(__pycache__, .gradle 등)는 포함하지 않음
     */
    private static readonly EXPLICIT_BUILD_FILES: Array<{
        files: string[];
        type: ProjectType;
        buildTool: BuildTool;
        confidence: number;
        detector?: (projectRoot: string) => boolean;
    }> = [
        // ⚠️ Android 프로젝트 (Gradle 기반) - Spring Boot보다 먼저 체크해야 함
        {
            files: ['build.gradle', 'build.gradle.kts'],
            type: ProjectType.ANDROID,
            buildTool: BuildTool.GRADLE,
            confidence: 0.95,
            detector: (projectRoot: string) => {
                // Android 프로젝트 특징: app/build.gradle 또는 AndroidManifest.xml 존재
                return fs.existsSync(path.join(projectRoot, 'app', 'build.gradle')) ||
                       fs.existsSync(path.join(projectRoot, 'app', 'build.gradle.kts')) ||
                       fs.existsSync(path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml')) ||
                       fs.existsSync(path.join(projectRoot, 'AndroidManifest.xml'));
            }
        },
        // Java/Kotlin - Gradle (Spring Boot 등, Android가 아닌 경우)
        {
            files: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
            type: ProjectType.SPRING_BOOT,
            buildTool: BuildTool.GRADLE,
            confidence: 0.9
        },
        // Java - Maven
        {
            files: ['pom.xml'],
            type: ProjectType.SPRING_BOOT,
            buildTool: BuildTool.MAVEN,
            confidence: 0.9
        },
        // Go
        {
            files: ['go.mod'],
            type: ProjectType.GO,
            buildTool: BuildTool.GO_MOD,
            confidence: 0.9
        },
        // Rust
        {
            files: ['Cargo.toml'],
            type: ProjectType.RUST,
            buildTool: BuildTool.CARGO,
            confidence: 0.9
        },
        // Flutter/Dart
        {
            files: ['pubspec.yaml'],
            type: ProjectType.FLUTTER,
            buildTool: BuildTool.PUB,
            confidence: 0.9
        },
        // PHP
        {
            files: ['composer.json'],
            type: ProjectType.PHP,
            buildTool: BuildTool.COMPOSER,
            confidence: 0.9
        },
        // Ruby
        {
            files: ['Gemfile', 'Rakefile'],
            type: ProjectType.RUBY,
            buildTool: BuildTool.BUNDLER,
            confidence: 0.9
        },
        // C/C++
        {
            files: ['CMakeLists.txt'],
            type: ProjectType.C_CPP,
            buildTool: BuildTool.CMAKE,
            confidence: 0.9
        },
        // Python (명시적 의존성 파일이 있는 경우만)
        {
            files: ['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py'],
            type: ProjectType.PYTHON,
            buildTool: BuildTool.PIP,
            confidence: 0.8
        },
        // Swift (macOS only)
        {
            files: ['Package.swift'],
            type: ProjectType.SWIFT,
            buildTool: BuildTool.UNKNOWN,
            confidence: 0.9,
            detector: () => process.platform === 'darwin'
        }
    ];

    /**
     * 파일을 기반으로 프로젝트 타입을 감지합니다 (비동기)
     * 범용적인 감지 로직: 명시적 빌드 파일을 순회하며 첫 번째로 발견된 타입 반환
     */
    private async detectByFilesAsync(projectRoot: string): Promise<{
        type: ProjectType;
        confidence: number;
        buildTool: BuildTool;
    } | null> {
        try {
            // ============================================================
            // Step 1: 명시적 빌드/설정 파일 기반 감지 (범용적)
            // ============================================================
            for (const rule of ProjectDetector.EXPLICIT_BUILD_FILES) {
                // 플랫폼 조건 체크 (예: Swift는 macOS만)
                if (rule.detector && !rule.detector(projectRoot)) {
                    continue;
                }

                // 파일 존재 여부 확인 (비동기)
                let foundFile: string | null = null;
                for (const file of rule.files) {
                    if (await fileExistsAsync(path.join(projectRoot, file))) {
                        foundFile = file;
                        break;
                    }
                }

                if (foundFile) {
                    console.log(`[ProjectDetector] Detected ${rule.type} by file: ${foundFile}`);
                    return {
                        type: rule.type,
                        confidence: rule.confidence,
                        buildTool: rule.buildTool
                    };
                }
            }

            // ============================================================
            // Step 2: package.json 기반 세부 감지 (React, Vue, Angular 등)
            // ============================================================
            const packageJsonPath = path.join(projectRoot, 'package.json');
            if (await fileExistsAsync(packageJsonPath)) {
                const packageJson = await readJsonFileAsync<{
                    dependencies?: Record<string, string>;
                    devDependencies?: Record<string, string>;
                }>(packageJsonPath);

                if (packageJson) {
                    // React Native (React보다 먼저 체크 — react-native도 react 의존성을 가짐)
                    if (packageJson.dependencies?.['react-native'] || packageJson.devDependencies?.['react-native']) {
                        return {
                            type: ProjectType.REACT_NATIVE,
                            confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                            buildTool: await this.detectBuildToolAsync(projectRoot)
                        };
                    }

                    // React
                    if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
                        return {
                            type: ProjectType.REACT,
                            confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                            buildTool: await this.detectBuildToolAsync(projectRoot)
                        };
                    }

                    // Vue
                    if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
                        return {
                            type: ProjectType.VUE,
                            confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                            buildTool: await this.detectBuildToolAsync(projectRoot)
                        };
                    }

                    // Angular
                    if (packageJson.dependencies?.['@angular/core'] || packageJson.devDependencies?.['@angular/core']) {
                        return {
                            type: ProjectType.ANGULAR,
                            confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                            buildTool: await this.detectBuildToolAsync(projectRoot)
                        };
                    }

                    // TypeScript
                    if (await fileExistsAsync(path.join(projectRoot, 'tsconfig.json'))) {
                        return {
                            type: ProjectType.TYPESCRIPT,
                            confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                            buildTool: await this.detectBuildToolAsync(projectRoot)
                        };
                    }

                    // JavaScript/Node.js
                    return {
                        type: ProjectType.NODE,
                        confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.LOCAL_HEURISTIC,
                        buildTool: await this.detectBuildToolAsync(projectRoot)
                    };
                }
            }

            // ============================================================
            // Step 3: Python 프레임워크 세부 감지 (Django, Flask, FastAPI)
            // Note: 기본 Python은 Step 1의 EXPLICIT_BUILD_FILES에서 처리됨
            // ============================================================
            const [hasRequirements, hasPyproject, hasPipfile] = await Promise.all([
                fileExistsAsync(path.join(projectRoot, 'requirements.txt')),
                fileExistsAsync(path.join(projectRoot, 'pyproject.toml')),
                fileExistsAsync(path.join(projectRoot, 'Pipfile'))
            ]);

            if (hasRequirements || hasPyproject || hasPipfile) {
                // Django
                if (await fileExistsAsync(path.join(projectRoot, 'manage.py'))) {
                    return {
                        type: ProjectType.DJANGO,
                        confidence: AgentConfig.PYTHON_PROJECT_CONFIDENCE.DJANGO,
                        buildTool: BuildTool.PIP
                    };
                }

                // Flask
                const [hasAppPy, hasFlaskApp] = await Promise.all([
                    fileExistsAsync(path.join(projectRoot, 'app.py')),
                    fileExistsAsync(path.join(projectRoot, 'flask_app.py'))
                ]);
                if (hasAppPy || hasFlaskApp) {
                    return {
                        type: ProjectType.FLASK,
                        confidence: AgentConfig.PYTHON_PROJECT_CONFIDENCE.FLASK_FASTAPI,
                        buildTool: BuildTool.PIP
                    };
                }

                // FastAPI
                const mainPyPath = path.join(projectRoot, 'main.py');
                if (await fileExistsAsync(mainPyPath)) {
                    try {
                        const mainPy = await readFileAsync(mainPyPath);
                        if (mainPy.includes('FastAPI') || mainPy.includes('from fastapi')) {
                            return {
                                type: ProjectType.FASTAPI,
                                confidence: AgentConfig.PYTHON_PROJECT_CONFIDENCE.FLASK_FASTAPI,
                                buildTool: BuildTool.PIP
                            };
                        }
                    } catch {
                        // 파일 읽기 실패 시 무시
                    }
                }
            }

            // ============================================================
            // Step 4: 기타 프로젝트 타입
            // Note: 대부분은 Step 1의 EXPLICIT_BUILD_FILES에서 처리됨
            // 여기서는 디렉토리 스캔이 필요한 특수 케이스만 처리
            // ============================================================

            // *.csproj, *.sln, *.fsproj (C# / .NET) - 파일명이 가변적
            try {
                const files = await readdirAsync(projectRoot);
                const csprojFiles = files.filter(f =>
                    f.endsWith('.csproj') || f.endsWith('.sln') || f.endsWith('.fsproj')
                );
                if (csprojFiles.length > 0) {
                    return {
                        type: ProjectType.CSHARP,
                        confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                        buildTool: BuildTool.DOTNET
                    };
                }

                // *.xcodeproj (iOS/macOS) - 파일명이 가변적, macOS만
                if (process.platform === 'darwin') {
                    const xcodeprojFiles = files.filter(f => f.endsWith('.xcodeproj'));
                    if (xcodeprojFiles.length > 0) {
                        return {
                            type: ProjectType.SWIFT,
                            confidence: AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                            buildTool: BuildTool.XCODE
                        };
                    }
                }
            } catch {
                // 디렉토리 읽기 실패 시 무시
            }

            return null;

        } catch (error) {
            console.error('[ProjectDetector] Error detecting project type:', error);
            return null;
        }
    }

    /**
     * 빌드 도구를 감지합니다 (동기 - 레거시 호환용)
     */
    private detectBuildTool(projectRoot: string): BuildTool {
        if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
            return BuildTool.NPM;
        }
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
            return BuildTool.YARN;
        }
        if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
            return BuildTool.PNPM;
        }
        if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
            return BuildTool.BUN;
        }

        // package.json이 있으면 기본값으로 npm
        if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
            return BuildTool.NPM;
        }

        return BuildTool.UNKNOWN;
    }

    /**
     * 빌드 도구를 감지합니다 (비동기)
     */
    private async detectBuildToolAsync(projectRoot: string): Promise<BuildTool> {
        // 병렬로 락 파일 존재 여부 확인
        const [hasPackageLock, hasYarnLock, hasPnpmLock, hasBunLock, hasPackageJson] = await Promise.all([
            fileExistsAsync(path.join(projectRoot, 'package-lock.json')),
            fileExistsAsync(path.join(projectRoot, 'yarn.lock')),
            fileExistsAsync(path.join(projectRoot, 'pnpm-lock.yaml')),
            fileExistsAsync(path.join(projectRoot, 'bun.lockb')),
            fileExistsAsync(path.join(projectRoot, 'package.json'))
        ]);

        if (hasPackageLock) return BuildTool.NPM;
        if (hasYarnLock) return BuildTool.YARN;
        if (hasPnpmLock) return BuildTool.PNPM;
        if (hasBunLock) return BuildTool.BUN;
        if (hasPackageJson) return BuildTool.NPM;

        return BuildTool.UNKNOWN;
    }

    /**
     * 프로젝트 타입에 맞는 검증 명령어를 반환합니다
     * @param projectType 프로젝트 타입
     * @param projectRoot 프로젝트 루트 경로
     * @param createdFiles 생성된 파일 목록
     * @param modifiedFiles 수정된 파일 목록
     * @returns 검증 명령어와 설명, 또는 null
     */
    /**
     * 패키지 매니저 감지 (npm, yarn, pnpm, bun)
     */
    private detectPackageManager(projectRoot: string): string {
        if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) return 'bun';
        if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) return 'yarn';
        return 'npm';
    }

    /**
     * package.json에 특정 스크립트가 있는지 확인
     */
    private hasScript(projectRoot: string, scriptName: string): boolean {
        try {
            const pkgPath = path.join(projectRoot, 'package.json');
            if (!fs.existsSync(pkgPath)) return false;
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return !!(pkg.scripts && pkg.scripts[scriptName]);
        } catch {
            return false;
        }
    }

    /**
     * Go 프로젝트에 테스트 파일이 있는지 확인
     */
    private hasGoTestFiles(projectRoot: string): boolean {
        try {
            const files = fs.readdirSync(projectRoot);
            return files.some(f => f.endsWith('_test.go'));
        } catch {
            return false;
        }
    }

    public async getValidationCommand(
        projectType: ProjectType,
        projectRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): Promise<{ command: string; description: string; fromSettings?: boolean } | null> {
        // =========================================================
        // LEVEL 0: 서버 관리 빌드/테스트 설정 확인 (최우선)
        // =========================================================
        const allFiles = [...createdFiles, ...modifiedFiles];

        const serverOverride = await this.getServerBuildTestOverride(allFiles);
        if (serverOverride) {
            return { ...serverOverride, fromSettings: true };
        }

        // =========================================================
        // LEVEL 1: 범용 린터 (가장 강력하고 빠름)
        // =========================================================

        // 1. pre-commit (가장 권장되는 다국어 린터)
        if (fs.existsSync(path.join(projectRoot, '.pre-commit-config.yaml'))) {
            if (allFiles.length > 0) {
                return { command: `pre-commit run --files ${allFiles.join(' ')}`, description: 'Pre-commit 훅 실행' };
            }
            return { command: 'pre-commit run --all-files', description: 'Pre-commit 훅 실행 (전체)' };
        }

        // =========================================================
        // LEVEL 2: 메타 태스크 러너 (개발자가 정의한 룰 우선)
        // =========================================================

        // 1. Make (C/C++ 뿐만 아니라 Go, Python 등에서도 많이 씀)
        if (fs.existsSync(path.join(projectRoot, 'Makefile'))) {
            try {
                const content = fs.readFileSync(path.join(projectRoot, 'Makefile'), 'utf-8');
                if (content.includes('lint:')) return { command: 'make lint', description: 'Make lint' };
                if (content.includes('check:')) return { command: 'make check', description: 'Make check' };
                if (content.includes('test:')) return { command: 'make test', description: 'Make test' };
                if (content.includes('build:')) return { command: 'make build', description: 'Make build' };
            } catch {
                // 파일 읽기 실패 시 무시
            }
        }

        // 2. Just (Modern Task Runner)
        if (fs.existsSync(path.join(projectRoot, 'Justfile'))) {
            return { command: 'just --list --unsorted', description: 'Justfile 확인 (실행 전 확인)' };
        }

        // 3. Task (Taskfile.yml)
        if (fs.existsSync(path.join(projectRoot, 'Taskfile.yml'))) {
            return { command: 'task lint || task build', description: 'Taskfile 실행' };
        }

        // 4. Nx / Turbo (Monorepo)
        if (fs.existsSync(path.join(projectRoot, 'nx.json'))) {
            return { command: 'npx nx affected --target=lint', description: 'Nx Affected Lint' };
        }
        if (fs.existsSync(path.join(projectRoot, 'turbo.json'))) {
            return { command: 'npx turbo run lint --filter=...', description: 'TurboRepo Lint' };
        }

        // 5. GitHub Actions Workflow Validation (프로젝트에 .github/workflows가 있는 경우)
        if (fs.existsSync(path.join(projectRoot, '.github', 'workflows'))) {
            try {
                const workflowFiles = fs.readdirSync(path.join(projectRoot, '.github', 'workflows'))
                    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
                if (workflowFiles.length > 0) {
                    // actionlint가 설치되어 있는지 확인 (설치 여부와 관계없이 명령 제공)
                    return { command: 'actionlint', description: 'GitHub Actions Workflow Lint' };
                }
            } catch {
                // 디렉토리 읽기 실패 시 무시
            }
        }

        // 6. EditorConfig 검증
        if (fs.existsSync(path.join(projectRoot, '.editorconfig'))) {
            return { command: 'editorconfig-checker', description: 'EditorConfig 검증' };
        }

        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                // =========================================================
                // LEVEL 3: 웹/Node.js 생태계 (가장 복잡하고 다양함)
                // =========================================================

                // TypeScript 프로젝트인지 먼저 확인
                const hasTypeScript = createdFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) ||
                    modifiedFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) ||
                    fs.existsSync(path.join(projectRoot, 'tsconfig.json'));

                if (hasTypeScript) {
                    // TypeScript 프로젝트: npx tsc --noEmit 사용 (로컬 설치 tsc 보장, 전역 버전 불일치 방지)
                    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                        const pm = this.detectPackageManager(projectRoot);

                        // Biome (매우 빠른 최신 툴)
                        if (fs.existsSync(path.join(projectRoot, 'biome.json'))) {
                            return { command: `npx tsc --noEmit && npx biome check .`, description: 'TypeScript 타입 검사 + Biome 검사' };
                        }

                        // Deno
                        if (fs.existsSync(path.join(projectRoot, 'deno.json'))) {
                            return { command: 'npx tsc --noEmit && deno lint', description: 'TypeScript 타입 검사 + Deno Lint' };
                        }

                        // package.json scripts: npx tsc --noEmit 후 린트 실행
                        if (this.hasScript(projectRoot, 'lint')) {
                            return { command: `npx tsc --noEmit && ${pm} run lint`, description: 'TypeScript 타입 검사 + Lint' };
                        }
                        if (this.hasScript(projectRoot, 'type-check')) {
                            return { command: `npx tsc --noEmit && ${pm} run type-check`, description: 'TypeScript 타입 검사 + Type Check' };
                        }
                        if (this.hasScript(projectRoot, 'validate')) {
                            return { command: `npx tsc --noEmit && ${pm} run validate`, description: 'TypeScript 타입 검사 + Validate' };
                        }
                        if (this.hasScript(projectRoot, 'build')) {
                            return { command: `npx tsc --noEmit && ${pm} run build`, description: 'TypeScript 타입 검사 + Build' };
                        }
                    }

                    // package.json이 없거나 스크립트가 없는 경우
                    return { command: 'npx tsc --noEmit', description: 'TypeScript 컴파일 검사' };
                }

                // JavaScript만 있는 경우
                if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                    const pm = this.detectPackageManager(projectRoot);

                    // package.json scripts 우선 (프로젝트 작성자가 의도한 옵션 포함)
                    if (this.hasScript(projectRoot, 'lint')) return { command: `${pm} run lint`, description: 'NPM Lint 스크립트' };
                    if (this.hasScript(projectRoot, 'type-check')) return { command: `${pm} run type-check`, description: 'Type Check' };
                    if (this.hasScript(projectRoot, 'validate')) return { command: `${pm} run validate`, description: 'Validate 스크립트' };

                    // Biome (매우 빠른 최신 툴)
                    if (fs.existsSync(path.join(projectRoot, 'biome.json'))) {
                        return { command: `npx biome check .`, description: 'Biome 검사' };
                    }

                    // Deno
                    if (fs.existsSync(path.join(projectRoot, 'deno.json'))) {
                        return { command: 'deno lint', description: 'Deno Lint' };
                    }

                    // ESLint (설정 파일이 있는 경우)
                    if (fs.existsSync(path.join(projectRoot, '.eslintrc')) ||
                        fs.existsSync(path.join(projectRoot, '.eslintrc.js')) ||
                        fs.existsSync(path.join(projectRoot, '.eslintrc.json')) ||
                        fs.existsSync(path.join(projectRoot, '.eslintrc.yml')) ||
                        fs.existsSync(path.join(projectRoot, 'eslint.config.js')) ||
                        fs.existsSync(path.join(projectRoot, 'eslint.config.mjs'))) {
                        return { command: `npx eslint .`, description: 'ESLint 검사' };
                    }

                    // Standard JS (설정이 있는 경우)
                    try {
                        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
                        if (pkg.devDependencies?.standard || pkg.dependencies?.standard) {
                            return { command: `npx standard`, description: 'Standard JS 검사' };
                        }
                    } catch {
                        // package.json 파싱 실패 시 무시
                    }

                    // package.json scripts (빌드/테스트 fallback)
                    if (this.hasScript(projectRoot, 'build')) return { command: `${pm} run build`, description: 'Build 스크립트' };
                    if (this.hasScript(projectRoot, 'test')) return { command: `${pm} run test`, description: 'Test 스크립트' };
                }

                // JavaScript만 있는 경우 npm run build 시도 (package.json에 build 스크립트가 있는 경우)
                const nullDev = process.platform === 'win32' ? '2>nul' : '2>/dev/null';
                return { command: `npm run build --dry-run ${nullDev} || echo "No build script"`, description: 'Node.js 빌드 검사' };

            case ProjectType.ANDROID:
                // Android 프로젝트 검증 (Gradle 기반)
                const isWinAndroid = process.platform === 'win32';
                const gradlewAndroid = isWinAndroid ? 'gradlew.bat' : './gradlew';

                // Gradle wrapper 우선 (Android Studio가 생성)
                if (fs.existsSync(path.join(projectRoot, 'gradlew')) || fs.existsSync(path.join(projectRoot, 'gradlew.bat'))) {
                    return { command: `${gradlewAndroid} assembleDebug`, description: 'Android 디버그 빌드' };
                }

                // Gradle wrapper가 없으면 gradle 직접 사용
                return { command: 'gradle assembleDebug', description: 'Android 디버그 빌드 (Gradle)' };

            case ProjectType.SPRING_BOOT:
                // Java/Kotlin 확장 검증 옵션
                const isWin = process.platform === 'win32';
                const gradlew = isWin ? 'gradlew.bat' : './gradlew';
                const mvnw = isWin ? 'mvnw.cmd' : './mvnw';

                // Gradle wrapper 우선
                if (fs.existsSync(path.join(projectRoot, 'gradlew')) || fs.existsSync(path.join(projectRoot, 'gradlew.bat'))) {
                    return { command: `${gradlew} classes`, description: 'Gradle Compile' };
                }

                // Maven wrapper 우선
                if (fs.existsSync(path.join(projectRoot, 'mvnw')) || fs.existsSync(path.join(projectRoot, 'mvnw.cmd'))) {
                    return { command: `${mvnw} compile`, description: 'Maven Compile' };
                }

                // Maven인지 Gradle인지 확인
                if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                    return { command: 'mvn compile -q', description: 'Maven 컴파일 검사' };
                }

                // Gradle 직접 사용
                return { command: 'gradle compileJava', description: 'Gradle 컴파일 검사' };

            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI: {
                // =========================================================
                // Python 프로젝트: 린터 → 타입 체커 → 문법 검사 순으로 실행
                // =========================================================
                const pythonCmd = await ProjectDetector.detectPythonRuntime(projectRoot);
                const pythonFiles = allFiles.filter(f => f.endsWith('.py'));

                if (pythonFiles.length > 0) {
                    const relativePaths = pythonFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');

                    // 1순위: Ruff (매우 빠른 최신 린터 + 포매터)
                    if (fs.existsSync(path.join(projectRoot, 'ruff.toml')) ||
                        fs.existsSync(path.join(projectRoot, '.ruff.toml')) ||
                        fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                        return {
                            command: `ruff check ${relativePaths} && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Ruff Lint + Python Syntax Check'
                        };
                    }

                    // 2순위: Flake8 (널리 사용되는 린터)
                    if (fs.existsSync(path.join(projectRoot, '.flake8')) ||
                        fs.existsSync(path.join(projectRoot, 'setup.cfg'))) {
                        return {
                            command: `flake8 ${relativePaths} && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Flake8 Lint + Python Syntax Check'
                        };
                    }

                    // 3순위: Pylint (강력한 린터)
                    if (fs.existsSync(path.join(projectRoot, '.pylintrc')) ||
                        fs.existsSync(path.join(projectRoot, 'pylintrc'))) {
                        return {
                            command: `pylint ${relativePaths} && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Pylint + Python Syntax Check'
                        };
                    }

                    // 4순위: Mypy (타입 체커)
                    if (fs.existsSync(path.join(projectRoot, 'mypy.ini')) ||
                        fs.existsSync(path.join(projectRoot, '.mypy.ini'))) {
                        return {
                            command: `mypy ${relativePaths} && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Mypy Type Check + Python Syntax Check'
                        };
                    }

                    // 5순위: Bandit (보안 취약점 검사)
                    if (fs.existsSync(path.join(projectRoot, '.bandit')) ||
                        fs.existsSync(path.join(projectRoot, 'bandit.yaml'))) {
                        return {
                            command: `bandit -r ${relativePaths} && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Bandit Security Check + Python Syntax Check'
                        };
                    }

                    // 6순위: Pyright (타입 체커 - 빠름)
                    if (fs.existsSync(path.join(projectRoot, 'pyrightconfig.json'))) {
                        return {
                            command: `pyright ${relativePaths} && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Pyright Type Check + Python Syntax Check'
                        };
                    }

                    // 7순위: Poetry/Pipenv 환경 검사
                    if (fs.existsSync(path.join(projectRoot, 'poetry.lock'))) {
                        return {
                            command: `poetry check && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Poetry Check + Python Syntax Check'
                        };
                    }

                    if (fs.existsSync(path.join(projectRoot, 'Pipfile'))) {
                        return {
                            command: `pipenv check && ${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Pipenv Check + Python Syntax Check'
                        };
                    }

                    // 기본: 문법 검사만 수행
                    return {
                        command: `${pythonCmd} -m compileall -q -j 0 ${relativePaths}`,
                        description: 'Python Syntax Check'
                    };
                }

                return null;
            }

            case ProjectType.GO:
                // Go 확장 검증 옵션
                // 1순위: golangci-lint (종합 린터)
                if (fs.existsSync(path.join(projectRoot, '.golangci.yml')) ||
                    fs.existsSync(path.join(projectRoot, '.golangci.yaml')) ||
                    fs.existsSync(path.join(projectRoot, 'golangci.yml'))) {
                    return { command: 'golangci-lint run', description: 'GolangCI-Lint' };
                }

                // 2순위: staticcheck (인기있는 정적 분석 도구)
                if (fs.existsSync(path.join(projectRoot, 'staticcheck.conf'))) {
                    return { command: 'staticcheck ./...', description: 'Go Staticcheck' };
                }

                // 3순위: go vet + go test -race (데이터 레이스 검사)
                if (this.hasGoTestFiles(projectRoot)) {
                    return { command: 'go vet ./... && go test -race -short ./...', description: 'Go Vet + Race Detection' };
                }

                // 기본: go vet
                return { command: 'go vet ./...', description: 'Go Vet' };

            case ProjectType.RUST:
                // Rust 확장 검증 옵션
                // 1순위: cargo clippy (강력한 린터)
                if (fs.existsSync(path.join(projectRoot, 'clippy.toml')) ||
                    fs.existsSync(path.join(projectRoot, '.clippy.toml'))) {
                    return { command: 'cargo clippy -- -D warnings', description: 'Cargo Clippy (warnings as errors)' };
                }

                // 2순위: cargo clippy (기본)
                return { command: 'cargo clippy', description: 'Cargo Clippy' };

                // 3순위: cargo check (컴파일 검사만)
                // return { command: 'cargo check', description: 'Rust 컴파일 검사 (cargo check)' };

            case ProjectType.FLUTTER:
                return { command: 'flutter analyze', description: 'Flutter 정적 분석' };

            case ProjectType.PHP:
                // PHP 확장 검증 옵션
                if (fs.existsSync(path.join(projectRoot, 'vendor/bin/pint'))) {
                    return { command: './vendor/bin/pint --test', description: 'Laravel Pint' };
                }
                // Laravel 프레임워크 확인
                if (fs.existsSync(path.join(projectRoot, 'artisan'))) {
                    return { command: 'php artisan route:list --compact', description: 'Laravel Route Check' };
                }
                // composer.json 유효성 검사
                if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
                    return { command: 'composer validate', description: 'Composer 설정 검사' };
                }
                // PHP 파일이 있으면 문법 체크
                const phpFiles = allFiles.filter(f => f.endsWith('.php'));
                if (phpFiles.length > 0) {
                    const firstPhpFile = phpFiles[0];
                    const relativePath = path.isAbsolute(firstPhpFile)
                        ? path.relative(projectRoot, firstPhpFile)
                        : firstPhpFile;
                    return { command: `php -l ${relativePath}`, description: 'PHP 문법 검사' };
                }
                return null;

            case ProjectType.CSHARP:
                return { command: 'dotnet build', description: '.NET 빌드 검사' };

            case ProjectType.RUBY:
                // Ruby 확장 검증 옵션
                if (fs.existsSync(path.join(projectRoot, '.rubocop.yml'))) {
                    return { command: 'bundle exec rubocop', description: 'Rubocop' };
                }
                // bundle check로 의존성 확인
                if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
                    return { command: 'bundle check', description: 'Ruby 의존성 검사' };
                }
                // Ruby 파일이 있으면 문법 체크
                const rubyFiles = allFiles.filter(f => f.endsWith('.rb'));
                if (rubyFiles.length > 0) {
                    const firstRubyFile = rubyFiles[0];
                    const relativePath = path.isAbsolute(firstRubyFile)
                        ? path.relative(projectRoot, firstRubyFile)
                        : firstRubyFile;
                    return { command: `ruby -c ${relativePath}`, description: 'Ruby 문법 검사' };
                }
                return null;

            case ProjectType.SWIFT:
                // Xcode 프로젝트 (.xcodeproj) 감지 → xcodebuild 사용
                if (process.platform === 'darwin') {
                    try {
                        const xcodeprojFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.xcodeproj'));
                        if (xcodeprojFiles.length > 0) {
                            const xcodeproj = xcodeprojFiles[0];
                            return {
                                command: `xcodebuild -project ${xcodeproj} build CODE_SIGNING_ALLOWED=NO`,
                                description: 'Xcode 프로젝트 빌드 검사'
                            };
                        }
                    } catch {
                        // 디렉토리 읽기 실패 시 swift build fallback
                    }
                }
                // Swift Package Manager (Package.swift) fallback
                return { command: 'swift build', description: 'Swift 빌드 검사' };

            case ProjectType.C_CPP:
                return { command: 'cmake -S . -B build && cmake --build build', description: 'C/C++ CMake 빌드 검사' };

            default:
                // =========================================================
                // LEVEL 4: 파일 확장자 기반 Fallback 검증
                // =========================================================
                if (allFiles.length === 0) return null;

                const extensions = new Set(allFiles.map(f => path.extname(f)));

                // --- Terraform / HCL ---
                if (extensions.has('.tf')) {
                    return { command: 'terraform validate', description: 'Terraform Validate' };
                }

                // --- Docker ---
                if (extensions.has('.Dockerfile') || allFiles.some(f => f.endsWith('Dockerfile'))) {
                    return { command: 'docker build --check .', description: 'Docker Check' };
                }
                if (allFiles.some(f => f.endsWith('docker-compose.yml'))) {
                    return { command: 'docker compose config', description: 'Docker Compose Config Check' };
                }

                // --- Kubernetes / Helm ---
                if ((extensions.has('.yaml') || extensions.has('.yml')) &&
                    fs.existsSync(path.join(projectRoot, 'Chart.yaml'))) {
                    return { command: 'helm lint .', description: 'Helm Lint' };
                }

                // --- Solidity (Web3) ---
                if (extensions.has('.sol')) {
                    if (fs.existsSync(path.join(projectRoot, 'foundry.toml'))) {
                        return { command: 'forge build', description: 'Foundry Build' };
                    }
                    if (fs.existsSync(path.join(projectRoot, 'hardhat.config.js'))) {
                        return { command: 'npx hardhat compile', description: 'Hardhat Compile' };
                    }
                }

                // --- Zig ---
                if (extensions.has('.zig')) {
                    return { command: 'zig build', description: 'Zig Build' };
                }

                // --- Elixir ---
                if (extensions.has('.ex') || extensions.has('.exs')) {
                    return { command: 'mix compile --warnings-as-errors', description: 'Mix Compile' };
                }

                // --- Scala ---
                if (extensions.has('.scala')) {
                    if (fs.existsSync(path.join(projectRoot, 'build.sbt'))) {
                        return { command: 'sbt compile', description: 'Scala Compile' };
                    }
                    return { command: 'scalac -version && echo "Scala files detected"', description: 'Scala Check' };
                }

                // --- Kotlin (non-Android) ---
                if (extensions.has('.kt') || extensions.has('.kts')) {
                    if (fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                        const gradlewKt = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
                        return { command: `${gradlewKt} compileKotlin`, description: 'Kotlin Gradle Compile' };
                    }
                    return { command: 'kotlinc -version && echo "Kotlin files detected"', description: 'Kotlin Check' };
                }

                // --- Haskell ---
                if (extensions.has('.hs')) {
                    if (fs.existsSync(path.join(projectRoot, 'stack.yaml'))) {
                        return { command: 'stack build --dry-run', description: 'Haskell Stack Check' };
                    }
                    if (fs.existsSync(path.join(projectRoot, 'cabal.project'))) {
                        return { command: 'cabal build --dry-run', description: 'Haskell Cabal Check' };
                    }
                }

                // --- OCaml ---
                if (extensions.has('.ml') || extensions.has('.mli')) {
                    if (fs.existsSync(path.join(projectRoot, 'dune-project'))) {
                        return { command: 'dune build --dry-run', description: 'OCaml Dune Build' };
                    }
                }

                // --- YAML/YML (일반) ---
                if (extensions.has('.yaml') || extensions.has('.yml')) {
                    // yamllint 또는 yq 사용
                    const yamlFiles = allFiles.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
                    if (yamlFiles.length > 0) {
                        const firstFile = yamlFiles[0];
                        const relativePath = path.isAbsolute(firstFile)
                            ? path.relative(projectRoot, firstFile)
                            : firstFile;
                        const yamlNull = process.platform === 'win32' ? '> nul' : '> /dev/null';
                        return { command: `yamllint ${relativePath} || yq eval ${relativePath} ${yamlNull}`, description: 'YAML Validation' };
                    }
                }

                // --- TOML ---
                if (extensions.has('.toml')) {
                    const tomlFiles = allFiles.filter(f => f.endsWith('.toml'));
                    if (tomlFiles.length > 0) {
                        const firstFile = tomlFiles[0];
                        const relativePath = path.isAbsolute(firstFile)
                            ? path.relative(projectRoot, firstFile)
                            : firstFile;
                        return { command: `taplo format --check ${relativePath} || echo "TOML file exists"`, description: 'TOML Validation' };
                    }
                }

                // --- Markdown ---
                if (extensions.has('.md')) {
                    // markdownlint 사용
                    const mdFiles = allFiles.filter(f => f.endsWith('.md'));
                    if (mdFiles.length > 0) {
                        const fileList = mdFiles.map(f =>
                            path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                        ).join(' ');
                        return { command: `markdownlint ${fileList}`, description: 'Markdown Lint' };
                    }
                }

                // --- SQL ---
                if (extensions.has('.sql')) {
                    const sqlFiles = allFiles.filter(f => f.endsWith('.sql'));
                    if (sqlFiles.length > 0) {
                        const firstFile = sqlFiles[0];
                        const relativePath = path.isAbsolute(firstFile)
                            ? path.relative(projectRoot, firstFile)
                            : firstFile;
                        // sqlfluff 또는 sql-lint 사용
                        return { command: `sqlfluff lint ${relativePath} || sql-lint ${relativePath}`, description: 'SQL Lint' };
                    }
                }

                // --- GraphQL ---
                if (extensions.has('.graphql') || extensions.has('.gql')) {
                    const gqlFiles = allFiles.filter(f => f.endsWith('.graphql') || f.endsWith('.gql'));
                    if (gqlFiles.length > 0) {
                        const fileList = gqlFiles.map(f =>
                            path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                        ).join(' ');
                        return { command: `graphql-schema-linter ${fileList}`, description: 'GraphQL Schema Lint' };
                    }
                }

                // --- Protobuf ---
                if (extensions.has('.proto')) {
                    const protoFiles = allFiles.filter(f => f.endsWith('.proto'));
                    if (protoFiles.length > 0) {
                        const firstFile = protoFiles[0];
                        const relativePath = path.isAbsolute(firstFile)
                            ? path.relative(projectRoot, firstFile)
                            : firstFile;
                        const protoNull = process.platform === 'win32' ? 'nul' : '/dev/null';
                        return { command: `protoc --descriptor_set_out=${protoNull} ${relativePath}`, description: 'Protobuf Validation' };
                    }
                }

                // =========================================================
                // LEVEL 5: Fallback (최후의 수단 - 파일 단위 검사)
                // =========================================================

                // Shell Script
                const shFile = allFiles.find(f => f.endsWith('.sh'));
                if (shFile) {
                    const relativePath = path.isAbsolute(shFile)
                        ? path.relative(projectRoot, shFile)
                        : shFile;
                    return { command: `bash -n ${relativePath}`, description: 'Shell Syntax Check' };
                }

                // JSON
                const jsonFile = allFiles.find(f => f.endsWith('.json'));
                if (jsonFile) {
                    const relativePath = path.isAbsolute(jsonFile)
                        ? path.relative(projectRoot, jsonFile)
                        : jsonFile;
                    return { command: `node -e "require('fs').readFileSync('${relativePath}', 'utf8'); JSON.parse(require('fs').readFileSync('${relativePath}', 'utf8'))"`, description: 'JSON Syntax' };
                }

                return null;
        }
    }

    /**
     * COMMAND_NOT_FOUND fallback: 제외 목록을 고려하여 다음 검증 후보 반환
     * getValidationCommand()와 동일한 로직이지만 excludedCommands에 포함된 명령어를 건너뜀
     */
    public async getNextValidationCandidate(
        projectType: ProjectType,
        projectRoot: string,
        createdFiles: string[],
        modifiedFiles: string[],
        excludedCommands: string[],
    ): Promise<{ command: string; description: string } | null> {
        const allFiles = [...createdFiles, ...modifiedFiles];

        // 프로젝트 타입별 후보 목록 생성
        const candidates = await this.getValidationCandidates(projectType, projectRoot, allFiles);

        // 제외 목록에 없는 첫 번째 후보 반환
        for (const candidate of candidates) {
            const isExcluded = excludedCommands.some(
                excluded => candidate.command.includes(excluded) || excluded.includes(candidate.command)
            );
            if (!isExcluded) {
                console.log(`[ProjectDetector] Next validation candidate: ${candidate.command} (excluded ${excludedCommands.length} commands)`);
                return candidate;
            }
        }

        console.log(`[ProjectDetector] No more validation candidates (all ${candidates.length} excluded)`);
        return null;
    }

    /**
     * 프로젝트 타입별 검증 명령어 후보 목록 반환 (우선순위 순)
     */
    private async getValidationCandidates(
        projectType: ProjectType,
        projectRoot: string,
        allFiles: string[],
    ): Promise<{ command: string; description: string }[]> {
        const candidates: { command: string; description: string }[] = [];

        switch (projectType) {
            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI: {
                const pythonCmd = await ProjectDetector.detectPythonRuntime(projectRoot);
                const pythonFiles = allFiles.filter(f => f.endsWith('.py'));
                const relativePaths = pythonFiles.map(f =>
                    path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                ).join(' ');

                if (pythonFiles.length > 0) {
                    if (fs.existsSync(path.join(projectRoot, 'ruff.toml')) ||
                        fs.existsSync(path.join(projectRoot, '.ruff.toml')) ||
                        fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                        candidates.push({ command: `ruff check ${relativePaths}`, description: 'Ruff Lint' });
                    }
                    if (fs.existsSync(path.join(projectRoot, '.flake8')) ||
                        fs.existsSync(path.join(projectRoot, 'setup.cfg'))) {
                        candidates.push({ command: `flake8 ${relativePaths}`, description: 'Flake8 Lint' });
                    }
                    if (fs.existsSync(path.join(projectRoot, '.pylintrc')) ||
                        fs.existsSync(path.join(projectRoot, 'pylintrc'))) {
                        candidates.push({ command: `pylint ${relativePaths}`, description: 'Pylint' });
                    }
                    if (fs.existsSync(path.join(projectRoot, 'mypy.ini')) ||
                        fs.existsSync(path.join(projectRoot, '.mypy.ini'))) {
                        candidates.push({ command: `mypy ${relativePaths}`, description: 'Mypy Type Check' });
                    }
                    // 문법 검사는 항상 후보에 포함 (최후의 수단)
                    candidates.push({ command: `${pythonCmd} -m compileall -q -j 0 ${relativePaths}`, description: 'Python Syntax Check' });
                }
                break;
            }

            case ProjectType.GO:
                if (fs.existsSync(path.join(projectRoot, '.golangci.yml')) ||
                    fs.existsSync(path.join(projectRoot, '.golangci.yaml'))) {
                    candidates.push({ command: 'golangci-lint run', description: 'GolangCI-Lint' });
                }
                if (fs.existsSync(path.join(projectRoot, 'staticcheck.conf'))) {
                    candidates.push({ command: 'staticcheck ./...', description: 'Go Staticcheck' });
                }
                candidates.push({ command: 'go vet ./...', description: 'Go Vet' });
                break;

            case ProjectType.RUST:
                candidates.push({ command: 'cargo clippy', description: 'Cargo Clippy' });
                candidates.push({ command: 'cargo check', description: 'Cargo Check' });
                break;

            default:
                // 기타 프로젝트: getValidationCommand에서 반환한 명령어만 사용
                break;
        }

        return candidates;
    }

    /**
     * 서버(백엔드)에서 관리되는 빌드/테스트 설정을 확인하여 오버라이드 반환
     * - enforcement='required': 로컬 자동감지를 무시하고 서버 설정 사용
     * - enforcement='recommended': 로컬 오버라이드가 없으면 서버 설정 사용
     * - 서버 접근 실패 시 null 반환 (기존 로직으로 폴백)
     */
    private async getServerBuildTestOverride(modifiedFiles?: string[]): Promise<{ command: string; description: string } | null> {
        try {
            const { SettingsManager } = await import('../state/SettingsManager');
            const settingsManager = SettingsManager.getInstance();
            const serverConfigs = settingsManager.getServerBuildTestConfigs();

            // 1. required 설정이 있으면 최우선 사용 (자동감지 오버라이드)
            if (serverConfigs && serverConfigs.length > 0) {
                const requiredConfig = serverConfigs.find(c => c.enforcement === 'required');
                if (requiredConfig && requiredConfig.value) {
                    const cmd = typeof requiredConfig.value === 'string'
                        ? requiredConfig.value
                        : requiredConfig.value.command;
                    const desc = typeof requiredConfig.value === 'object'
                        ? (requiredConfig.value.description || `Server config: ${requiredConfig.key}`)
                        : `Server config: ${requiredConfig.key}`;

                    if (cmd) {
                        console.log(`[ProjectDetector] Using required server build/test config: ${requiredConfig.key}`);
                        return { command: cmd, description: desc };
                    }
                }
            }

            // 2. 개인 설정이 있으면 사용 (required보다 낮고 recommended보다 높음)
            const personalConfigs = settingsManager.getPersonalBuildTestConfigs();
            if (personalConfigs && personalConfigs.length > 0) {
                const personal = personalConfigs[0]; // 첫 번째 개인 설정 사용
                const cmd = typeof personal.value === 'string'
                    ? personal.value
                    : personal.value?.command;
                if (cmd) {
                    console.log(`[ProjectDetector] Using personal build/test config: ${personal.key}`);
                    return { command: cmd, description: personal.description || `Personal: ${personal.key}` };
                }
            }

            // 3. recommended 설정이 있으면 폴백으로 사용
            if (serverConfigs && serverConfigs.length > 0) {
                const recommendedConfigs = serverConfigs.filter(c => c.enforcement === 'recommended' || c.enforcement === 'preset');
                for (const recommendedConfig of recommendedConfigs) {
                    if (!recommendedConfig.value) continue;

                    // 사용자가 비활성화한 권장 설정은 건너뛰기
                    if (settingsManager.isSettingDisabled('build_test', recommendedConfig.key)) {
                        console.log(`[ProjectDetector] Skipping disabled recommended config: ${recommendedConfig.key}`);
                        continue;
                    }

                    // language 필드가 있으면 수정된 파일의 확장자와 매칭 확인
                    const configLang = typeof recommendedConfig.value === 'object' ? recommendedConfig.value.language : undefined;
                    if (configLang && modifiedFiles && modifiedFiles.length > 0) {
                        if (!this.isLanguageMatchingFiles(configLang, modifiedFiles)) {
                            console.log(`[ProjectDetector] Skipping recommended config (language mismatch): ${recommendedConfig.key} (${configLang}) vs files: ${modifiedFiles.slice(0, 3).join(', ')}`);
                            continue;
                        }
                    }

                    const cmd = typeof recommendedConfig.value === 'string'
                        ? recommendedConfig.value
                        : recommendedConfig.value.command;
                    const desc = typeof recommendedConfig.value === 'object'
                        ? (recommendedConfig.value.description || `Server recommended: ${recommendedConfig.key}`)
                        : `Server recommended: ${recommendedConfig.key}`;

                    if (cmd) {
                        console.log(`[ProjectDetector] Using recommended server build/test config: ${recommendedConfig.key}`);
                        return { command: cmd, description: desc };
                    }
                }
            }

            return null;
        } catch (error) {
            // 서버 설정 로드 실패 시 기존 자동감지 로직으로 폴백 (오프라인 복원력)
            console.warn('[ProjectDetector] Failed to get server build/test configs (falling back to auto-detect):', error);
            return null;
        }
    }

    /**
     * 설정의 language 필드가 수정된 파일들의 확장자와 매칭되는지 확인
     */
    private isLanguageMatchingFiles(language: string, files: string[]): boolean {
        const langLower = language.toLowerCase();
        const extMap: Record<string, string[]> = {
            'typescript': ['.ts', '.tsx'],
            'javascript': ['.js', '.jsx', '.mjs', '.cjs'],
            'react': ['.tsx', '.jsx'],
            'vue': ['.vue'],
            'angular': ['.ts', '.component.ts'],
            'python': ['.py'],
            'java': ['.java'],
            'kotlin': ['.kt', '.kts'],
            'go': ['.go'],
            'rust': ['.rs'],
            'c': ['.c', '.h'],
            'c++': ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
            'c#': ['.cs'],
            'swift': ['.swift'],
            'ruby': ['.rb'],
            'php': ['.php'],
            'dart': ['.dart'],
            'scala': ['.scala'],
        };

        const matchExts = extMap[langLower];
        if (!matchExts) return true; // 알 수 없는 언어는 허용

        return files.some(f => {
            const fLower = f.toLowerCase();
            return matchExts.some(ext => fLower.endsWith(ext));
        });
    }

    /**
     * 프로젝트 타입에 맞는 필수 파일 목록을 반환합니다
     * @param projectType 프로젝트 타입
     * @param projectRoot 프로젝트 루트 경로
     * @returns 필수 파일 목록
     */
    public getCriticalFiles(projectType: ProjectType, projectRoot: string): string[] {
        const criticalFiles: string[] = [];

        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                criticalFiles.push('package.json');
                if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
                    criticalFiles.push('tsconfig.json');
                }
                break;

            case ProjectType.ANDROID:
                // Android 프로젝트 필수 파일
                if (fs.existsSync(path.join(projectRoot, 'build.gradle'))) {
                    criticalFiles.push('build.gradle');
                } else if (fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                    criticalFiles.push('build.gradle.kts');
                }
                if (fs.existsSync(path.join(projectRoot, 'settings.gradle'))) {
                    criticalFiles.push('settings.gradle');
                } else if (fs.existsSync(path.join(projectRoot, 'settings.gradle.kts'))) {
                    criticalFiles.push('settings.gradle.kts');
                }
                // app 모듈 필수 파일
                if (fs.existsSync(path.join(projectRoot, 'app', 'build.gradle'))) {
                    criticalFiles.push('app/build.gradle');
                } else if (fs.existsSync(path.join(projectRoot, 'app', 'build.gradle.kts'))) {
                    criticalFiles.push('app/build.gradle.kts');
                }
                // AndroidManifest.xml
                if (fs.existsSync(path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml'))) {
                    criticalFiles.push('app/src/main/AndroidManifest.xml');
                }
                break;

            case ProjectType.SPRING_BOOT:
                if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                    criticalFiles.push('pom.xml');
                } else {
                    // Gradle
                    if (fs.existsSync(path.join(projectRoot, 'build.gradle'))) {
                        criticalFiles.push('build.gradle');
                    }
                    if (fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                        criticalFiles.push('build.gradle.kts');
                    }
                }
                break;

            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI:
                if (fs.existsSync(path.join(projectRoot, 'requirements.txt'))) {
                    criticalFiles.push('requirements.txt');
                }
                if (fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                    criticalFiles.push('pyproject.toml');
                }
                if (fs.existsSync(path.join(projectRoot, 'Pipfile'))) {
                    criticalFiles.push('Pipfile');
                }
                break;

            case ProjectType.GO:
                criticalFiles.push('go.mod');
                break;

            case ProjectType.RUST:
                criticalFiles.push('Cargo.toml');
                break;

            case ProjectType.FLUTTER:
                criticalFiles.push('pubspec.yaml');
                break;

            case ProjectType.PHP:
                criticalFiles.push('composer.json');
                break;

            case ProjectType.CSHARP:
                // *.csproj 또는 *.sln 파일 찾기
                try {
                    const csprojFiles = fs.readdirSync(projectRoot).filter(f =>
                        f.endsWith('.csproj') || f.endsWith('.sln')
                    );
                    if (csprojFiles.length > 0) {
                        criticalFiles.push(csprojFiles[0]);
                    }
                } catch (error) {
                    // 디렉토리 읽기 실패 시 무시
                }
                break;

            case ProjectType.RUBY:
                if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
                    criticalFiles.push('Gemfile');
                }
                break;

            case ProjectType.SWIFT:
                if (fs.existsSync(path.join(projectRoot, 'Package.swift'))) {
                    criticalFiles.push('Package.swift');
                }
                break;

            case ProjectType.C_CPP:
                criticalFiles.push('CMakeLists.txt');
                break;
        }

        return criticalFiles;
    }

    /**
     * Fallback: LLM에게 프로젝트 타입 판단을 넘깁니다
     * @param projectRoot 프로젝트 루트 경로
     * @param llmApi LLM API 인스턴스 (LLMManager 또는 OllamaApi)
     * @param currentModelType 현재 모델 타입 (미사용, 호환용)
     * @param abortSignal 중단 신호
     * @returns 프로젝트 타입 정보 또는 null
     */
    public async detectWithLLMFallback(
        projectRoot: string,
        llmApi?: any,
        currentModelType?: any,
        abortSignal?: AbortSignal,
        subDirectoryInfo?: string
    ): Promise<{
        type: ProjectType;
        confidence: number;
        buildTool: BuildTool;
    } | null> {
        // LLM이 없으면 null 반환
        if (!llmApi) {
            return null;
        }

        try {
            // 프로젝트 루트의 파일 목록 수집
            let files: string[] = [];
            try {
                files = fs.readdirSync(projectRoot).slice(0, 20); // 최대 20개 파일만
            } catch (error) {
                console.error('[ProjectDetector] Error reading directory:', error);
                return null;
            }
            const fileList = files.join(', ');

            const subDirSection = subDirectoryInfo
                ? `\n\n서브디렉토리 구조 정보:\n${subDirectoryInfo}\n위 서브디렉토리 정보를 참고하여 모노레포/멀티프로젝트 구조인지 판단하세요.`
                : '';

            const prompt = `다음 디렉토리의 파일 목록을 보고 프로젝트 타입을 판단하세요.

파일 목록: ${fileList}${subDirSection}

지원하는 프로젝트 타입 (우선순위 순서대로):
1. android: build.gradle + (app 폴더 또는 AndroidManifest.xml 존재) - Android 프로젝트
2. java-gradle: build.gradle, build.gradle.kts, settings.gradle, gradlew 존재 (Android가 아닌 경우)
3. java-maven: pom.xml 존재
4. nodejs: package.json 존재
5. python: requirements.txt, pyproject.toml, 또는 Pipfile 존재 (단, __pycache__나 .pytest_cache 폴더만 있는 경우는 python이 아닐 수 있음)
6. go: go.mod 존재
7. rust: Cargo.toml 존재
8. php: composer.json 존재
9. dart/flutter: pubspec.yaml 존재
10. csharp: *.csproj, *.sln 존재
11. ruby: Gemfile, Rakefile 존재
12. swift: Package.swift 또는 *.xcodeproj 존재 (Mac OS만)
13. c-cpp: CMakeLists.txt 존재

중요:
- __pycache__, .pytest_cache 같은 캐시 디렉토리만으로 Python 프로젝트라고 판단하지 마세요.
- build.gradle이 있고 app 폴더나 AndroidManifest.xml이 있으면 android로 판단하세요.
- build.gradle이 있지만 Android 특징이 없으면 java-gradle로 판단하세요.

JSON 형식으로 응답하세요:
{
  "projectType": "android",
  "confidence": 0.95,
  "reasoning": "build.gradle과 app 폴더가 존재하므로 Android 프로젝트입니다."
}`;

            // LLM 호출
            const response = await llmApi.sendMessage(prompt, abortSignal);

            // JSON 파싱 시도
            const jsonMatch = response.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                let parsed: any;
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch {
                    console.warn('[ProjectDetector] JSON parse failed, trying code block extraction');
                    const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
                    if (codeBlock) {
                        try { parsed = JSON.parse(codeBlock[1].trim()); } catch { return null; }
                    } else {
                        return null;
                    }
                }
                const projectTypeStr = parsed.projectType;

                // 문자열을 ProjectType enum으로 변환
                let projectType: ProjectType = ProjectType.UNKNOWN;
                let buildTool: BuildTool = BuildTool.UNKNOWN;

                switch (projectTypeStr) {
                    case 'nodejs':
                        projectType = ProjectType.NODE;
                        buildTool = BuildTool.NPM;
                        break;
                    case 'android':
                        projectType = ProjectType.ANDROID;
                        buildTool = BuildTool.GRADLE;
                        break;
                    case 'java-maven':
                        projectType = ProjectType.SPRING_BOOT;
                        buildTool = BuildTool.MAVEN;
                        break;
                    case 'java-gradle':
                        projectType = ProjectType.SPRING_BOOT;
                        buildTool = BuildTool.GRADLE;
                        break;
                    case 'python':
                        projectType = ProjectType.PYTHON;
                        buildTool = BuildTool.PIP;
                        break;
                    case 'go':
                        projectType = ProjectType.GO;
                        buildTool = BuildTool.GO_MOD;
                        break;
                    case 'rust':
                        projectType = ProjectType.RUST;
                        buildTool = BuildTool.CARGO;
                        break;
                    case 'php':
                        projectType = ProjectType.PHP;
                        buildTool = BuildTool.COMPOSER;
                        break;
                    case 'dart':
                    case 'flutter':
                        projectType = ProjectType.FLUTTER;
                        buildTool = BuildTool.PUB;
                        break;
                    case 'csharp':
                        projectType = ProjectType.CSHARP;
                        buildTool = BuildTool.DOTNET;
                        break;
                    case 'ruby':
                        projectType = ProjectType.RUBY;
                        buildTool = BuildTool.BUNDLER;
                        break;
                    case 'swift':
                        projectType = ProjectType.SWIFT;
                        buildTool = BuildTool.UNKNOWN;
                        break;
                    case 'c-cpp':
                        projectType = ProjectType.C_CPP;
                        buildTool = BuildTool.CMAKE;
                        break;
                }

                return {
                    type: projectType,
                    confidence: parsed.confidence || 0.7,
                    buildTool
                };
            }

            return null;
        } catch (error) {
            console.error('[ProjectDetector] Error in LLM fallback:', error);
            return null;
        }
    }

    /**
     * 프로젝트 타입에 따라 적절한 formatter 명령어를 반환합니다
     * Formatter는 tsc/build 전에 실행되어야 합니다
     */
    public getFormatterCommand(
        projectType: ProjectType,
        projectRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): { command: string; description: string } | null {
        const allFiles = [...createdFiles, ...modifiedFiles];

        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
            case ProjectType.JAVASCRIPT:
                // ✅ JavaScript / TypeScript / Web 계열
                // 1순위: Biome (Formatter + Linter 통합, 매우 빠름)
                if (fs.existsSync(path.join(projectRoot, 'biome.json')) ||
                    fs.existsSync(path.join(projectRoot, 'biome.jsonc'))) {
                    if (allFiles.length > 0) {
                        const fileList = allFiles.map(f =>
                            path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                        ).join(' ');
                        return {
                            command: `biome format --write ${fileList}`,
                            description: 'Biome Formatter (선택 파일)'
                        };
                    }
                    return {
                        command: 'biome format --write .',
                        description: 'Biome Formatter (전체)'
                    };
                }

                // 2순위: Prettier (사실상 표준)
                // package.json scripts 확인 (우선순위 1)
                if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                    const pm = this.detectPackageManager(projectRoot);
                    if (this.hasScript(projectRoot, 'format')) {
                        return {
                            command: `${pm} run format`,
                            description: 'NPM Format 스크립트'
                        };
                    }
                }

                // Prettier 설정 파일 확인
                if (fs.existsSync(path.join(projectRoot, '.prettierrc')) ||
                    fs.existsSync(path.join(projectRoot, '.prettierrc.json')) ||
                    fs.existsSync(path.join(projectRoot, '.prettierrc.js')) ||
                    fs.existsSync(path.join(projectRoot, 'prettier.config.js')) ||
                    fs.existsSync(path.join(projectRoot, '.prettierrc.yaml')) ||
                    fs.existsSync(path.join(projectRoot, '.prettierrc.yml'))) {
                    // ✅ npx prettier 사용 (npm, yarn, pnpm 모두 지원)
                    if (allFiles.length > 0) {
                        const fileList = allFiles.map(f =>
                            path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                        ).join(' ');
                        return {
                            command: `npx prettier --write ${fileList}`,
                            description: 'Prettier Formatter (선택 파일)'
                        };
                    }
                    return {
                        command: 'npx prettier --write .',
                        description: 'Prettier Formatter (전체)'
                    };
                }

                // 기본값: Prettier 시도 (설정 파일이 없어도)
                if (allFiles.length > 0) {
                    const fileList = allFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `npx prettier --write ${fileList}`,
                        description: 'Prettier Formatter (기본, 선택 파일)'
                    };
                }
                return {
                    command: 'npx prettier --write .',
                    description: 'Prettier Formatter (기본, 전체)'
                };

            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI:
                // ✅ Python
                // 1순위: Ruff format (Black 호환 + 매우 빠름)
                if (fs.existsSync(path.join(projectRoot, 'ruff.toml')) ||
                    fs.existsSync(path.join(projectRoot, '.ruff.toml')) ||
                    fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                    const pythonFiles = allFiles.filter(f => f.endsWith('.py'));
                    if (pythonFiles.length > 0) {
                        const fileList = pythonFiles.map(f =>
                            path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                        ).join(' ');
                        return {
                            command: `ruff format ${fileList}`,
                            description: 'Ruff Formatter (선택 파일)'
                        };
                    }
                    return {
                        command: 'ruff format .',
                        description: 'Ruff Formatter (전체)'
                    };
                }

                // 2순위: Black (사실상 표준)
                const pythonFiles = allFiles.filter(f => f.endsWith('.py'));
                if (pythonFiles.length > 0) {
                    const fileList = pythonFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `black ${fileList}`,
                        description: 'Black Formatter (선택 파일)'
                    };
                }
                return {
                    command: 'black .',
                    description: 'Black Formatter (전체)'
                };

            case ProjectType.GO:
                // ✅ Go
                // gofmt는 절대적 표준
                const goFiles = allFiles.filter(f => f.endsWith('.go'));
                if (goFiles.length > 0) {
                    const fileList = goFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `gofmt -w ${fileList}`,
                        description: 'gofmt Formatter (선택 파일)'
                    };
                }
                return {
                    command: 'gofmt -w .',
                    description: 'gofmt Formatter (전체)'
                };

            case ProjectType.RUST:
                // ✅ Rust
                return {
                    command: 'cargo fmt',
                    description: 'rustfmt Formatter'
                };

            case ProjectType.SPRING_BOOT:
            case ProjectType.JAVA:
                // ✅ Java
                // google-java-format
                const javaFiles = allFiles.filter(f => f.endsWith('.java'));
                if (javaFiles.length > 0) {
                    const fileList = javaFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `google-java-format -i ${fileList}`,
                        description: 'google-java-format (선택 파일)'
                    };
                }
                // 전체 파일 포맷팅은 시간이 오래 걸릴 수 있으므로 선택 파일만
                return null;

            case ProjectType.PHP:
                // ✅ PHP
                // Laravel Pint (Laravel 전용)
                if (fs.existsSync(path.join(projectRoot, 'pint.json')) ||
                    fs.existsSync(path.join(projectRoot, 'composer.json'))) {
                    const composerJson = JSON.parse(
                        fs.readFileSync(path.join(projectRoot, 'composer.json'), 'utf8')
                    );
                    if (composerJson.require?.['laravel/framework'] ||
                        composerJson['require-dev']?.['laravel/pint']) {
                        const phpFiles = allFiles.filter(f => f.endsWith('.php'));
                        if (phpFiles.length > 0) {
                            const fileList = phpFiles.map(f =>
                                path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                            ).join(' ');
                            return {
                                command: `./vendor/bin/pint ${fileList}`,
                                description: 'Laravel Pint Formatter (선택 파일)'
                            };
                        }
                        return {
                            command: './vendor/bin/pint',
                            description: 'Laravel Pint Formatter (전체)'
                        };
                    }
                }

                // PHP-CS-Fixer
                const phpFiles = allFiles.filter(f => f.endsWith('.php'));
                if (phpFiles.length > 0) {
                    const fileList = phpFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `php-cs-fixer fix ${fileList}`,
                        description: 'PHP-CS-Fixer (선택 파일)'
                    };
                }
                return {
                    command: 'php-cs-fixer fix .',
                    description: 'PHP-CS-Fixer (전체)'
                };

            case ProjectType.RUBY:
                // ✅ Ruby
                // Rubocop --auto-correct
                const rubyFiles = allFiles.filter(f => f.endsWith('.rb'));
                if (rubyFiles.length > 0) {
                    const fileList = rubyFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `rubocop --auto-correct ${fileList}`,
                        description: 'Rubocop Formatter (선택 파일)'
                    };
                }
                return {
                    command: 'rubocop --auto-correct',
                    description: 'Rubocop Formatter (전체)'
                };

            case ProjectType.CSHARP:
                // ✅ C#
                return {
                    command: 'dotnet format',
                    description: 'dotnet format Formatter'
                };

            case ProjectType.SWIFT:
                // ✅ Swift
                const swiftFiles = allFiles.filter(f => f.endsWith('.swift'));
                if (swiftFiles.length > 0) {
                    const fileList = swiftFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `swift-format -i ${fileList}`,
                        description: 'swift-format (선택 파일)'
                    };
                }
                return {
                    command: 'swift-format -i .',
                    description: 'swift-format (전체)'
                };

            case ProjectType.FLUTTER:
                // ✅ Flutter / Dart
                const dartFiles = allFiles.filter(f => f.endsWith('.dart'));
                if (dartFiles.length > 0) {
                    const fileList = dartFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `dart format ${fileList}`,
                        description: 'dart format (선택 파일)'
                    };
                }
                return {
                    command: 'dart format .',
                    description: 'dart format (전체)'
                };

            case ProjectType.C_CPP:
                // ✅ C / C++
                const cppFiles = allFiles.filter(f =>
                    f.endsWith('.c') || f.endsWith('.cpp') || f.endsWith('.cc') ||
                    f.endsWith('.cxx') || f.endsWith('.h') || f.endsWith('.hpp')
                );
                if (cppFiles.length > 0) {
                    const fileList = cppFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return {
                        command: `clang-format -i ${fileList}`,
                        description: 'clang-format (선택 파일)'
                    };
                }
                return {
                    command: process.platform === 'win32'
                        ? 'powershell -Command "Get-ChildItem -Recurse -Include *.cpp,*.h | ForEach-Object { clang-format -i $_.FullName }"'
                        : 'find . -name "*.cpp" -o -name "*.h" | xargs clang-format -i',
                    description: 'clang-format (전체)'
                };

            default:
                return null;
        }
    }

    // ==================== 환경 상태 검사 ====================

    /**
     * 프로젝트 환경 상태 검사 (파일시스템 기반)
     * manifest 파일은 있지만 dependency 디렉토리가 없으면 설치 필요로 판단
     * 키워드 패턴 매칭 없이 파일시스템 상태만으로 판단
     */
    public static checkEnvironmentHealth(workspaceRoot: string): EnvironmentHealth {
        const result: EnvironmentHealth = {
            hasManifestFile: false,
            hasDependencyDir: false,
            hasLockFile: false,
            needsInstall: false,
        };

        // 범용 매니페스트 → 의존성 디렉토리 매핑 테이블
        const ECOSYSTEM_MAP: Array<{
            manifest: string;
            depDir: string;          // 빈 문자열 = dep dir 검사 불필요 (Go 등)
            lockFiles: string[];
            installCmd: (pm: string) => string;
        }> = [
            {
                manifest: 'package.json',
                depDir: 'node_modules',
                lockFiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'],
                installCmd: (pm) => `${pm} install`
            },
            {
                manifest: 'requirements.txt',
                depDir: '',
                lockFiles: [],
                installCmd: () => 'pip install -r requirements.txt'
            },
            {
                manifest: 'pyproject.toml',
                depDir: '.venv',
                lockFiles: ['poetry.lock', 'pdm.lock'],
                installCmd: () => 'poetry install'
            },
            {
                manifest: 'Pipfile',
                depDir: '.venv',
                lockFiles: ['Pipfile.lock'],
                installCmd: () => 'pipenv install'
            },
            {
                manifest: 'Cargo.toml',
                depDir: 'target',
                lockFiles: ['Cargo.lock'],
                installCmd: () => 'cargo build'
            },
            {
                manifest: 'go.mod',
                depDir: '',
                lockFiles: ['go.sum'],
                installCmd: () => 'go mod download'
            },
            {
                manifest: 'Gemfile',
                depDir: 'vendor/bundle',
                lockFiles: ['Gemfile.lock'],
                installCmd: () => 'bundle install'
            },
            {
                manifest: 'composer.json',
                depDir: 'vendor',
                lockFiles: ['composer.lock'],
                installCmd: () => 'composer install'
            },
            {
                manifest: 'pubspec.yaml',
                depDir: '.dart_tool',
                lockFiles: ['pubspec.lock'],
                installCmd: () => 'flutter pub get'
            },
        ];

        for (const eco of ECOSYSTEM_MAP) {
            const manifestPath = path.join(workspaceRoot, eco.manifest);
            if (fs.existsSync(manifestPath)) {
                result.hasManifestFile = true;

                // Lock file 존재 여부
                for (const lockFile of eco.lockFiles) {
                    if (fs.existsSync(path.join(workspaceRoot, lockFile))) {
                        result.hasLockFile = true;
                        break;
                    }
                }

                // Dependency directory 존재 여부
                if (eco.depDir) {
                    result.hasDependencyDir = fs.existsSync(path.join(workspaceRoot, eco.depDir));
                } else {
                    result.hasDependencyDir = true; // dep dir 검사 불필요 (Go 등)
                }

                // 패키지 매니저 감지 (Node.js 에코시스템)
                if (eco.manifest === 'package.json') {
                    const detector = new ProjectDetector();
                    result.packageManager = detector.detectPackageManager(workspaceRoot);
                    result.installCommand = eco.installCmd(result.packageManager);
                } else {
                    result.installCommand = eco.installCmd('');
                }

                result.needsInstall = result.hasManifestFile && !result.hasDependencyDir;
                break; // 첫 번째 매칭 에코시스템 사용
            }
        }

        return result;
    }
}

