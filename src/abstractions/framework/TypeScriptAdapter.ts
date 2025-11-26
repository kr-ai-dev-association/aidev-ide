import * as path from 'path';
import * as fs from 'fs/promises';
import {
    IFrameworkAdapter,
    ComponentOptions,
    ErrorPattern,
    FrameworkError,
    ErrorFixSuggestion,
    ProjectMetadata,
    FileType,
} from './IFrameworkAdapter';

/**
 * TypeScript 프레임워크 어댑터
 */
export class TypeScriptAdapter implements IFrameworkAdapter {
    readonly frameworkId = 'typescript';
    readonly frameworkName = 'TypeScript';
    readonly language = 'TypeScript';
    readonly framework?: string;

    constructor(framework?: string) {
        this.framework = framework; // React, Vue, Angular 등
    }

    // ==================== 프로젝트 구조 ====================

    getRequiredConfigFiles(): string[] {
        const files = ['package.json', 'tsconfig.json'];
        if (this.framework === 'React') {
            files.push('vite.config.ts', 'webpack.config.js');
        }
        return files;
    }

    getSourceDirectories(): string[] {
        return ['src', 'lib', 'app'];
    }

    getTestDirectories(): string[] {
        return ['__tests__', 'tests', 'test', 'spec'];
    }

    getBuildOutputDirectories(): string[] {
        return ['dist', 'build', 'out', '.next'];
    }

    getExcludedDirectories(): string[] {
        return [
            'node_modules',
            'dist',
            'build',
            'coverage',
            '.next',
            '.nuxt',
            'out',
            '.cache',
            '.vscode',
            '.idea',
        ];
    }

    // ==================== 의존성 관리 ====================

    getInstallCommand(): string {
        return 'npm install';
    }

    getDependencyFile(): string {
        return 'package.json';
    }

    getAddDependencyCommand(packageName: string, isDev?: boolean): string {
        return isDev ? `npm install -D ${packageName}` : `npm install ${packageName}`;
    }

    getRemoveDependencyCommand(packageName: string): string {
        return `npm uninstall ${packageName}`;
    }

    // ==================== 빌드 & 실행 ====================

    getBuildCommand(): string {
        return 'npm run build';
    }

    getDevCommand(): string {
        return 'npm run dev';
    }

    getStartCommand(): string {
        return 'npm start';
    }

    getTestCommand(): string {
        return 'npm test';
    }

    getLintCommand(): string | null {
        return 'npm run lint';
    }

    getFormatCommand(): string | null {
        return 'npm run format';
    }

    // ==================== 코드 생성 ====================

    getFileTemplate(fileType: string, fileName: string): string {
        const templates: Record<string, string> = {
            [FileType.COMPONENT]: this.getComponentTemplate(fileName),
            [FileType.SERVICE]: this.getServiceTemplate(fileName),
            [FileType.UTIL]: this.getUtilTemplate(fileName),
            [FileType.TEST]: this.getTestTemplate(fileName),
        };
        return templates[fileType] || '';
    }

    getComponentTemplate(componentName: string, options?: ComponentOptions): string {
        if (this.framework === 'React') {
            return this.getReactComponentTemplate(componentName, options);
        }
        return `export interface ${componentName}Props {
  // props 정의
}

export function ${componentName}(props: ${componentName}Props) {
  return (
    <div>
      {/* ${componentName} 구현 */}
    </div>
  );
}`;
    }

