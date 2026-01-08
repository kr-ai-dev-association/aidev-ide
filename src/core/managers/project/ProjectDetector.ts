/**
 * Project Detector
 * 프로젝트 타입을 감지하는 클래스
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    ProjectType,
    BuildTool
} from './types';

export class ProjectDetector {
    /**
     * 프로젝트 타입을 감지합니다
     */
    public async detectProjectType(projectRoot: string): Promise<{
        type: ProjectType;
        confidence: number;
        buildTool: BuildTool;
    }> {
        console.log(`[ProjectDetector] Detecting project type: ${projectRoot}`);

        // 파일 기반 감지
        const fileBasedDetection = this.detectByFiles(projectRoot);
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
     * 파일을 기반으로 프로젝트 타입을 감지합니다
     */
    private detectByFiles(projectRoot: string): {
        type: ProjectType;
        confidence: number;
        buildTool: BuildTool;
    } | null {
        try {
            // package.json (Node.js/TypeScript/React)
            if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                const packageJson = JSON.parse(
                    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
                );

                // React
                if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
                    return {
                        type: ProjectType.REACT,
                        confidence: 0.95,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }

                // Vue
                if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
                    return {
                        type: ProjectType.VUE,
                        confidence: 0.95,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }

                // Angular
                if (packageJson.dependencies?.['@angular/core'] || packageJson.devDependencies?.['@angular/core']) {
                    return {
                        type: ProjectType.ANGULAR,
                        confidence: 0.95,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }

                // TypeScript
                if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
                    return {
                        type: ProjectType.TYPESCRIPT,
                        confidence: 0.9,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }

                // JavaScript/Node.js
                return {
                    type: ProjectType.NODE,
                    confidence: 0.85,
                    buildTool: this.detectBuildTool(projectRoot)
                };
            }

            // pom.xml (Java Maven)
            if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                return {
                    type: ProjectType.SPRING_BOOT,
                    confidence: 0.9,
                    buildTool: BuildTool.MAVEN
                };
            }

            // build.gradle 또는 build.gradle.kts (Java Gradle) - 안드로이드 포함
            if (fs.existsSync(path.join(projectRoot, 'build.gradle')) ||
                fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                return {
                    type: ProjectType.SPRING_BOOT,
                    confidence: 0.9,
                    buildTool: BuildTool.GRADLE
                };
            }

            // requirements.txt, pyproject.toml, Pipfile (Python)
            if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
                fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
                fs.existsSync(path.join(projectRoot, 'Pipfile'))) {

                // Django
                if (fs.existsSync(path.join(projectRoot, 'manage.py'))) {
                    return {
                        type: ProjectType.DJANGO,
                        confidence: 0.95,
                        buildTool: BuildTool.PIP
                    };
                }

                // Flask
                if (fs.existsSync(path.join(projectRoot, 'app.py')) ||
                    fs.existsSync(path.join(projectRoot, 'flask_app.py'))) {
                    return {
                        type: ProjectType.FLASK,
                        confidence: 0.9,
                        buildTool: BuildTool.PIP
                    };
                }

                // FastAPI
                if (fs.existsSync(path.join(projectRoot, 'main.py'))) {
                    const mainPy = fs.readFileSync(path.join(projectRoot, 'main.py'), 'utf8');
                    if (mainPy.includes('FastAPI') || mainPy.includes('from fastapi')) {
                        return {
                            type: ProjectType.FASTAPI,
                            confidence: 0.9,
                            buildTool: BuildTool.PIP
                        };
                    }
                }

                // 일반 Python
                return {
                    type: ProjectType.PYTHON,
                    confidence: 0.8,
                    buildTool: BuildTool.PIP
                };
            }

            // go.mod (Go)
            if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
                return {
                    type: ProjectType.GO,
                    confidence: 0.95,
                    buildTool: BuildTool.GO_MOD
                };
            }

            // Cargo.toml (Rust)
            if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
                return {
                    type: ProjectType.RUST,
                    confidence: 0.95,
                    buildTool: BuildTool.CARGO
                };
            }

            // pubspec.yaml (Dart/Flutter)
            if (fs.existsSync(path.join(projectRoot, 'pubspec.yaml'))) {
                return {
                    type: ProjectType.FLUTTER,
                    confidence: 0.95,
                    buildTool: BuildTool.PUB
                };
            }

            // composer.json (PHP)
            if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
                return {
                    type: ProjectType.PHP,
                    confidence: 0.95,
                    buildTool: BuildTool.COMPOSER
                };
            }

            // *.csproj, *.sln, *.fsproj (C# / .NET)
            try {
                const csprojFiles = fs.readdirSync(projectRoot).filter(f =>
                    f.endsWith('.csproj') || f.endsWith('.sln') || f.endsWith('.fsproj')
                );
                if (csprojFiles.length > 0) {
                    return {
                        type: ProjectType.CSHARP,
                        confidence: 0.95,
                        buildTool: BuildTool.DOTNET
                    };
                }
            } catch (error) {
                // 디렉토리 읽기 실패 시 무시
            }

            // Gemfile, Rakefile (Ruby)
            if (fs.existsSync(path.join(projectRoot, 'Gemfile')) ||
                fs.existsSync(path.join(projectRoot, 'Rakefile'))) {
                return {
                    type: ProjectType.RUBY,
                    confidence: 0.9,
                    buildTool: BuildTool.BUNDLER
                };
            }

            // Package.swift (Swift) - Mac OS 환경일 때만
            if (process.platform === 'darwin' && fs.existsSync(path.join(projectRoot, 'Package.swift'))) {
                return {
                    type: ProjectType.SWIFT,
                    confidence: 0.95,
                    buildTool: BuildTool.UNKNOWN
                };
            }
            // *.xcodeproj (iOS/macOS)
            if (process.platform === 'darwin') {
                try {
                    const xcodeprojFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.xcodeproj'));
                    if (xcodeprojFiles.length > 0) {
                        return {
                            type: ProjectType.SWIFT,
                            confidence: 0.9,
                            buildTool: BuildTool.UNKNOWN
                        };
                    }
                } catch (error) {
                    // 디렉토리 읽기 실패 시 무시
                }
            }

            // CMakeLists.txt (C/C++)
            if (fs.existsSync(path.join(projectRoot, 'CMakeLists.txt'))) {
                return {
                    type: ProjectType.C_CPP,
                    confidence: 0.9,
                    buildTool: BuildTool.CMAKE
                };
            }

            return null;

        } catch (error) {
            console.error('[ProjectDetector] Error detecting project type:', error);
            return null;
        }
    }

    /**
     * 빌드 도구를 감지합니다
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

    public getValidationCommand(
        projectType: ProjectType,
        projectRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): { command: string; description: string } | null {
        const allFiles = [...createdFiles, ...modifiedFiles];

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
                    // TypeScript 프로젝트: tsc --noEmit을 먼저 실행하고, 그 다음 린트 실행
                    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                        const pm = this.detectPackageManager(projectRoot);

                        // Biome (매우 빠른 최신 툴)
                        if (fs.existsSync(path.join(projectRoot, 'biome.json'))) {
                            return { command: `tsc --noEmit && ${pm} biome check .`, description: 'TypeScript 타입 검사 + Biome 검사' };
                        }

                        // Deno
                        if (fs.existsSync(path.join(projectRoot, 'deno.json'))) {
                            return { command: 'tsc --noEmit && deno lint', description: 'TypeScript 타입 검사 + Deno Lint' };
                        }

                        // package.json scripts: tsc --noEmit 후 린트 실행
                        if (this.hasScript(projectRoot, 'lint')) {
                            return { command: `tsc --noEmit && ${pm} run lint`, description: 'TypeScript 타입 검사 + Lint' };
                        }
                        if (this.hasScript(projectRoot, 'type-check')) {
                            return { command: `tsc --noEmit && ${pm} run type-check`, description: 'TypeScript 타입 검사 + Type Check' };
                        }
                        if (this.hasScript(projectRoot, 'validate')) {
                            return { command: `tsc --noEmit && ${pm} run validate`, description: 'TypeScript 타입 검사 + Validate' };
                        }
                        if (this.hasScript(projectRoot, 'build')) {
                            return { command: `tsc --noEmit && ${pm} run build`, description: 'TypeScript 타입 검사 + Build' };
                        }
                    }

                    // package.json이 없거나 스크립트가 없는 경우 tsc --noEmit만 실행
                    return { command: 'tsc --noEmit', description: 'TypeScript 컴파일 검사' };
                }

                // JavaScript만 있는 경우
                if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                    const pm = this.detectPackageManager(projectRoot);

                    // Biome (매우 빠른 최신 툴)
                    if (fs.existsSync(path.join(projectRoot, 'biome.json'))) {
                        return { command: `${pm} biome check .`, description: 'Biome 검사' };
                    }

                    // Deno
                    if (fs.existsSync(path.join(projectRoot, 'deno.json'))) {
                        return { command: 'deno lint', description: 'Deno Lint' };
                    }

                    // package.json scripts
                    if (this.hasScript(projectRoot, 'lint')) return { command: `${pm} run lint`, description: 'NPM Lint 스크립트' };
                    if (this.hasScript(projectRoot, 'type-check')) return { command: `${pm} run type-check`, description: 'Type Check' };
                    if (this.hasScript(projectRoot, 'validate')) return { command: `${pm} run validate`, description: 'Validate 스크립트' };
                    if (this.hasScript(projectRoot, 'build')) return { command: `${pm} run build`, description: 'Build 스크립트' };
                }

                // JavaScript만 있는 경우 npm run build 시도 (package.json에 build 스크립트가 있는 경우)
                return { command: 'npm run build --dry-run 2>/dev/null || echo "No build script"', description: 'Node.js 빌드 검사' };

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
            case ProjectType.FASTAPI:
                // Python 확장 검증 옵션
                if (fs.existsSync(path.join(projectRoot, 'poetry.lock'))) {
                    return { command: 'poetry check', description: 'Poetry 설정 검사' };
                }
                if (fs.existsSync(path.join(projectRoot, 'Pipfile'))) {
                    return { command: 'pipenv check', description: 'Pipenv 보안/설정 검사' };
                }
                if (fs.existsSync(path.join(projectRoot, 'ruff.toml')) || fs.existsSync(path.join(projectRoot, '.ruff.toml'))) {
                    return { command: 'ruff check .', description: 'Ruff Lint' };
                }
                if (fs.existsSync(path.join(projectRoot, 'mypy.ini'))) {
                    return { command: 'mypy .', description: 'Mypy Type Check' };
                }

                // 생성/수정된 Python 파일들에 대해 컴파일 검사
                const pythonFiles = allFiles.filter(f => f.endsWith('.py'));
                if (pythonFiles.length > 0) {
                    // 여러 파일을 한 번에 검사
                    const relativePaths = pythonFiles.map(f =>
                        path.isAbsolute(f) ? path.relative(projectRoot, f) : f
                    ).join(' ');
                    return { command: `python3 -m compileall -q -j 0 ${relativePaths}`, description: 'Python Syntax Check' };
                }
                return null;

            case ProjectType.GO:
                // Go 확장 검증 옵션
                if (fs.existsSync(path.join(projectRoot, 'golangci.yml'))) {
                    return { command: 'golangci-lint run', description: 'GolangCI-Lint' };
                }
                return { command: 'go vet ./...', description: 'Go Vet' };

            case ProjectType.RUST:
                return { command: 'cargo check', description: 'Rust 컴파일 검사 (cargo check)' };

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
     * @param llmApi LLM API 인스턴스 (GeminiApi 또는 OllamaApi)
     * @param currentModelType 현재 모델 타입
     * @param abortSignal 중단 신호
     * @returns 프로젝트 타입 정보 또는 null
     */
    public async detectWithLLMFallback(
        projectRoot: string,
        llmApi?: any,
        currentModelType?: any,
        abortSignal?: AbortSignal
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

            const prompt = `다음 디렉토리의 파일 목록을 보고 프로젝트 타입을 판단하세요.

파일 목록: ${fileList}

지원하는 프로젝트 타입:
1. nodejs: package.json 존재
2. java-maven: pom.xml 존재
3. java-gradle: build.gradle 또는 build.gradle.kts 존재
4. python: requirements.txt, pyproject.toml, 또는 Pipfile 존재
5. go: go.mod 존재
6. rust: Cargo.toml 존재
7. php: composer.json 존재
8. dart/flutter: pubspec.yaml 존재
9. csharp: *.csproj, *.sln 존재
10. ruby: Gemfile, Rakefile 존재
11. swift: Package.swift 또는 *.xcodeproj 존재 (Mac OS만)
12. c-cpp: CMakeLists.txt 존재

JSON 형식으로 응답하세요:
{
  "projectType": "nodejs",
  "confidence": 0.9,
  "reasoning": "package.json 파일이 존재하므로 Node.js 프로젝트입니다."
}`;

            // LLM 호출
            const response = await llmApi.sendMessage(prompt, abortSignal);

            // JSON 파싱 시도
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const projectTypeStr = parsed.projectType;

                // 문자열을 ProjectType enum으로 변환
                let projectType: ProjectType = ProjectType.UNKNOWN;
                let buildTool: BuildTool = BuildTool.UNKNOWN;

                switch (projectTypeStr) {
                    case 'nodejs':
                        projectType = ProjectType.NODE;
                        buildTool = BuildTool.NPM;
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
}

