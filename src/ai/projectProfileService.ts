import * as vscode from 'vscode';
import * as path from 'path';

export interface FrameworkMatch {
    framework: string;
    confidence: number;
    evidence: string[];
}

export interface ProjectProfile {
    language: string;
    frameworks: FrameworkMatch[];
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
    entryPoints: string[];
    scripts: Record<string, string>;
    lastScannedAt: number;
}

const PROFILE_KEY = 'aidevIde.projectProfile';

export class ProjectProfileService {
    constructor(private rootPath: string, private storage: vscode.Memento) { }

    public async loadProfile(): Promise<ProjectProfile | undefined> {
        const existing = this.storage.get<ProjectProfile>(PROFILE_KEY);
        if (existing) {
            return existing;
        }

        return this.refreshProfile();
    }

    public async refreshProfile(): Promise<ProjectProfile> {
        const profile = await this.scanWorkspace();
        await this.storage.update(PROFILE_KEY, profile);
        return profile;
    }

    private async scanWorkspace(): Promise<ProjectProfile> {
        const packageJson = await this.tryReadJson(path.join(this.rootPath, 'package.json'));
        const pyProject = await this.tryReadToml(path.join(this.rootPath, 'pyproject.toml'));
        const goMod = await this.tryReadFile(path.join(this.rootPath, 'go.mod'));
        const pomXml = await this.tryReadFile(path.join(this.rootPath, 'pom.xml'));
        const buildGradle = await this.tryReadFile(path.join(this.rootPath, 'build.gradle'));
        const buildGradleKts = await this.tryReadFile(path.join(this.rootPath, 'build.gradle.kts'));
        const requirementsTxt = await this.tryReadFile(path.join(this.rootPath, 'requirements.txt'));
        const setupPy = await this.tryReadFile(path.join(this.rootPath, 'setup.py'));

        const scripts = (packageJson?.scripts as Record<string, string>) || {};
        const entryPoints = this.detectEntryPoints(packageJson, scripts);
        const packageManager = await this.detectPackageManager();

        const frameworks: FrameworkMatch[] = [];
        const language = this.detectLanguage({ packageJson, pyProject, goMod, pomXml, buildGradle, buildGradleKts, requirementsTxt, setupPy, frameworks });

        const profile: ProjectProfile = {
            language,
            frameworks,
            packageManager,
            entryPoints,
            scripts,
            lastScannedAt: Date.now()
        };

        return profile;
    }

    private detectLanguage(inputs: { packageJson?: any; pyProject?: any; goMod?: string | undefined; pomXml?: string | undefined; buildGradle?: string | undefined; buildGradleKts?: string | undefined; requirementsTxt?: string | undefined; setupPy?: string | undefined; frameworks: FrameworkMatch[] }): string {
        if (inputs.packageJson) {
            this.populateNodeFrameworks(inputs.packageJson, inputs.frameworks);
            if (inputs.frameworks.length > 0) {
                return 'JavaScript/TypeScript';
            }
            return 'JavaScript/TypeScript';
        }
        if (inputs.pyProject || inputs.requirementsTxt || inputs.setupPy) {
            this.populatePythonFrameworks(inputs, inputs.frameworks);
            return 'Python';
        }
        if (inputs.goMod) {
            inputs.frameworks.push({ framework: 'Go', confidence: 0.6, evidence: ['Detected go.mod'] });
            return 'Go';
        }
        if (inputs.pomXml || inputs.buildGradle || inputs.buildGradleKts) {
            this.populateJavaFrameworks(inputs, inputs.frameworks);
            if (inputs.frameworks.length === 0) {
                inputs.frameworks.push({ framework: 'Java (Unknown Framework)', confidence: 0.5, evidence: ['Detected Java build file'] });
            }
            return 'Java';
        }
        return 'Unknown';
    }

    private populateNodeFrameworks(pkg: any, frameworks: FrameworkMatch[]): void {
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        const addFramework = (name: string, confidence: number, evidence: string) => {
            frameworks.push({ framework: name, confidence, evidence: [evidence] });
        };

        const has = (library: string) => deps[library] !== undefined;

        if (has('react') || has('react-dom')) {
            addFramework('React', 0.9, 'Found react dependency');
        }
        if (has('vue')) {
            addFramework('Vue', 0.9, 'Found vue dependency');
        }
        if (has('@angular/core')) {
            addFramework('Angular', 0.9, 'Found @angular/core dependency');
        }
        if (has('vite')) {
            addFramework('Vite', 0.8, 'Found vite dependency');
        }
        if (has('next')) {
            addFramework('Next.js', 0.8, 'Found next dependency');
        }
        if (has('@nestjs/core')) {
            addFramework('NestJS', 0.8, 'Found @nestjs/core dependency');
        }
        if (has('express')) {
            addFramework('Express', 0.7, 'Found express dependency');
        }
    }

