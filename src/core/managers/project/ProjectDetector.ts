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

            // build.gradle (Java Gradle)
            if (fs.existsSync(path.join(projectRoot, 'build.gradle'))) {
                return {
                    type: ProjectType.SPRING_BOOT,
                    confidence: 0.9,
                    buildTool: BuildTool.GRADLE
                };
            }

            // requirements.txt, pyproject.toml (Python)
            if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
                fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
                
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

            // pubspec.yaml (Flutter)
            if (fs.existsSync(path.join(projectRoot, 'pubspec.yaml'))) {
                return {
                    type: ProjectType.FLUTTER,
                    confidence: 0.95,
                    buildTool: BuildTool.PUB
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
}

