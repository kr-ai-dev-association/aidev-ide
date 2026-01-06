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
    public getValidationCommand(
        projectType: ProjectType,
        projectRoot: string,
        createdFiles: string[],
        modifiedFiles: string[]
    ): { command: string; description: string } | null {
        switch (projectType) {
            case ProjectType.TYPESCRIPT:
            case ProjectType.REACT:
            case ProjectType.VUE:
            case ProjectType.ANGULAR:
            case ProjectType.NODE:
                // TypeScript 프로젝트인지 확인
                const hasTypeScript = createdFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) ||
                    modifiedFiles.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) ||
                    fs.existsSync(path.join(projectRoot, 'tsconfig.json'));

                if (hasTypeScript) {
                    return { command: 'tsc --noEmit', description: 'TypeScript 컴파일 검사' };
                }
                // JavaScript만 있는 경우 npm run build 시도 (package.json에 build 스크립트가 있는 경우)
                return { command: 'npm run build --dry-run 2>/dev/null || echo "No build script"', description: 'Node.js 빌드 검사' };

            case ProjectType.SPRING_BOOT:
                // Maven인지 Gradle인지 확인
                if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
                    return { command: 'mvn compile -q', description: 'Maven 컴파일 검사' };
                }
                // Gradle wrapper가 있으면 사용, 없으면 gradle 직접 사용
                const gradleWrapper = process.platform === 'win32'
                    ? path.join(projectRoot, 'gradlew.bat')
                    : path.join(projectRoot, 'gradlew');

                if (fs.existsSync(gradleWrapper)) {
                    return { command: process.platform === 'win32' ? 'gradlew.bat compileJava' : './gradlew compileJava', description: 'Gradle 컴파일 검사' };
                }
                return { command: 'gradle compileJava', description: 'Gradle 컴파일 검사' };

            case ProjectType.PYTHON:
            case ProjectType.DJANGO:
            case ProjectType.FLASK:
            case ProjectType.FASTAPI:
                // 생성/수정된 Python 파일들에 대해 컴파일 검사
                const pythonFiles = [...createdFiles, ...modifiedFiles].filter(f => f.endsWith('.py'));
                if (pythonFiles.length > 0) {
                    // 첫 번째 파일만 검사 (전체 검사는 시간이 오래 걸릴 수 있음)
                    const firstPythonFile = pythonFiles[0];
                    const relativePath = path.isAbsolute(firstPythonFile)
                        ? path.relative(projectRoot, firstPythonFile)
                        : firstPythonFile;
                    return { command: `python -m py_compile ${relativePath}`, description: 'Python 컴파일 검사' };
                }
                return null;

            case ProjectType.GO:
                return { command: 'go build ./...', description: 'Go 빌드 검사' };

            case ProjectType.RUST:
                return { command: 'cargo check', description: 'Rust 컴파일 검사 (cargo check)' };

            case ProjectType.FLUTTER:
                return { command: 'flutter analyze', description: 'Flutter 정적 분석' };

            case ProjectType.PHP:
                // Laravel 프레임워크 확인
                if (fs.existsSync(path.join(projectRoot, 'artisan'))) {
                    return { command: 'php artisan --version', description: 'Laravel 부트스트랩 검사' };
                }
                // composer.json 유효성 검사
                if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
                    return { command: 'composer validate', description: 'Composer 설정 검사' };
                }
                // PHP 파일이 있으면 문법 체크
                const phpFiles = [...createdFiles, ...modifiedFiles].filter(f => f.endsWith('.php'));
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
                // rubocop 설정 파일이 있으면 rubocop 사용
                if (fs.existsSync(path.join(projectRoot, '.rubocop.yml'))) {
                    return { command: 'rubocop', description: 'Ruby 린터 검사 (rubocop)' };
                }
                // bundle check로 의존성 확인
                if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
                    return { command: 'bundle check', description: 'Ruby 의존성 검사' };
                }
                // Ruby 파일이 있으면 문법 체크
                const rubyFiles = [...createdFiles, ...modifiedFiles].filter(f => f.endsWith('.rb'));
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

