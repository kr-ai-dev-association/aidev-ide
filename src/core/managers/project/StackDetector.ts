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
}