    private populatePythonFrameworks(inputs: { pyProject?: any; requirementsTxt?: string; setupPy?: string }, frameworks: FrameworkMatch[]): void {
        const dependencies: string[] = [];

        if (inputs.pyProject) {
            const tool = inputs.pyProject.tool || {};
            for (const key of Object.keys(tool)) {
                const cfg = tool[key];
                if (cfg?.dependencies && Array.isArray(cfg.dependencies)) {
                    dependencies.push(...cfg.dependencies.map((dep: any) => String(dep)));
                }
            }
        }

        if (inputs.requirementsTxt) {
            dependencies.push(...inputs.requirementsTxt.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
        }

        if (inputs.setupPy) {
            const match = inputs.setupPy.match(/install_requires\s*=\s*\[(.*?)\]/s);
            if (match) {
                const entries = match[1]
                    .split(',')
                    .map(item => item.replace(/['"\s]/g, ''))
                    .filter(Boolean);
                dependencies.push(...entries);
            }
        }

        const add = (framework: string, evidence: string) => {
            frameworks.push({ framework, confidence: 0.8, evidence: [evidence] });
        };

        const matched = (needle: string) => dependencies.some(dep => dep.toLowerCase().includes(needle));
        if (matched('fastapi')) add('FastAPI', 'Python dependency includes fastapi');
        if (matched('flask')) add('Flask', 'Python dependency includes flask');
        if (matched('django')) add('Django', 'Python dependency includes django');
    }

    private populateJavaFrameworks(inputs: { pomXml?: string; buildGradle?: string; buildGradleKts?: string }, frameworks: FrameworkMatch[]): void {
        const add = (framework: string, evidence: string) => frameworks.push({ framework, confidence: 0.8, evidence: [evidence] });

        const detect = (content: string | undefined, needle: string) => content && content.includes(needle);

        if (detect(inputs.pomXml, 'spring-boot-starter')) add('Spring Boot', 'pom.xml contains spring-boot-starter');
        if (detect(inputs.pomXml, 'spring-framework')) add('Spring', 'pom.xml references spring-framework');
        if (detect(inputs.buildGradle, 'spring-boot-starter')) add('Spring Boot', 'build.gradle contains spring-boot-starter');
        if (detect(inputs.buildGradleKts, 'spring-boot-starter')) add('Spring Boot', 'build.gradle.kts contains spring-boot-starter');
    }

    private detectEntryPoints(pkg?: any, scripts?: Record<string, string>): string[] {
        const entryPoints: string[] = [];
        if (!pkg) return entryPoints;

        if (pkg.module) entryPoints.push(pkg.module);
        if (pkg.main) entryPoints.push(pkg.main);
        if (pkg.bin && typeof pkg.bin === 'string') entryPoints.push(pkg.bin);
        if (pkg.bin && typeof pkg.bin === 'object') {
            const binValues = Object.values(pkg.bin).filter((value): value is string => typeof value === 'string');
            entryPoints.push(...binValues);
        }

        const runScripts = ['start', 'dev', 'serve', 'preview'];
        for (const script of runScripts) {
            if (scripts?.[script]) {
                entryPoints.push(`npm run ${script}`);
            }
        }

        return [...new Set(entryPoints)].filter(Boolean);
    }

    private async detectPackageManager(): Promise<'npm' | 'yarn' | 'pnpm' | 'bun' | undefined> {
        const lockFiles: Record<string, 'npm' | 'yarn' | 'pnpm' | 'bun'> = {
            'package-lock.json': 'npm',
            'yarn.lock': 'yarn',
            'pnpm-lock.yaml': 'pnpm',
            'bun.lockb': 'bun'
        };

        for (const [file, manager] of Object.entries(lockFiles)) {
            const uri = vscode.Uri.file(path.join(this.rootPath, file));
            try {
                await vscode.workspace.fs.stat(uri);
                return manager;
            } catch {
                continue;
            }
        }
        return undefined;
    }

    private async tryReadJson(filePath: string): Promise<any | undefined> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            return JSON.parse(Buffer.from(data).toString('utf8'));
        } catch {
            return undefined;
        }
    }

    private async tryReadToml(filePath: string): Promise<any | undefined> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            return this.parseToml(Buffer.from(data).toString('utf8'));
        } catch {
            return undefined;
        }
    }

    private async tryReadFile(filePath: string): Promise<string | undefined> {
        try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(data).toString('utf8');
        } catch {
            return undefined;
        }
    }

    private parseToml(content: string): any {
        const result: any = {};
        let currentSection: any = result;

        const lines = content.split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;

            if (line.startsWith('[') && line.endsWith(']')) {
                const sectionPath = line.slice(1, -1).split('.');
                currentSection = result;
                for (const part of sectionPath) {
                    currentSection[part] = currentSection[part] || {};
                    currentSection = currentSection[part];
                }
                continue;
            }

            const [key, value] = line.split('=').map(part => part.trim());
            if (!key || value === undefined) continue;

            currentSection[key] = value.replace(/^"|"$/g, '');
        }

        return result;
    }
}

