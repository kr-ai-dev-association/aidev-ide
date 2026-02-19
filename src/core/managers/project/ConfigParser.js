/**
 * Config Parser
 * 설정 파일을 파싱하는 클래스
 */
import * as fs from 'fs';
import * as path from 'path';
import { cleanJsonContent } from '../../../utils/string';
export class ConfigParser {
    /**
     * 설정 파일을 파싱합니다
     */
    async parseConfig(configPath) {
        try {
            const fileName = path.basename(configPath);
            const content = fs.readFileSync(configPath, 'utf8');
            let parsed = {};
            let type = 'config';
            // 파일 타입 결정
            if (fileName === 'package.json') {
                parsed = JSON.parse(cleanJsonContent(content));
                type = 'package';
            }
            else if (fileName === 'pom.xml' || fileName === 'build.gradle') {
                type = 'build';
                // XML/Gradle 파싱은 간단하게 (나중에 개선 가능)
            }
            else if (fileName === 'tsconfig.json' || fileName === 'jsconfig.json') {
                parsed = JSON.parse(cleanJsonContent(content));
                type = 'config';
            }
            else if (fileName === '.env' || fileName.startsWith('.env.')) {
                type = 'env';
                parsed = this.parseEnvFile(content);
            }
            else if (fileName === 'pyproject.toml') {
                // TOML 파싱 (간단한 구현)
                parsed = this.parseToml(content);
                type = 'package';
            }
            else if (fileName === 'go.mod') {
                parsed = this.parseGoMod(content);
                type = 'package';
            }
            else if (fileName === 'Cargo.toml') {
                parsed = this.parseToml(content);
                type = 'package';
            }
            else if (fileName === 'pubspec.yaml') {
                parsed = this.parseYaml(content);
                type = 'package';
            }
            return {
                name: fileName,
                path: configPath,
                type,
                parsed
            };
        }
        catch (error) {
            console.error(`[ConfigParser] Failed to parse config: ${configPath}`, error);
            return null;
        }
    }
    /**
     * package.json에서 빌드 명령어를 추출합니다
     */
    extractBuildCommands(packageJson) {
        const scripts = packageJson.scripts || {};
        return {
            install: scripts.install || 'npm install',
            build: scripts.build,
            dev: scripts.dev || scripts.start,
            test: scripts.test,
            lint: scripts.lint,
            start: scripts.start,
            clean: scripts.clean
        };
    }
    /**
     * package.json에서 의존성을 추출합니다
     */
    extractDependencies(packageJson) {
        const dependencies = [];
        // Runtime dependencies
        if (packageJson.dependencies) {
            for (const [name, version] of Object.entries(packageJson.dependencies)) {
                dependencies.push({
                    name,
                    version: version,
                    type: 'runtime'
                });
            }
        }
        // Dev dependencies
        if (packageJson.devDependencies) {
            for (const [name, version] of Object.entries(packageJson.devDependencies)) {
                dependencies.push({
                    name,
                    version: version,
                    type: 'dev'
                });
            }
        }
        // Peer dependencies
        if (packageJson.peerDependencies) {
            for (const [name, version] of Object.entries(packageJson.peerDependencies)) {
                dependencies.push({
                    name,
                    version: version,
                    type: 'peer'
                });
            }
        }
        return dependencies;
    }
    /**
     * package.json에서 메타데이터를 추출합니다
     */
    extractMetadata(packageJson) {
        return {
            description: packageJson.description,
            author: packageJson.author,
            license: packageJson.license,
            repository: typeof packageJson.repository === 'string'
                ? packageJson.repository
                : packageJson.repository?.url,
            homepage: packageJson.homepage,
            keywords: packageJson.keywords
        };
    }
    /**
     * .env 파일을 파싱합니다
     */
    parseEnvFile(content) {
        const env = {};
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const [key, ...valueParts] = trimmed.split('=');
                if (key && valueParts.length > 0) {
                    env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                }
            }
        }
        return env;
    }
    /**
     * TOML 파일을 간단히 파싱합니다 (기본적인 구현)
     */
    parseToml(content) {
        // 간단한 TOML 파싱 (완전한 구현은 라이브러리 필요)
        const result = {};
        const lines = content.split('\n');
        let currentSection = '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            // 섹션
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                currentSection = trimmed.slice(1, -1);
                result[currentSection] = {};
                continue;
            }
            // 키=값
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                let value = valueParts.join('=').trim();
                value = value.replace(/^["']|["']$/g, '');
                if (currentSection) {
                    result[currentSection][key.trim()] = value;
                }
                else {
                    result[key.trim()] = value;
                }
            }
        }
        return result;
    }
    /**
     * YAML 파일을 간단히 파싱합니다 (기본적인 구현)
     */
    parseYaml(content) {
        // 간단한 YAML 파싱 (완전한 구현은 라이브러리 필요)
        const result = {};
        const lines = content.split('\n');
        let currentPath = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            const indent = line.length - line.trimStart().length;
            const [key, ...valueParts] = trimmed.split(':');
            if (key && valueParts.length > 0) {
                const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
                // 인덴트 기반 경로 계산 (간단한 구현)
                currentPath = currentPath.slice(0, Math.floor(indent / 2));
                currentPath.push(key.trim());
                let target = result;
                for (let i = 0; i < currentPath.length - 1; i++) {
                    if (!target[currentPath[i]]) {
                        target[currentPath[i]] = {};
                    }
                    target = target[currentPath[i]];
                }
                target[currentPath[currentPath.length - 1]] = value;
            }
        }
        return result;
    }
    /**
     * go.mod 파일을 파싱합니다
     */
    parseGoMod(content) {
        const result = {};
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) {
                continue;
            }
            const parts = trimmed.split(/\s+/);
            if (parts.length >= 2) {
                const key = parts[0];
                const value = parts[1];
                if (key === 'module') {
                    result.module = value;
                }
                else if (key === 'go') {
                    result.goVersion = value;
                }
            }
        }
        return result;
    }
}
//# sourceMappingURL=ConfigParser.js.map