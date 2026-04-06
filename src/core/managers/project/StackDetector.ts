/**
 * Stack Detector
 * 프로젝트의 세부 기술 스택을 감지하는 클래스
 *
 * v9.2.1: 프레임워크별 세부 스택 감지
 * v9.2.5: project/ 디렉토리로 이동
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectType } from './types';
import {
    DetailedStack,
    StackInfo,
    VersionInfo,
    CompatibilityIssue,
    AndroidStack,
    ReactStack,
    FlutterStack,
    SpringStack,
    PythonStack,
} from './stackTypes';

export class StackDetector {
    /**
     * 프로젝트의 세부 스택 감지
     */
    public async detectDetailedStack(
        projectRoot: string,
        projectType: ProjectType
    ): Promise<DetailedStack> {
        console.log(`[StackDetector] Detecting detailed stack for ${projectType} at ${projectRoot}`);

        const result: DetailedStack = {
            projectType,
            stacks: [],
            versions: {},
            potentialIssues: [],
        };

        try {
            switch (projectType) {
                case ProjectType.ANDROID:
                    await this.detectAndroidStack(projectRoot, result);
                    break;
                case ProjectType.REACT:
                    await this.detectReactStack(projectRoot, result);
                    break;
                case ProjectType.FLUTTER:
                    await this.detectFlutterStack(projectRoot, result);
                    break;
                case ProjectType.SPRING_BOOT:
                case ProjectType.JAVA:
                    await this.detectSpringStack(projectRoot, result);
                    break;
                case ProjectType.PYTHON:
                case ProjectType.DJANGO:
                case ProjectType.FASTAPI:
                case ProjectType.FLASK:
                    await this.detectPythonStack(projectRoot, result);
                    break;
                case ProjectType.VUE:
                    await this.detectVueStack(projectRoot, result);
                    break;
                case ProjectType.GO:
                    await this.detectGoStack(projectRoot, result);
                    break;
                case ProjectType.RUST:
                    await this.detectRustStack(projectRoot, result);
                    break;
                case ProjectType.CSHARP:
                    await this.detectCsharpStack(projectRoot, result);
                    break;
                case ProjectType.NEXTJS:
                    await this.detectReactStack(projectRoot, result);
                    break;
                case ProjectType.NUXTJS:
                    await this.detectVueStack(projectRoot, result);
                    break;
                case ProjectType.SVELTE:
                    await this.detectWebStack(projectRoot, result, 'svelte');
                    break;
                case ProjectType.ANGULAR:
                    await this.detectWebStack(projectRoot, result, 'angular');
                    break;
                case ProjectType.PHP:
                    await this.detectPhpStack(projectRoot, result);
                    break;
                case ProjectType.RUBY:
                    await this.detectRubyStack(projectRoot, result);
                    break;
                case ProjectType.SWIFT:
                    await this.detectSwiftStack(projectRoot, result);
                    break;
                case ProjectType.KOTLIN:
                    await this.detectKotlinStack(projectRoot, result);
                    break;
                case ProjectType.ELIXIR:
                    await this.detectElixirStack(projectRoot, result);
                    break;
                case ProjectType.SCALA:
                    await this.detectScalaStack(projectRoot, result);
                    break;
                default:
                    // 기본 Node.js/TypeScript 스택 감지
                    await this.detectNodeStack(projectRoot, result);
            }
        } catch (error) {
            console.error('[StackDetector] Error detecting stack:', error);
        }

        return result;
    }

    /**
     * 스택 정보를 요약 문자열로 변환
     */
    public formatStackSummary(detailedStack: DetailedStack): string {
        const parts: string[] = [];

        // 프로젝트 타입
        parts.push(`프로젝트: ${detailedStack.projectType}`);

        // 언어/프레임워크 버전
        if (detailedStack.versions.language) {
            parts.push(`언어: ${detailedStack.versions.language}`);
        }
        if (detailedStack.versions.framework) {
            parts.push(`프레임워크: ${detailedStack.versions.framework}`);
        }

        // 감지된 스택
        if (detailedStack.stacks.length > 0) {
            const stackNames = detailedStack.stacks
                .filter(s => s.confidence >= 0.8)
                .map(s => s.version ? `${s.name} ${s.version}` : s.name);
            if (stackNames.length > 0) {
                parts.push(`스택: ${stackNames.join(', ')}`);
            }
        }

        return parts.join(' | ');
    }

    // ==================== Android Stack Detection ====================

    private async detectAndroidStack(projectRoot: string, result: DetailedStack): Promise<void> {
        // build.gradle 또는 build.gradle.kts 읽기
        const gradleFiles = [
            path.join(projectRoot, 'build.gradle.kts'),
            path.join(projectRoot, 'build.gradle'),
            path.join(projectRoot, 'app', 'build.gradle.kts'),
            path.join(projectRoot, 'app', 'build.gradle'),
        ];

        let gradleContent = '';
        let versionCatalogContent = '';

        for (const file of gradleFiles) {
            if (fs.existsSync(file)) {
                gradleContent += fs.readFileSync(file, 'utf8') + '\n';
            }
        }

        // libs.versions.toml 읽기 (버전 카탈로그)
        const versionCatalogPath = path.join(projectRoot, 'gradle', 'libs.versions.toml');
        if (fs.existsSync(versionCatalogPath)) {
            versionCatalogContent = fs.readFileSync(versionCatalogPath, 'utf8');
        }

        const combinedContent = gradleContent + '\n' + versionCatalogContent;

        // Kotlin 버전 감지
        const kotlinVersion = this.extractVersion(combinedContent, [
            /kotlin\s*=\s*["']([^"']+)["']/i,
            /org\.jetbrains\.kotlin.*version\s*["']([^"']+)["']/i,
            /kotlin\("jvm"\)\s*version\s*["']([^"']+)["']/i,
            /kotlinVersion\s*=\s*["']([^"']+)["']/i,
        ]);
        if (kotlinVersion) {
            result.versions.kotlin = kotlinVersion;
            result.versions.language = `Kotlin ${kotlinVersion}`;
        }

        // Compose 감지
        if (this.containsAny(combinedContent, [
            'compose', 'Compose', 'androidx.compose',
            'compose-bom', 'compose.ui', 'compose.material'
        ])) {
            const composeVersion = this.extractVersion(combinedContent, [
                /composeBom\s*=\s*["']([^"']+)["']/i,
                /compose-bom:([^"']+)["']/i,
                /composeVersion\s*=\s*["']([^"']+)["']/i,
                /compose\.version\s*=\s*["']([^"']+)["']/i,
            ]);

            result.stacks.push({
                name: AndroidStack.COMPOSE,
                confidence: 0.95,
                evidence: ['Compose dependencies found in gradle files'],
                version: composeVersion,
            });

            // Compose 컴파일러 버전 (Kotlin 2.0+에서는 Kotlin 버전과 동일)
            const composeCompilerVersion = this.extractVersion(combinedContent, [
                /composeCompiler\s*=\s*["']([^"']+)["']/i,
                /compose\.compiler\.version\s*=\s*["']([^"']+)["']/i,
            ]);
            if (composeCompilerVersion) {
                result.versions.composeCompiler = composeCompilerVersion;
            }

            // Kotlin 2.0+ 에서는 Compose Compiler가 Kotlin에 내장
            if (kotlinVersion && this.compareVersions(kotlinVersion, '2.0.0') >= 0) {
                result.versions.composeCompiler = kotlinVersion;
            }
        }

        // KSP 감지
        if (this.containsAny(combinedContent, ['com.google.devtools.ksp', 'ksp(', 'ksp {'])) {
            const kspVersion = this.extractVersion(combinedContent, [
                /ksp\s*=\s*["']([^"']+)["']/i,
                /com\.google\.devtools\.ksp.*:([^"']+)["']/i,
                /kspVersion\s*=\s*["']([^"']+)["']/i,
            ]);

            result.stacks.push({
                name: AndroidStack.KSP,
                confidence: 0.95,
                evidence: ['KSP plugin found in gradle files'],
                version: kspVersion,
            });

            // KSP 버전 호환성 체크 (KSP 버전은 Kotlin 버전을 포함해야 함)
            if (kspVersion && kotlinVersion) {
                // KSP 버전 형식: 2.1.21-2.0.1 (Kotlin버전-KSP버전)
                if (!kspVersion.startsWith(kotlinVersion)) {
                    const kspKotlinPart = kspVersion.split('-')[0];
                    if (kspKotlinPart !== kotlinVersion) {
                        result.potentialIssues.push({
                            severity: 'error',
                            description: `KSP 버전(${kspVersion})이 Kotlin 버전(${kotlinVersion})과 호환되지 않을 수 있습니다. KSP 버전은 "${kotlinVersion}-x.x.x" 형식이어야 합니다.`,
                            relatedStacks: [AndroidStack.KSP],
                            recommendation: `KSP 버전을 "${kotlinVersion}-x.x.x" 형식으로 업데이트하세요. (예: ${kotlinVersion}-1.0.31)`,
                        });
                    }
                }
            }
        }

        // Room 감지
        if (this.containsAny(combinedContent, ['androidx.room', 'room-runtime', 'room-compiler', 'room-ktx'])) {
            const roomVersion = this.extractVersion(combinedContent, [
                /room\s*=\s*["']([^"']+)["']/i,
                /roomVersion\s*=\s*["']([^"']+)["']/i,
                /androidx\.room:room-runtime:([^"']+)["']/i,
            ]);

            result.stacks.push({
                name: AndroidStack.ROOM,
                confidence: 0.95,
                evidence: ['Room dependencies found'],
                version: roomVersion,
            });
        }

        // Hilt 감지
        if (this.containsAny(combinedContent, ['dagger.hilt', 'hilt-android', 'hilt-compiler'])) {
            const hiltVersion = this.extractVersion(combinedContent, [
                /hilt\s*=\s*["']([^"']+)["']/i,
                /hiltVersion\s*=\s*["']([^"']+)["']/i,
            ]);

            result.stacks.push({
                name: AndroidStack.HILT,
                confidence: 0.95,
                evidence: ['Hilt dependencies found'],
                version: hiltVersion,
            });
        }

        // Navigation Compose 감지
        if (this.containsAny(combinedContent, ['navigation-compose', 'androidx.navigation.compose'])) {
            result.stacks.push({
                name: AndroidStack.NAVIGATION,
                confidence: 0.9,
                evidence: ['Navigation Compose found'],
            });
        }

        // Kotlin Serialization 감지
        if (this.containsAny(combinedContent, ['kotlinx.serialization', 'kotlinx-serialization'])) {
            result.stacks.push({
                name: AndroidStack.KOTLIN_SERIALIZATION,
                confidence: 0.9,
                evidence: ['Kotlin Serialization found'],
            });
        }

        // Coroutines 감지
        if (this.containsAny(combinedContent, ['kotlinx.coroutines', 'kotlinx-coroutines'])) {
            result.stacks.push({
                name: AndroidStack.COROUTINES,
                confidence: 0.9,
                evidence: ['Kotlin Coroutines found'],
            });
        }
    }

    // ==================== React Stack Detection ====================

    private async detectReactStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) return;

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };

        // React 버전
        const reactVersion = allDeps.react?.replace(/[\^~]/g, '');
        if (reactVersion) {
            result.versions.react = reactVersion;
            result.versions.framework = `React ${reactVersion}`;
        }

        // Next.js 감지
        if (allDeps.next) {
            const nextVersion = allDeps.next.replace(/[\^~]/g, '');
            result.versions.nextjs = nextVersion;

            // App Router vs Pages Router 감지
            const hasAppDir = fs.existsSync(path.join(projectRoot, 'app'));
            const hasPagesDir = fs.existsSync(path.join(projectRoot, 'pages')) ||
                               fs.existsSync(path.join(projectRoot, 'src', 'pages'));

            if (hasAppDir) {
                result.stacks.push({
                    name: ReactStack.NEXTJS_APP_ROUTER,
                    confidence: 0.95,
                    evidence: ['app/ directory found', `Next.js ${nextVersion}`],
                    version: nextVersion,
                });

                // Next.js 15+ App Router는 React 19 필요
                if (this.compareVersions(nextVersion, '15.0.0') >= 0 && reactVersion) {
                    if (this.compareVersions(reactVersion, '19.0.0') < 0) {
                        result.potentialIssues.push({
                            severity: 'warning',
                            description: `Next.js ${nextVersion} App Router는 React 19를 권장합니다. 현재 React ${reactVersion}을 사용 중입니다.`,
                            relatedStacks: [ReactStack.NEXTJS_APP_ROUTER],
                            recommendation: 'React 19로 업그레이드를 고려하세요.',
                        });
                    }
                }
            } else if (hasPagesDir) {
                result.stacks.push({
                    name: ReactStack.NEXTJS_PAGES_ROUTER,
                    confidence: 0.95,
                    evidence: ['pages/ directory found', `Next.js ${nextVersion}`],
                    version: nextVersion,
                });
            } else {
                result.stacks.push({
                    name: ReactStack.NEXTJS,
                    confidence: 0.8,
                    evidence: [`Next.js ${nextVersion} dependency found`],
                    version: nextVersion,
                });
            }
        }

        // Vite 감지
        if (allDeps.vite) {
            result.stacks.push({
                name: ReactStack.VITE,
                confidence: 0.95,
                evidence: ['Vite dependency found'],
                version: allDeps.vite.replace(/[\^~]/g, ''),
            });
        }

        // TypeScript 감지
        if (allDeps.typescript) {
            result.stacks.push({
                name: ReactStack.TYPESCRIPT,
                confidence: 0.95,
                evidence: ['TypeScript dependency found'],
                version: allDeps.typescript.replace(/[\^~]/g, ''),
            });
            result.versions.typescript = allDeps.typescript.replace(/[\^~]/g, '');
        }

        // TanStack Query 감지
        if (allDeps['@tanstack/react-query']) {
            result.stacks.push({
                name: ReactStack.TANSTACK_QUERY,
                confidence: 0.95,
                evidence: ['TanStack Query found'],
                version: allDeps['@tanstack/react-query'].replace(/[\^~]/g, ''),
            });
        }

        // Zustand 감지
        if (allDeps.zustand) {
            result.stacks.push({
                name: ReactStack.ZUSTAND,
                confidence: 0.95,
                evidence: ['Zustand found'],
            });
        }

        // Redux 감지
        if (allDeps['@reduxjs/toolkit'] || allDeps.redux) {
            result.stacks.push({
                name: ReactStack.REDUX,
                confidence: 0.95,
                evidence: ['Redux found'],
            });
        }

        // Tailwind 감지
        if (allDeps.tailwindcss) {
            result.stacks.push({
                name: ReactStack.TAILWIND,
                confidence: 0.95,
                evidence: ['Tailwind CSS found'],
            });
        }

        // Styled Components 감지
        if (allDeps['styled-components']) {
            result.stacks.push({
                name: ReactStack.STYLED_COMPONENTS,
                confidence: 0.95,
                evidence: ['Styled Components found'],
            });
        }

        // Emotion 감지
        if (allDeps['@emotion/react'] || allDeps['@emotion/styled']) {
            result.stacks.push({
                name: ReactStack.EMOTION,
                confidence: 0.95,
                evidence: ['Emotion found'],
            });
        }
    }

    // ==================== Flutter Stack Detection ====================

    private async detectFlutterStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
        if (!fs.existsSync(pubspecPath)) return;

        const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');

        // Flutter SDK 버전 감지
        const flutterVersionMatch = pubspecContent.match(/flutter:\s*["']?>=?\s*([^\s"']+)/);
        if (flutterVersionMatch) {
            result.versions.flutter = flutterVersionMatch[1];
            result.versions.framework = `Flutter ${flutterVersionMatch[1]}`;
        }

        // Dart SDK 버전 감지
        const dartVersionMatch = pubspecContent.match(/sdk:\s*["']?>=?\s*([^\s"'<]+)/);
        if (dartVersionMatch) {
            result.versions.dart = dartVersionMatch[1];
            result.versions.language = `Dart ${dartVersionMatch[1]}`;
        }

        // Riverpod 감지
        if (pubspecContent.includes('riverpod') || pubspecContent.includes('flutter_riverpod')) {
            result.stacks.push({
                name: FlutterStack.RIVERPOD,
                confidence: 0.95,
                evidence: ['Riverpod dependency found'],
            });
        }

        // BLoC 감지
        if (pubspecContent.includes('flutter_bloc') || pubspecContent.includes('bloc:')) {
            result.stacks.push({
                name: FlutterStack.BLOC,
                confidence: 0.95,
                evidence: ['BLoC dependency found'],
            });
        }

        // Provider 감지
        if (pubspecContent.includes('provider:')) {
            result.stacks.push({
                name: FlutterStack.PROVIDER,
                confidence: 0.9,
                evidence: ['Provider dependency found'],
            });
        }

        // GetX 감지
        if (pubspecContent.includes('get:') || pubspecContent.includes('get_it:')) {
            result.stacks.push({
                name: FlutterStack.GETX,
                confidence: 0.9,
                evidence: ['GetX dependency found'],
            });
        }

        // Freezed 감지
        if (pubspecContent.includes('freezed:') || pubspecContent.includes('freezed_annotation:')) {
            result.stacks.push({
                name: FlutterStack.FREEZED,
                confidence: 0.95,
                evidence: ['Freezed dependency found'],
            });
        }

        // JSON Serializable 감지
        if (pubspecContent.includes('json_serializable:') || pubspecContent.includes('json_annotation:')) {
            result.stacks.push({
                name: FlutterStack.JSON_SERIALIZABLE,
                confidence: 0.95,
                evidence: ['JSON Serializable found'],
            });
        }

        // go_router 감지
        if (pubspecContent.includes('go_router:')) {
            result.stacks.push({
                name: FlutterStack.GO_ROUTER,
                confidence: 0.95,
                evidence: ['go_router dependency found'],
            });
        }

        // Firebase 감지
        if (pubspecContent.includes('firebase_core:') || pubspecContent.includes('firebase_')) {
            result.stacks.push({
                name: FlutterStack.FIREBASE,
                confidence: 0.95,
                evidence: ['Firebase dependency found'],
            });
        }
    }

    // ==================== Spring Boot Stack Detection ====================

    private async detectSpringStack(projectRoot: string, result: DetailedStack): Promise<void> {
        // build.gradle 또는 pom.xml 읽기
        const gradlePath = path.join(projectRoot, 'build.gradle.kts');
        const gradlePath2 = path.join(projectRoot, 'build.gradle');
        const pomPath = path.join(projectRoot, 'pom.xml');

        let content = '';

        if (fs.existsSync(gradlePath)) {
            content = fs.readFileSync(gradlePath, 'utf8');
        } else if (fs.existsSync(gradlePath2)) {
            content = fs.readFileSync(gradlePath2, 'utf8');
        } else if (fs.existsSync(pomPath)) {
            content = fs.readFileSync(pomPath, 'utf8');
        }

        // Kotlin 사용 여부
        if (content.includes('kotlin') || fs.existsSync(path.join(projectRoot, 'src', 'main', 'kotlin'))) {
            result.stacks.push({
                name: SpringStack.KOTLIN,
                confidence: 0.95,
                evidence: ['Kotlin sources found'],
            });
        }

        // Spring Data JPA
        if (content.includes('spring-data-jpa') || content.includes('spring-boot-starter-data-jpa')) {
            result.stacks.push({
                name: SpringStack.SPRING_DATA_JPA,
                confidence: 0.95,
                evidence: ['Spring Data JPA found'],
            });
        }

        // Spring Security
        if (content.includes('spring-security') || content.includes('spring-boot-starter-security')) {
            result.stacks.push({
                name: SpringStack.SPRING_SECURITY,
                confidence: 0.95,
                evidence: ['Spring Security found'],
            });
        }

        // WebFlux
        if (content.includes('spring-webflux') || content.includes('spring-boot-starter-webflux')) {
            result.stacks.push({
                name: SpringStack.SPRING_WEBFLUX,
                confidence: 0.95,
                evidence: ['Spring WebFlux found'],
            });
        }

        // QueryDSL
        if (content.includes('querydsl')) {
            result.stacks.push({
                name: SpringStack.QUERYDSL,
                confidence: 0.95,
                evidence: ['QueryDSL found'],
            });
        }

        // MyBatis
        if (content.includes('mybatis')) {
            result.stacks.push({
                name: SpringStack.MYBATIS,
                confidence: 0.95,
                evidence: ['MyBatis found'],
            });
        }
    }

    // ==================== Python Stack Detection ====================

    private async detectPythonStack(projectRoot: string, result: DetailedStack): Promise<void> {
        // requirements.txt, pyproject.toml 확인
        const requirementsPath = path.join(projectRoot, 'requirements.txt');
        const pyprojectPath = path.join(projectRoot, 'pyproject.toml');

        let content = '';

        if (fs.existsSync(requirementsPath)) {
            content += fs.readFileSync(requirementsPath, 'utf8');
        }
        if (fs.existsSync(pyprojectPath)) {
            content += fs.readFileSync(pyprojectPath, 'utf8');
        }

        // Django
        if (content.toLowerCase().includes('django')) {
            result.stacks.push({
                name: PythonStack.DJANGO,
                confidence: 0.95,
                evidence: ['Django found in dependencies'],
            });
        }

        // FastAPI
        if (content.toLowerCase().includes('fastapi')) {
            result.stacks.push({
                name: PythonStack.FASTAPI,
                confidence: 0.95,
                evidence: ['FastAPI found in dependencies'],
            });
        }

        // Flask
        if (content.toLowerCase().includes('flask')) {
            result.stacks.push({
                name: PythonStack.FLASK,
                confidence: 0.95,
                evidence: ['Flask found in dependencies'],
            });
        }

        // Pydantic
        if (content.toLowerCase().includes('pydantic')) {
            result.stacks.push({
                name: PythonStack.PYDANTIC,
                confidence: 0.95,
                evidence: ['Pydantic found'],
            });
        }

        // SQLAlchemy
        if (content.toLowerCase().includes('sqlalchemy')) {
            result.stacks.push({
                name: PythonStack.SQLALCHEMY,
                confidence: 0.95,
                evidence: ['SQLAlchemy found'],
            });
        }

        // PyTorch
        if (content.toLowerCase().includes('torch') || content.toLowerCase().includes('pytorch')) {
            result.stacks.push({
                name: PythonStack.PYTORCH,
                confidence: 0.95,
                evidence: ['PyTorch found'],
            });
        }

        // Poetry 사용 여부
        if (fs.existsSync(path.join(projectRoot, 'poetry.lock'))) {
            result.stacks.push({
                name: PythonStack.POETRY,
                confidence: 0.95,
                evidence: ['poetry.lock found'],
            });
        }

        // uv 사용 여부
        if (fs.existsSync(path.join(projectRoot, 'uv.lock'))) {
            result.stacks.push({
                name: PythonStack.UV,
                confidence: 0.95,
                evidence: ['uv.lock found'],
            });
        }
    }

    // ==================== Vue Stack Detection ====================

    private async detectVueStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) return;

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };

        // Vue 버전
        const vueVersion = allDeps.vue?.replace(/[\^~]/g, '');
        if (vueVersion) {
            result.versions.vue = vueVersion;
            result.versions.framework = `Vue ${vueVersion}`;
        }

        // Nuxt 감지
        if (allDeps.nuxt) {
            result.stacks.push({
                name: 'nuxt',
                confidence: 0.95,
                evidence: ['Nuxt dependency found'],
                version: allDeps.nuxt.replace(/[\^~]/g, ''),
            });
        }

        // Pinia 감지
        if (allDeps.pinia) {
            result.stacks.push({
                name: 'pinia',
                confidence: 0.95,
                evidence: ['Pinia found'],
            });
        }

        // Vuex 감지
        if (allDeps.vuex) {
            result.stacks.push({
                name: 'vuex',
                confidence: 0.95,
                evidence: ['Vuex found'],
            });
        }
    }

    // ==================== Node.js Stack Detection ====================

    private async detectNodeStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) return;

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const allDeps = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };

        // TypeScript
        if (allDeps.typescript) {
            result.stacks.push({
                name: 'typescript',
                confidence: 0.95,
                evidence: ['TypeScript found'],
                version: allDeps.typescript.replace(/[\^~]/g, ''),
            });
        }

        // Express
        if (allDeps.express) {
            result.stacks.push({
                name: 'express',
                confidence: 0.95,
                evidence: ['Express found'],
            });
        }

        // NestJS
        if (allDeps['@nestjs/core']) {
            result.stacks.push({
                name: 'nestjs',
                confidence: 0.95,
                evidence: ['NestJS found'],
            });
        }
    }

    // ==================== Go Stack Detection ====================

    private async detectGoStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const goModPath = path.join(projectRoot, 'go.mod');
        if (!fs.existsSync(goModPath)) return;

        const goMod = fs.readFileSync(goModPath, 'utf-8');

        const goVersionMatch = goMod.match(/^go\s+(\d+\.\d+(?:\.\d+)?)/m);
        if (goVersionMatch) {
            result.versions.language = goVersionMatch[1];
            result.stacks.push({
                name: `go ${goVersionMatch[1]}`,
                confidence: 0.95,
                evidence: [`go.mod: go ${goVersionMatch[1]}`],
                version: goVersionMatch[1],
            });
        }

        if (goMod.includes('github.com/gin-gonic/gin')) {
            const ver = goMod.match(/github\.com\/gin-gonic\/gin\s+(v[\d.]+)/)?.[1];
            result.stacks.push({ name: 'gin', confidence: 0.95, evidence: ['Gin web framework'], version: ver });
            result.versions.framework = `gin ${ver || ''}`.trim();
        }
        if (goMod.includes('github.com/labstack/echo')) {
            const ver = goMod.match(/github\.com\/labstack\/echo[\/\w]*\s+(v[\d.]+)/)?.[1];
            result.stacks.push({ name: 'echo', confidence: 0.95, evidence: ['Echo web framework'], version: ver });
        }
        if (goMod.includes('github.com/gofiber/fiber')) {
            const ver = goMod.match(/github\.com\/gofiber\/fiber[\/\w]*\s+(v[\d.]+)/)?.[1];
            result.stacks.push({ name: 'fiber', confidence: 0.95, evidence: ['Fiber web framework'], version: ver });
        }
        if (goMod.includes('github.com/gorilla/mux')) {
            result.stacks.push({ name: 'gorilla/mux', confidence: 0.9, evidence: ['Gorilla Mux router'] });
        }
        if (goMod.includes('gorm.io/gorm')) {
            result.stacks.push({ name: 'gorm', confidence: 0.9, evidence: ['GORM ORM'] });
        }
        if (goMod.includes('github.com/jmoiron/sqlx')) {
            result.stacks.push({ name: 'sqlx', confidence: 0.9, evidence: ['sqlx database library'] });
        }
        if (goMod.includes('entgo.io/ent')) {
            result.stacks.push({ name: 'ent', confidence: 0.9, evidence: ['Ent ORM'] });
        }

        const goWorkPath = path.join(projectRoot, 'go.work');
        if (fs.existsSync(goWorkPath)) {
            result.stacks.push({ name: 'go-workspace', confidence: 0.95, evidence: ['go.work: Go workspace (monorepo)'] });
        }
    }

    // ==================== Rust Stack Detection ====================

    private async detectRustStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const cargoPath = path.join(projectRoot, 'Cargo.toml');
        if (!fs.existsSync(cargoPath)) return;

        const cargoToml = fs.readFileSync(cargoPath, 'utf-8');

        const editionMatch = cargoToml.match(/edition\s*=\s*"(\d{4})"/);
        if (editionMatch) {
            result.versions.language = `rust edition ${editionMatch[1]}`;
            result.stacks.push({
                name: `rust-${editionMatch[1]}`,
                confidence: 0.95,
                evidence: [`Cargo.toml: edition = "${editionMatch[1]}"`],
                version: editionMatch[1],
            });
        }

        if (cargoToml.includes('[workspace]')) {
            const membersMatch = cargoToml.match(/members\s*=\s*\[([\s\S]*?)\]/);
            const memberCount = membersMatch ? (membersMatch[1].match(/"/g) || []).length / 2 : 0;
            result.stacks.push({
                name: 'cargo-workspace',
                confidence: 0.95,
                evidence: [`Cargo.toml: [workspace] with ${memberCount} members`],
            });
        }

        if (cargoToml.includes('actix-web')) {
            const ver = cargoToml.match(/actix-web\s*=\s*"([^"]+)"/)?.[1];
            result.stacks.push({ name: 'actix-web', confidence: 0.95, evidence: ['Actix Web framework'], version: ver });
            result.versions.framework = `actix-web ${ver || ''}`.trim();
        }
        if (cargoToml.includes('axum')) {
            const ver = cargoToml.match(/axum\s*=\s*"([^"]+)"/)?.[1];
            result.stacks.push({ name: 'axum', confidence: 0.95, evidence: ['Axum web framework'], version: ver });
            result.versions.framework = `axum ${ver || ''}`.trim();
        }
        if (cargoToml.includes('rocket')) {
            const ver = cargoToml.match(/rocket\s*=\s*"([^"]+)"/)?.[1];
            result.stacks.push({ name: 'rocket', confidence: 0.95, evidence: ['Rocket web framework'], version: ver });
        }
        if (cargoToml.includes('warp')) {
            result.stacks.push({ name: 'warp', confidence: 0.9, evidence: ['Warp web framework'] });
        }
        if (cargoToml.includes('diesel')) {
            result.stacks.push({ name: 'diesel', confidence: 0.9, evidence: ['Diesel ORM'] });
        }
        if (cargoToml.includes('sqlx')) {
            result.stacks.push({ name: 'sqlx', confidence: 0.9, evidence: ['SQLx async database'] });
        }
        if (cargoToml.includes('sea-orm')) {
            result.stacks.push({ name: 'sea-orm', confidence: 0.9, evidence: ['SeaORM'] });
        }
        if (cargoToml.includes('tokio')) {
            result.stacks.push({ name: 'tokio', confidence: 0.9, evidence: ['Tokio async runtime'] });
        }
        if (cargoToml.includes('serde')) {
            result.stacks.push({ name: 'serde', confidence: 0.85, evidence: ['Serde serialization'] });
        }
    }

    // ==================== Helper Methods ====================

    private containsAny(content: string, patterns: string[]): boolean {
        return patterns.some(pattern => content.includes(pattern));
    }

    private extractVersion(content: string, patterns: RegExp[]): string | undefined {
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return undefined;
    }

    /**
     * 버전 비교 (semver 간소화)
     * @returns 양수: a > b, 음수: a < b, 0: a === b
     */
    private compareVersions(a: string, b: string): number {
        const partsA = a.split('.').map(Number);
        const partsB = b.split('.').map(Number);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA !== numB) {
                return numA - numB;
            }
        }
        return 0;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // C# / .NET Stack Detection
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private async detectCsharpStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const csprojFiles: string[] = [];
        try {
            const findCsproj = (dir: string, depth: number = 0) => {
                if (depth > 3) return;
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name === 'bin' || entry.name === 'obj' || entry.name === 'node_modules') continue;
                    if (entry.isFile() && entry.name.endsWith('.csproj')) {
                        csprojFiles.push(path.join(dir, entry.name));
                    } else if (entry.isDirectory() && depth < 3) {
                        findCsproj(path.join(dir, entry.name), depth + 1);
                    }
                }
            };
            findCsproj(projectRoot);
        } catch { /* skip */ }

        if (csprojFiles.length === 0) return;

        for (const csprojPath of csprojFiles.slice(0, 5)) {
            try {
                const content = fs.readFileSync(csprojPath, 'utf-8');
                const fileName = path.basename(csprojPath);

                const tfmMatch = content.match(/<TargetFramework>(.*?)<\/TargetFramework>/);
                if (tfmMatch) {
                    result.versions.framework = tfmMatch[1];
                    result.stacks.push({ name: `.NET ${tfmMatch[1]}`, confidence: 0.95, evidence: [`${fileName}: TargetFramework=${tfmMatch[1]}`], version: tfmMatch[1] });
                }

                if (content.includes('Microsoft.AspNetCore') || content.includes('<Project Sdk="Microsoft.NET.Sdk.Web">')) {
                    result.stacks.push({ name: 'ASP.NET Core', confidence: 0.9, evidence: [`${fileName}: ASP.NET Core Web SDK`] });
                }

                const efMatch = content.match(/Microsoft\.EntityFrameworkCore["']?\s*Version="([^"]+)"/);
                if (efMatch || content.includes('Microsoft.EntityFrameworkCore')) {
                    result.stacks.push({ name: 'Entity Framework Core', confidence: 0.9, evidence: [`${fileName}: EF Core ${efMatch?.[1] || ''}`.trim()], version: efMatch?.[1] });
                }

                if (content.includes('Microsoft.AspNetCore.Components') || content.includes('Sdk.BlazorWebAssembly')) {
                    result.stacks.push({ name: 'Blazor', confidence: 0.85, evidence: [`${fileName}: Blazor components`] });
                }
                if (content.includes('Microsoft.AspNetCore.SignalR')) {
                    result.stacks.push({ name: 'SignalR', confidence: 0.85, evidence: [`${fileName}: SignalR`] });
                }
                if (content.includes('xunit') || content.includes('Xunit')) {
                    result.stacks.push({ name: 'xUnit', confidence: 0.9, evidence: [`${fileName}: xUnit`] });
                }
                if (content.includes('NUnit')) {
                    result.stacks.push({ name: 'NUnit', confidence: 0.9, evidence: [`${fileName}: NUnit`] });
                }
                if (content.includes('MSTest') || content.includes('Microsoft.VisualStudio.TestTools')) {
                    result.stacks.push({ name: 'MSTest', confidence: 0.9, evidence: [`${fileName}: MSTest`] });
                }
                if (content.includes('Dapper')) {
                    result.stacks.push({ name: 'Dapper', confidence: 0.85, evidence: [`${fileName}: Dapper`] });
                }
                if (content.includes('MediatR')) {
                    result.stacks.push({ name: 'MediatR', confidence: 0.85, evidence: [`${fileName}: MediatR`] });
                }
                if (content.includes('AutoMapper')) {
                    result.stacks.push({ name: 'AutoMapper', confidence: 0.85, evidence: [`${fileName}: AutoMapper`] });
                }
                if (content.includes('Serilog')) {
                    result.stacks.push({ name: 'Serilog', confidence: 0.85, evidence: [`${fileName}: Serilog`] });
                }
                if (content.includes('Swashbuckle') || content.includes('NSwag')) {
                    result.stacks.push({ name: 'Swagger/OpenAPI', confidence: 0.85, evidence: [`${fileName}: Swagger`] });
                }
            } catch { /* skip */ }
        }

        const seen = new Set<string>();
        result.stacks = result.stacks.filter(s => {
            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
        });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Web Framework Stack Detection (Svelte, Angular 등)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private async detectWebStack(projectRoot: string, result: DetailedStack, framework: string): Promise<void> {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (!fs.existsSync(packageJsonPath)) return;

        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

            if (framework === 'svelte') {
                const ver = allDeps.svelte?.replace(/[\^~]/g, '');
                if (ver) { result.versions.framework = `Svelte ${ver}`; }
                if (allDeps['@sveltejs/kit']) result.stacks.push({ name: 'SvelteKit', confidence: 0.95, evidence: ['@sveltejs/kit dependency'] });
                if (allDeps['svelte-routing']) result.stacks.push({ name: 'svelte-routing', confidence: 0.85, evidence: ['svelte-routing dependency'] });
            }

            if (framework === 'angular') {
                const ver = allDeps['@angular/core']?.replace(/[\^~]/g, '');
                if (ver) { result.versions.framework = `Angular ${ver}`; }
                if (allDeps['@angular/material']) result.stacks.push({ name: 'Angular Material', confidence: 0.9, evidence: ['@angular/material dependency'] });
                if (allDeps['@ngrx/store']) result.stacks.push({ name: 'NgRx', confidence: 0.85, evidence: ['@ngrx/store dependency'] });
                if (allDeps['@angular/fire']) result.stacks.push({ name: 'AngularFire', confidence: 0.85, evidence: ['@angular/fire dependency'] });
                if (allDeps.rxjs) result.stacks.push({ name: 'RxJS', confidence: 0.8, evidence: ['rxjs dependency'] });
            }

            if (allDeps.vitest) result.stacks.push({ name: 'Vitest', confidence: 0.85, evidence: ['vitest dependency'] });
            if (allDeps.jest) result.stacks.push({ name: 'Jest', confidence: 0.85, evidence: ['jest dependency'] });
            if (allDeps.playwright || allDeps['@playwright/test']) result.stacks.push({ name: 'Playwright', confidence: 0.85, evidence: ['playwright dependency'] });
            if (allDeps.tailwindcss) result.stacks.push({ name: 'Tailwind CSS', confidence: 0.85, evidence: ['tailwindcss dependency'] });
        } catch { /* skip */ }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHP Stack Detection
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private async detectPhpStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const composerPath = path.join(projectRoot, 'composer.json');
        if (!fs.existsSync(composerPath)) return;

        try {
            const composer = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
            const allDeps = { ...composer.require, ...composer['require-dev'] };

            if (allDeps.php) { result.versions.language = `PHP ${allDeps.php}`; }

            if (allDeps['laravel/framework']) {
                const ver = allDeps['laravel/framework'].replace(/[\^~]/g, '');
                result.stacks.push({ name: 'Laravel', confidence: 0.95, evidence: [`laravel/framework ${ver}`], version: ver });
                result.versions.framework = `Laravel ${ver}`;
            }
            if (allDeps['symfony/framework-bundle'] || allDeps['symfony/symfony']) {
                result.stacks.push({ name: 'Symfony', confidence: 0.95, evidence: ['symfony framework dependency'] });
            }
            if (allDeps['slim/slim']) result.stacks.push({ name: 'Slim', confidence: 0.9, evidence: ['slim/slim dependency'] });
            if (allDeps['filament/filament']) result.stacks.push({ name: 'Filament', confidence: 0.85, evidence: ['filament dependency'] });
            if (allDeps['livewire/livewire']) result.stacks.push({ name: 'Livewire', confidence: 0.85, evidence: ['livewire dependency'] });
            if (allDeps['inertiajs/inertia-laravel']) result.stacks.push({ name: 'Inertia.js', confidence: 0.85, evidence: ['inertia dependency'] });
            if (allDeps['doctrine/orm']) result.stacks.push({ name: 'Doctrine ORM', confidence: 0.85, evidence: ['doctrine/orm dependency'] });
            if (allDeps['phpunit/phpunit'] || allDeps['pestphp/pest']) {
                result.stacks.push({ name: allDeps['pestphp/pest'] ? 'Pest' : 'PHPUnit', confidence: 0.9, evidence: ['test framework dependency'] });
            }
        } catch { /* skip */ }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Ruby Stack Detection
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private async detectRubyStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const gemfilePath = path.join(projectRoot, 'Gemfile');
        if (!fs.existsSync(gemfilePath)) return;

        try {
            const content = fs.readFileSync(gemfilePath, 'utf8').toLowerCase();

            if (content.includes("'rails'") || content.includes('"rails"')) {
                result.stacks.push({ name: 'Ruby on Rails', confidence: 0.95, evidence: ['rails in Gemfile'] });
                result.versions.framework = 'Rails';
            }
            if (content.includes("'sinatra'") || content.includes('"sinatra"')) {
                result.stacks.push({ name: 'Sinatra', confidence: 0.9, evidence: ['sinatra in Gemfile'] });
            }
            if (content.includes("'hanami'")) result.stacks.push({ name: 'Hanami', confidence: 0.9, evidence: ['hanami in Gemfile'] });
            if (content.includes("'rspec'")) result.stacks.push({ name: 'RSpec', confidence: 0.85, evidence: ['rspec in Gemfile'] });
            if (content.includes("'minitest'")) result.stacks.push({ name: 'Minitest', confidence: 0.85, evidence: ['minitest in Gemfile'] });
            if (content.includes("'sidekiq'")) result.stacks.push({ name: 'Sidekiq', confidence: 0.85, evidence: ['sidekiq in Gemfile'] });
            if (content.includes("'devise'")) result.stacks.push({ name: 'Devise', confidence: 0.85, evidence: ['devise in Gemfile'] });
            if (content.includes("'graphql'")) result.stacks.push({ name: 'GraphQL', confidence: 0.85, evidence: ['graphql in Gemfile'] });
        } catch { /* skip */ }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Swift Stack Detection
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    private async detectSwiftStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const packagePath = path.join(projectRoot, 'Package.swift');
        if (!fs.existsSync(packagePath)) return;

        try {
            const content = fs.readFileSync(packagePath, 'utf8');

            if (content.includes('Vapor') || content.includes('vapor')) {
                result.stacks.push({ name: 'Vapor', confidence: 0.9, evidence: ['Vapor in Package.swift'] });
                result.versions.framework = 'Vapor';
            }
            if (content.includes('Kitura')) result.stacks.push({ name: 'Kitura', confidence: 0.9, evidence: ['Kitura in Package.swift'] });
            if (content.includes('Perfect')) result.stacks.push({ name: 'Perfect', confidence: 0.85, evidence: ['Perfect in Package.swift'] });
            if (content.includes('SwiftUI')) result.stacks.push({ name: 'SwiftUI', confidence: 0.9, evidence: ['SwiftUI reference'] });
            if (content.includes('Combine')) result.stacks.push({ name: 'Combine', confidence: 0.85, evidence: ['Combine reference'] });
        } catch { /* skip */ }
    }

    private async detectKotlinStack(projectRoot: string, result: DetailedStack): Promise<void> {
        for (const buildFile of ['build.gradle.kts', 'build.gradle']) {
            const buildPath = path.join(projectRoot, buildFile);
            if (!fs.existsSync(buildPath)) continue;
            try {
                const content = fs.readFileSync(buildPath, 'utf8');
                if (content.includes('ktor')) result.stacks.push({ name: 'Ktor', confidence: 0.9, evidence: ['ktor in build.gradle'] });
                if (content.includes('spring-boot')) result.stacks.push({ name: 'Spring Boot', confidence: 0.9, evidence: ['spring-boot in build.gradle'] });
                if (content.includes('exposed')) result.stacks.push({ name: 'Exposed', confidence: 0.85, evidence: ['exposed ORM in build.gradle'] });
                if (content.includes('koin')) result.stacks.push({ name: 'Koin', confidence: 0.85, evidence: ['koin DI in build.gradle'] });
                if (content.includes('dagger') || content.includes('hilt')) result.stacks.push({ name: 'Dagger/Hilt', confidence: 0.85, evidence: ['dagger/hilt in build.gradle'] });
                if (content.includes('kotlinx.coroutines')) result.stacks.push({ name: 'Coroutines', confidence: 0.8, evidence: ['kotlinx.coroutines'] });
                if (content.includes('kotlinx.serialization')) result.stacks.push({ name: 'Kotlin Serialization', confidence: 0.8, evidence: ['kotlinx.serialization'] });
                break;
            } catch { /* skip */ }
        }
    }

    private async detectElixirStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const mixPath = path.join(projectRoot, 'mix.exs');
        if (!fs.existsSync(mixPath)) return;
        try {
            const content = fs.readFileSync(mixPath, 'utf8').toLowerCase();
            if (content.includes(':phoenix')) {
                result.stacks.push({ name: 'Phoenix', confidence: 0.95, evidence: ['phoenix in mix.exs'] });
                result.versions.framework = 'Phoenix';
            }
            if (content.includes(':ecto')) result.stacks.push({ name: 'Ecto', confidence: 0.9, evidence: ['ecto in mix.exs'] });
            if (content.includes(':absinthe')) result.stacks.push({ name: 'Absinthe (GraphQL)', confidence: 0.85, evidence: ['absinthe in mix.exs'] });
            if (content.includes(':oban')) result.stacks.push({ name: 'Oban', confidence: 0.85, evidence: ['oban in mix.exs'] });
            if (content.includes(':tesla')) result.stacks.push({ name: 'Tesla HTTP', confidence: 0.85, evidence: ['tesla in mix.exs'] });
            if (content.includes(':live_view') || content.includes(':phoenix_live_view')) {
                result.stacks.push({ name: 'Phoenix LiveView', confidence: 0.9, evidence: ['live_view in mix.exs'] });
            }
        } catch { /* skip */ }
    }

    private async detectScalaStack(projectRoot: string, result: DetailedStack): Promise<void> {
        const sbtPath = path.join(projectRoot, 'build.sbt');
        if (!fs.existsSync(sbtPath)) return;
        try {
            const content = fs.readFileSync(sbtPath, 'utf8').toLowerCase();
            if (content.includes('akka')) result.stacks.push({ name: 'Akka', confidence: 0.9, evidence: ['akka in build.sbt'] });
            if (content.includes('play')) result.stacks.push({ name: 'Play Framework', confidence: 0.9, evidence: ['play in build.sbt'] });
            if (content.includes('http4s')) result.stacks.push({ name: 'http4s', confidence: 0.9, evidence: ['http4s in build.sbt'] });
            if (content.includes('zio')) result.stacks.push({ name: 'ZIO', confidence: 0.85, evidence: ['zio in build.sbt'] });
            if (content.includes('cats')) result.stacks.push({ name: 'Cats', confidence: 0.85, evidence: ['cats in build.sbt'] });
            if (content.includes('slick')) result.stacks.push({ name: 'Slick', confidence: 0.85, evidence: ['slick ORM in build.sbt'] });
            if (content.includes('spark')) result.stacks.push({ name: 'Apache Spark', confidence: 0.85, evidence: ['spark in build.sbt'] });
        } catch { /* skip */ }
    }
}