    getConfigFileTemplate(configType: string): string {
        const templates: Record<string, string> = {
            tsconfig: `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
            eslint: `{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "plugins": ["@typescript-eslint"],
  "rules": {}
}`,
        };
        return templates[configType] || '';
    }

    getImportStatement(moduleName: string, items?: string[]): string {
        if (items && items.length > 0) {
            return `import { ${items.join(', ')} } from '${moduleName}';`;
        }
        return `import ${moduleName} from '${moduleName}';`;
    }

    // ==================== 에러 처리 ====================

    getErrorPatterns(): ErrorPattern[] {
        return [
            {
                pattern: /Cannot find module ['"]([^'"]+)['"]/,
                errorType: 'MODULE_NOT_FOUND',
                description: '모듈을 찾을 수 없음',
                commonCauses: ['의존성 미설치', '잘못된 import 경로', 'tsconfig paths 설정 오류'],
            },
            {
                pattern: /Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/,
                errorType: 'TYPE_MISMATCH',
                description: '타입 불일치',
                commonCauses: ['잘못된 타입 정의', '타입 변환 필요', '제네릭 타입 오류'],
            },
            {
                pattern: /Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/,
                errorType: 'PROPERTY_NOT_FOUND',
                description: '프로퍼티가 타입에 존재하지 않음',
                commonCauses: ['타입 정의 누락', 'optional chaining 필요', '타입 확장 필요'],
            },
            {
                pattern: /Argument of type ['"]([^'"]+)['"] is not assignable/,
                errorType: 'ARGUMENT_TYPE_ERROR',
                description: '함수 인자 타입 오류',
                commonCauses: ['잘못된 인자 타입', '함수 시그니처 불일치'],
            },
        ];
    }

    suggestErrorFix(error: FrameworkError): ErrorFixSuggestion | null {
        // MODULE_NOT_FOUND 에러 처리
        if (error.type === 'MODULE_NOT_FOUND') {
            const match = error.message.match(/Cannot find module ['"]([^'"]+)['"]/);
            if (match) {
                const moduleName = match[1];
                return {
                    diagnosis: `모듈 '${moduleName}'을 찾을 수 없습니다.`,
                    suggestedFix: `모듈을 설치하거나 import 경로를 확인하세요.`,
                    commands: [`npm install ${moduleName}`, `npm install @types/${moduleName} -D`],
                };
            }
        }

        // TYPE_MISMATCH 에러 처리
        if (error.type === 'TYPE_MISMATCH') {
            return {
                diagnosis: '타입이 일치하지 않습니다.',
                suggestedFix: '타입 정의를 확인하고 필요시 타입 캐스팅을 사용하세요.',
                filestoModify: [],
            };
        }

        return null;
    }

    // ==================== 프로젝트 타입 감지 ====================

    static async detect(projectPath: string): Promise<boolean> {
        try {
            const packageJsonPath = path.join(projectPath, 'package.json');
            const tsconfigPath = path.join(projectPath, 'tsconfig.json');

            const hasPackageJson = await fs.access(packageJsonPath).then(() => true).catch(() => false);
            const hasTsconfig = await fs.access(tsconfigPath).then(() => true).catch(() => false);

            return hasPackageJson && hasTsconfig;
        } catch {
            return false;
        }
    }

    async extractProjectMetadata(projectPath: string): Promise<ProjectMetadata> {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const content = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);

        return {
            name: packageJson.name || 'unknown',
            version: packageJson.version || '0.0.0',
            description: packageJson.description,
            dependencies: packageJson.dependencies || {},
            devDependencies: packageJson.devDependencies || {},
            scripts: packageJson.scripts || {},
            mainEntryPoint: packageJson.main || 'src/index.ts',
        };
    }

    // ==================== Private 헬퍼 메서드 ====================

    private getReactComponentTemplate(componentName: string, options?: ComponentOptions): string {
        const withStyles = options?.withStyles ?? false;
        const exportDefault = options?.exportDefault ?? false;

        let template = `import React from 'react';\n`;

        if (withStyles) {
            template += `import styles from './${componentName}.module.css';\n`;
        }

        template += `\nexport interface ${componentName}Props {
  // props 정의
}

${exportDefault ? 'export default' : 'export'} function ${componentName}(props: ${componentName}Props) {
  return (
    <div${withStyles ? ` className={styles.container}` : ''}>
      {/* ${componentName} 구현 */}
    </div>
  );
}`;

        if (!exportDefault) {
            template += `\n\nexport default ${componentName};`;
        }

        return template;
    }

    private getServiceTemplate(serviceName: string): string {
        return `export class ${serviceName} {
  constructor() {
    // 초기화
  }

  async execute(): Promise<void> {
    // 구현
  }
}`;
    }

    private getUtilTemplate(utilName: string): string {
        return `export function ${utilName}() {
  // 유틸리티 함수 구현
}`;
    }

    private getTestTemplate(testName: string): string {
        return `import { describe, it, expect } from 'vitest';

describe('${testName}', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});`;
    }
}

