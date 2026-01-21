"use strict";
/**
 * Project Detector
 * 프로젝트 타입을 감지하는 클래스
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectDetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const AgentConfig_1 = require("../../config/AgentConfig");
class ProjectDetector {
    /**
     * 프로젝트 타입을 감지합니다
     */
    async detectProjectType(projectRoot) {
        console.log(`[ProjectDetector] Detecting project type: ${projectRoot}`);
        // 파일 기반 감지
        const fileBasedDetection = this.detectByFiles(projectRoot);
        if (fileBasedDetection) {
            return fileBasedDetection;
        }
        // 기본값
        return {
            type: types_1.ProjectType.UNKNOWN,
            confidence: 0,
            buildTool: types_1.BuildTool.UNKNOWN
        };
    }
    /**
     * 파일을 기반으로 프로젝트 타입을 감지합니다
     */
    detectByFiles(projectRoot) {
        try {
            // package.json (Node.js/TypeScript/React)
            if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
                // React
                if (packageJson.dependencies?.react || packageJson.devDependencies?.react) {
                    return {
                        type: types_1.ProjectType.REACT,
                        confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }
                // Vue
                if (packageJson.dependencies?.vue || packageJson.devDependencies?.vue) {
                    return {
                        type: types_1.ProjectType.VUE,
                        confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }
                // Angular
                if (packageJson.dependencies?.['@angular/core'] || packageJson.devDependencies?.['@angular/core']) {
                    return {
                        type: types_1.ProjectType.ANGULAR,
                        confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.DEPENDENCY_BASED,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }
                // TypeScript
                if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
                    return {
                        type: types_1.ProjectType.TYPESCRIPT,
                        confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                        buildTool: this.detectBuildTool(projectRoot)
                    };
                }
                // JavaScript/Node.js
                return {
                    type: types_1.ProjectType.NODE,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.LOCAL_HEURISTIC,
                    buildTool: this.detectBuildTool(projectRoot)
                };
            }
            // pom.xml (Java Maven)
            if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                return {
                    type: types_1.ProjectType.SPRING_BOOT,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.MAVEN
                };
            }
            // build.gradle 또는 build.gradle.kts (Java Gradle) - 안드로이드 포함
            if (fs.existsSync(path.join(projectRoot, 'build.gradle')) ||
                fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                return {
                    type: types_1.ProjectType.SPRING_BOOT,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.GRADLE
                };
            }
            // requirements.txt, pyproject.toml, Pipfile (Python)
            if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
                fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
                fs.existsSync(path.join(projectRoot, 'Pipfile'))) {
                // Django
                if (fs.existsSync(path.join(projectRoot, 'manage.py'))) {
                    return {
                        type: types_1.ProjectType.DJANGO,
                        confidence: AgentConfig_1.AgentConfig.PYTHON_PROJECT_CONFIDENCE.DJANGO,
                        buildTool: types_1.BuildTool.PIP
                    };
                }
                // Flask
                if (fs.existsSync(path.join(projectRoot, 'app.py')) ||
                    fs.existsSync(path.join(projectRoot, 'flask_app.py'))) {
                    return {
                        type: types_1.ProjectType.FLASK,
                        confidence: AgentConfig_1.AgentConfig.PYTHON_PROJECT_CONFIDENCE.FLASK_FASTAPI,
                        buildTool: types_1.BuildTool.PIP
                    };
                }
                // FastAPI
                if (fs.existsSync(path.join(projectRoot, 'main.py'))) {
                    const mainPy = fs.readFileSync(path.join(projectRoot, 'main.py'), 'utf8');
                    if (mainPy.includes('FastAPI') || mainPy.includes('from fastapi')) {
                        return {
                            type: types_1.ProjectType.FASTAPI,
                            confidence: AgentConfig_1.AgentConfig.PYTHON_PROJECT_CONFIDENCE.FLASK_FASTAPI,
                            buildTool: types_1.BuildTool.PIP
                        };
                    }
                }
                // 일반 Python
                return {
                    type: types_1.ProjectType.PYTHON,
                    confidence: AgentConfig_1.AgentConfig.PYTHON_PROJECT_CONFIDENCE.GENERAL,
                    buildTool: types_1.BuildTool.PIP
                };
            }
            // go.mod (Go)
            if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
                return {
                    type: types_1.ProjectType.GO,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.GO_MOD
                };
            }
            // Cargo.toml (Rust)
            if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
                return {
                    type: types_1.ProjectType.RUST,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.CARGO
                };
            }
            // pubspec.yaml (Dart/Flutter)
            if (fs.existsSync(path.join(projectRoot, 'pubspec.yaml'))) {
                return {
                    type: types_1.ProjectType.FLUTTER,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.PUB
                };
            }
            // composer.json (PHP)
            if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
                return {
                    type: types_1.ProjectType.PHP,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.COMPOSER
                };
            }
            // *.csproj, *.sln, *.fsproj (C# / .NET)
            try {
                const csprojFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.csproj') || f.endsWith('.sln') || f.endsWith('.fsproj'));
                if (csprojFiles.length > 0) {
                    return {
                        type: types_1.ProjectType.CSHARP,
                        confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                        buildTool: types_1.BuildTool.DOTNET
                    };
                }
            }
            catch (error) {
                // 디렉토리 읽기 실패 시 무시
            }
            // Gemfile, Rakefile (Ruby)
            if (fs.existsSync(path.join(projectRoot, 'Gemfile')) ||
                fs.existsSync(path.join(projectRoot, 'Rakefile'))) {
                return {
                    type: types_1.ProjectType.RUBY,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.BUNDLER
                };
            }
            // Package.swift (Swift) - Mac OS 환경일 때만
            if (process.platform === 'darwin' && fs.existsSync(path.join(projectRoot, 'Package.swift'))) {
                return {
                    type: types_1.ProjectType.SWIFT,
                    confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                    buildTool: types_1.BuildTool.UNKNOWN
                };
            }
            // *.xcodeproj (iOS/macOS)
            if (process.platform === 'darwin') {
                try {
                    const xcodeprojFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.xcodeproj'));
                    if (xcodeprojFiles.length > 0) {
                        return {
                            type: types_1.ProjectType.SWIFT,
                            confidence: AgentConfig_1.AgentConfig.PROJECT_TYPE_CONFIDENCE.FILE_BASED,
                            buildTool: types_1.BuildTool.UNKNOWN
                        };
                    }
                }
                catch (error) {
                    // 디렉토리 읽기 실패 시 무시
                }
            }
            // CMakeLists.txt (C/C++)
            if (fs.existsSync(path.join(projectRoot, 'CMakeLists.txt'))) {
                return {
                    type: types_1.ProjectType.C_CPP,
                    confidence: 0.9,
                    buildTool: types_1.BuildTool.CMAKE
                };
            }
            return null;
        }
        catch (error) {
            console.error('[ProjectDetector] Error detecting project type:', error);
            return null;
        }
    }
    /**
     * 빌드 도구를 감지합니다
     */
    detectBuildTool(projectRoot) {
        if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
            return types_1.BuildTool.NPM;
        }
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
            return types_1.BuildTool.YARN;
        }
        if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
            return types_1.BuildTool.PNPM;
        }
        if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
            return types_1.BuildTool.BUN;
        }
        // package.json이 있으면 기본값으로 npm
        if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
            return types_1.BuildTool.NPM;
        }
        return types_1.BuildTool.UNKNOWN;
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
    detectPackageManager(projectRoot) {
        if (fs.existsSync(path.join(projectRoot, 'bun.lockb')))
            return 'bun';
        if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml')))
            return 'pnpm';
        if (fs.existsSync(path.join(projectRoot, 'yarn.lock')))
            return 'yarn';
        return 'npm';
    }
    /**
     * package.json에 특정 스크립트가 있는지 확인
     */
    hasScript(projectRoot, scriptName) {
        try {
            const pkgPath = path.join(projectRoot, 'package.json');
            if (!fs.existsSync(pkgPath))
                return false;
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return !!(pkg.scripts && pkg.scripts[scriptName]);
        }
        catch {
            return false;
        }
    }
    getValidationCommand(projectType, projectRoot, createdFiles, modifiedFiles) {
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
                if (content.includes('lint:'))
                    return { command: 'make lint', description: 'Make lint' };
                if (content.includes('check:'))
                    return { command: 'make check', description: 'Make check' };
                if (content.includes('test:'))
                    return { command: 'make test', description: 'Make test' };
                if (content.includes('build:'))
                    return { command: 'make build', description: 'Make build' };
            }
            catch {
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
            case types_1.ProjectType.TYPESCRIPT:
            case types_1.ProjectType.REACT:
            case types_1.ProjectType.VUE:
            case types_1.ProjectType.ANGULAR:
            case types_1.ProjectType.NODE:
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
                    if (this.hasScript(projectRoot, 'lint'))
                        return { command: `${pm} run lint`, description: 'NPM Lint 스크립트' };
                    if (this.hasScript(projectRoot, 'type-check'))
                        return { command: `${pm} run type-check`, description: 'Type Check' };
                    if (this.hasScript(projectRoot, 'validate'))
                        return { command: `${pm} run validate`, description: 'Validate 스크립트' };
                    if (this.hasScript(projectRoot, 'build'))
                        return { command: `${pm} run build`, description: 'Build 스크립트' };
                }
                // JavaScript만 있는 경우 npm run build 시도 (package.json에 build 스크립트가 있는 경우)
                return { command: 'npm run build --dry-run 2>/dev/null || echo "No build script"', description: 'Node.js 빌드 검사' };
            case types_1.ProjectType.SPRING_BOOT:
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
            case types_1.ProjectType.PYTHON:
            case types_1.ProjectType.DJANGO:
            case types_1.ProjectType.FLASK:
            case types_1.ProjectType.FASTAPI:
                // =========================================================
                // Python 프로젝트: 린터 → 타입 체커 → 문법 검사 순으로 실행
                // =========================================================
                const pythonFiles = allFiles.filter(f => f.endsWith('.py'));
                if (pythonFiles.length > 0) {
                    const relativePaths = pythonFiles.map(f => path.isAbsolute(f) ? path.relative(projectRoot, f) : f).join(' ');
                    // 1순위: Ruff (매우 빠른 최신 린터 + 포매터)
                    if (fs.existsSync(path.join(projectRoot, 'ruff.toml')) ||
                        fs.existsSync(path.join(projectRoot, '.ruff.toml')) ||
                        fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                        return {
                            command: `ruff check ${relativePaths} && python3 -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Ruff Lint + Python Syntax Check'
                        };
                    }
                    // 2순위: Flake8 (널리 사용되는 린터)
                    if (fs.existsSync(path.join(projectRoot, '.flake8')) ||
                        fs.existsSync(path.join(projectRoot, 'setup.cfg'))) {
                        return {
                            command: `flake8 ${relativePaths} && python3 -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Flake8 Lint + Python Syntax Check'
                        };
                    }
                    // 3순위: Pylint (강력한 린터)
                    if (fs.existsSync(path.join(projectRoot, '.pylintrc')) ||
                        fs.existsSync(path.join(projectRoot, 'pylintrc'))) {
                        return {
                            command: `pylint ${relativePaths} && python3 -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Pylint + Python Syntax Check'
                        };
                    }
                    // 4순위: Mypy (타입 체커)
                    if (fs.existsSync(path.join(projectRoot, 'mypy.ini')) ||
                        fs.existsSync(path.join(projectRoot, '.mypy.ini'))) {
                        return {
                            command: `mypy ${relativePaths} && python3 -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Mypy Type Check + Python Syntax Check'
                        };
                    }
                    // 5순위: Poetry/Pipenv 환경 검사
                    if (fs.existsSync(path.join(projectRoot, 'poetry.lock'))) {
                        return {
                            command: `poetry check && python3 -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Poetry Check + Python Syntax Check'
                        };
                    }
                    if (fs.existsSync(path.join(projectRoot, 'Pipfile'))) {
                        return {
                            command: `pipenv check && python3 -m compileall -q -j 0 ${relativePaths}`,
                            description: 'Pipenv Check + Python Syntax Check'
                        };
                    }
                    // 기본: 문법 검사만 수행
                    return {
                        command: `python3 -m compileall -q -j 0 ${relativePaths}`,
                        description: 'Python Syntax Check'
                    };
                }
                return null;
            case types_1.ProjectType.GO:
                // Go 확장 검증 옵션
                if (fs.existsSync(path.join(projectRoot, 'golangci.yml'))) {
                    return { command: 'golangci-lint run', description: 'GolangCI-Lint' };
                }
                return { command: 'go vet ./...', description: 'Go Vet' };
            case types_1.ProjectType.RUST:
                return { command: 'cargo check', description: 'Rust 컴파일 검사 (cargo check)' };
            case types_1.ProjectType.FLUTTER:
                return { command: 'flutter analyze', description: 'Flutter 정적 분석' };
            case types_1.ProjectType.PHP:
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
            case types_1.ProjectType.CSHARP:
                return { command: 'dotnet build', description: '.NET 빌드 검사' };
            case types_1.ProjectType.RUBY:
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
            case types_1.ProjectType.SWIFT:
                return { command: 'swift build', description: 'Swift 빌드 검사' };
            case types_1.ProjectType.C_CPP:
                return { command: 'cmake -S . -B build && cmake --build build', description: 'C/C++ CMake 빌드 검사' };
            default:
                // =========================================================
                // LEVEL 4: 파일 확장자 기반 Fallback 검증
                // =========================================================
                if (allFiles.length === 0)
                    return null;
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
    getCriticalFiles(projectType, projectRoot) {
        const criticalFiles = [];
        switch (projectType) {
            case types_1.ProjectType.TYPESCRIPT:
            case types_1.ProjectType.REACT:
            case types_1.ProjectType.VUE:
            case types_1.ProjectType.ANGULAR:
            case types_1.ProjectType.NODE:
                criticalFiles.push('package.json');
                if (fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
                    criticalFiles.push('tsconfig.json');
                }
                break;
            case types_1.ProjectType.SPRING_BOOT:
                if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                    criticalFiles.push('pom.xml');
                }
                else {
                    // Gradle
                    if (fs.existsSync(path.join(projectRoot, 'build.gradle'))) {
                        criticalFiles.push('build.gradle');
                    }
                    if (fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
                        criticalFiles.push('build.gradle.kts');
                    }
                }
                break;
            case types_1.ProjectType.PYTHON:
            case types_1.ProjectType.DJANGO:
            case types_1.ProjectType.FLASK:
            case types_1.ProjectType.FASTAPI:
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
            case types_1.ProjectType.GO:
                criticalFiles.push('go.mod');
                break;
            case types_1.ProjectType.RUST:
                criticalFiles.push('Cargo.toml');
                break;
            case types_1.ProjectType.FLUTTER:
                criticalFiles.push('pubspec.yaml');
                break;
            case types_1.ProjectType.PHP:
                criticalFiles.push('composer.json');
                break;
            case types_1.ProjectType.CSHARP:
                // *.csproj 또는 *.sln 파일 찾기
                try {
                    const csprojFiles = fs.readdirSync(projectRoot).filter(f => f.endsWith('.csproj') || f.endsWith('.sln'));
                    if (csprojFiles.length > 0) {
                        criticalFiles.push(csprojFiles[0]);
                    }
                }
                catch (error) {
                    // 디렉토리 읽기 실패 시 무시
                }
                break;
            case types_1.ProjectType.RUBY:
                if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
                    criticalFiles.push('Gemfile');
                }
                break;
            case types_1.ProjectType.SWIFT:
                if (fs.existsSync(path.join(projectRoot, 'Package.swift'))) {
                    criticalFiles.push('Package.swift');
                }
                break;
            case types_1.ProjectType.C_CPP:
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
    async detectWithLLMFallback(projectRoot, llmApi, currentModelType, abortSignal) {
        // LLM이 없으면 null 반환
        if (!llmApi) {
            return null;
        }
        try {
            // 프로젝트 루트의 파일 목록 수집
            let files = [];
            try {
                files = fs.readdirSync(projectRoot).slice(0, 20); // 최대 20개 파일만
            }
            catch (error) {
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
                let projectType = types_1.ProjectType.UNKNOWN;
                let buildTool = types_1.BuildTool.UNKNOWN;
                switch (projectTypeStr) {
                    case 'nodejs':
                        projectType = types_1.ProjectType.NODE;
                        buildTool = types_1.BuildTool.NPM;
                        break;
                    case 'java-maven':
                        projectType = types_1.ProjectType.SPRING_BOOT;
                        buildTool = types_1.BuildTool.MAVEN;
                        break;
                    case 'java-gradle':
                        projectType = types_1.ProjectType.SPRING_BOOT;
                        buildTool = types_1.BuildTool.GRADLE;
                        break;
                    case 'python':
                        projectType = types_1.ProjectType.PYTHON;
                        buildTool = types_1.BuildTool.PIP;
                        break;
                    case 'go':
                        projectType = types_1.ProjectType.GO;
                        buildTool = types_1.BuildTool.GO_MOD;
                        break;
                    case 'rust':
                        projectType = types_1.ProjectType.RUST;
                        buildTool = types_1.BuildTool.CARGO;
                        break;
                    case 'php':
                        projectType = types_1.ProjectType.PHP;
                        buildTool = types_1.BuildTool.COMPOSER;
                        break;
                    case 'dart':
                    case 'flutter':
                        projectType = types_1.ProjectType.FLUTTER;
                        buildTool = types_1.BuildTool.PUB;
                        break;
                    case 'csharp':
                        projectType = types_1.ProjectType.CSHARP;
                        buildTool = types_1.BuildTool.DOTNET;
                        break;
                    case 'ruby':
                        projectType = types_1.ProjectType.RUBY;
                        buildTool = types_1.BuildTool.BUNDLER;
                        break;
                    case 'swift':
                        projectType = types_1.ProjectType.SWIFT;
                        buildTool = types_1.BuildTool.UNKNOWN;
                        break;
                    case 'c-cpp':
                        projectType = types_1.ProjectType.C_CPP;
                        buildTool = types_1.BuildTool.CMAKE;
                        break;
                }
                return {
                    type: projectType,
                    confidence: parsed.confidence || 0.7,
                    buildTool
                };
            }
            return null;
        }
        catch (error) {
            console.error('[ProjectDetector] Error in LLM fallback:', error);
            return null;
        }
    }
}
exports.ProjectDetector = ProjectDetector;
//# sourceMappingURL=ProjectDetector.js.map