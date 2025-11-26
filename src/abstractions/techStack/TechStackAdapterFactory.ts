import { ITechStackAdapter } from './ITechStackAdapter';
import { TypeScriptAdapter } from './TypeScriptAdapter';
import { SpringBootAdapter } from './SpringBootAdapter';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * 기술 스택 어댑터 팩토리
 * 프로젝트를 감지하고 적절한 어댑터를 반환
 */
export class TechStackAdapterFactory {
    private static adapterCache = new Map<string, ITechStackAdapter>();

    /**
     * 프로젝트 경로에서 기술 스택을 감지하고 어댑터 반환
     */
    static async detectAndCreate(projectPath: string): Promise<ITechStackAdapter | null> {
        // 캐시 확인
        if (this.adapterCache.has(projectPath)) {
            return this.adapterCache.get(projectPath)!;
        }

        // 기술 스택 감지
        const adapter = await this.detectTechStack(projectPath);
        
        if (adapter) {
            this.adapterCache.set(projectPath, adapter);
        }

        return adapter;
    }

    /**
     * 특정 기술 스택 어댑터 생성
     */
    static create(stackId: string, options?: any): ITechStackAdapter | null {
        switch (stackId) {
            case 'typescript':
                return new TypeScriptAdapter(options?.framework);
            case 'spring-boot':
                return new SpringBootAdapter(options?.buildTool);
            default:
                console.warn(`[TechStackAdapterFactory] Unknown stack ID: ${stackId}`);
                return null;
        }
    }

    /**
     * 캐시 초기화
     */
    static clearCache(): void {
        this.adapterCache.clear();
    }

    /**
     * 프로젝트 타입 감지
     */
    private static async detectTechStack(projectPath: string): Promise<ITechStackAdapter | null> {
        // 우선순위대로 감지
        const detectors = [
            { detect: SpringBootAdapter.detect, create: () => this.createSpringBootAdapter(projectPath) },
            { detect: TypeScriptAdapter.detect, create: () => this.createTypeScriptAdapter(projectPath) },
        ];

        for (const detector of detectors) {
            try {
                const isMatch = await detector.detect(projectPath);
                if (isMatch) {
                    console.log(`[TechStackAdapterFactory] Detected tech stack for ${projectPath}`);
                    return await detector.create();
                }
            } catch (error) {
                console.error(`[TechStackAdapterFactory] Error detecting tech stack:`, error);
            }
        }

        console.warn(`[TechStackAdapterFactory] Could not detect tech stack for ${projectPath}`);
        return null;
    }

    /**
     * Spring Boot 어댑터 생성 (빌드 도구 자동 감지)
     */
    private static async createSpringBootAdapter(projectPath: string): Promise<SpringBootAdapter> {
        const pomExists = await fs.access(path.join(projectPath, 'pom.xml'))
            .then(() => true)
            .catch(() => false);
        
        const buildTool = pomExists ? 'maven' : 'gradle';
        return new SpringBootAdapter(buildTool);
    }

    /**
     * TypeScript 어댑터 생성 (프레임워크 자동 감지)
     */
    private static async createTypeScriptAdapter(projectPath: string): Promise<TypeScriptAdapter> {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const content = await fs.readFile(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(content);
            
            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
            
            // 프레임워크 감지
            if (dependencies['react']) return new TypeScriptAdapter('React');
            if (dependencies['vue']) return new TypeScriptAdapter('Vue');
            if (dependencies['@angular/core']) return new TypeScriptAdapter('Angular');
            if (dependencies['next']) return new TypeScriptAdapter('Next.js');
            if (dependencies['nuxt']) return new TypeScriptAdapter('Nuxt.js');
            
            return new TypeScriptAdapter(); // 프레임워크 없음
        } catch {
            return new TypeScriptAdapter();
        }
    }

    /**
     * 지원하는 기술 스택 목록
     */
    static getSupportedStacks(): Array<{ id: string; name: string; language: string }> {
        return [
            { id: 'typescript', name: 'TypeScript', language: 'TypeScript' },
            { id: 'spring-boot', name: 'Spring Boot', language: 'Java' },
            // 추후 확장 가능
            // { id: 'python-django', name: 'Django', language: 'Python' },
            // { id: 'python-flask', name: 'Flask', language: 'Python' },
            // { id: 'go', name: 'Go', language: 'Go' },
        ];
    }
}

