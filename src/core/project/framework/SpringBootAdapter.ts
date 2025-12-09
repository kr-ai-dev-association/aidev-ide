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
 * Spring Boot 프레임워크 어댑터
 */
export class SpringBootAdapter implements IFrameworkAdapter {
    readonly frameworkId = 'spring-boot';
    readonly frameworkName = 'Spring Boot';
    readonly language = 'Java';
    readonly framework = 'Spring Boot';

    private buildTool: 'maven' | 'gradle' = 'maven';

    constructor(buildTool?: 'maven' | 'gradle') {
        this.buildTool = buildTool || 'maven';
    }

    // ==================== 프로젝트 구조 ====================

    getRequiredConfigFiles(): string[] {
        const files = [];
        if (this.buildTool === 'maven') {
            files.push('pom.xml');
        } else {
            files.push('build.gradle', 'build.gradle.kts');
        }
        files.push(
            'src/main/resources/application.properties',
            'src/main/resources/application.yml'
        );
        return files;
    }

    getSourceDirectories(): string[] {
        return ['src/main/java', 'src/main/kotlin'];
    }

    getTestDirectories(): string[] {
        return ['src/test/java', 'src/test/kotlin'];
    }

    getBuildOutputDirectories(): string[] {
        return this.buildTool === 'maven' ? ['target'] : ['build'];
    }

    getExcludedDirectories(): string[] {
        return [
            'target',
            'build',
            '.gradle',
            '.m2',
            'bin',
            'out',
            '.idea',
            '.vscode',
            '.settings',
        ];
    }

    // ==================== 의존성 관리 ====================

    getInstallCommand(): string {
        return this.buildTool === 'maven'
            ? './mvnw clean install'
            : './gradlew build';
    }

    getDependencyFile(): string {
        return this.buildTool === 'maven' ? 'pom.xml' : 'build.gradle';
    }

    getAddDependencyCommand(packageName: string, isDev?: boolean): string {
        // Spring Boot에서는 직접 명령어로 의존성 추가가 어려움
        // 사용자가 직접 pom.xml이나 build.gradle을 수정해야 함
        return `# ${this.getDependencyFile()}에 다음 의존성을 추가하세요:\n# ${packageName}`;
    }

    getRemoveDependencyCommand(packageName: string): string {
        return `# ${this.getDependencyFile()}에서 ${packageName} 의존성을 제거하세요`;
    }

    // ==================== 빌드 & 실행 ====================

    getBuildCommand(): string {
        return this.buildTool === 'maven'
            ? './mvnw clean package'
            : './gradlew build';
    }

    getDevCommand(): string {
        return this.buildTool === 'maven'
            ? './mvnw spring-boot:run'
            : './gradlew bootRun';
    }

    getStartCommand(): string {
        return `java -jar ${this.getBuildOutputDirectories()[0]}/*.jar`;
    }

    getTestCommand(): string {
        return this.buildTool === 'maven'
            ? './mvnw test'
            : './gradlew test';
    }

    getLintCommand(): string | null {
        return null; // Java는 기본 린터가 없음 (Checkstyle, PMD 등은 별도 설정)
    }

    getFormatCommand(): string | null {
        return null; // Java formatter는 별도 도구 (google-java-format 등)
    }

    // ==================== 코드 생성 ====================

    getFileTemplate(fileType: string, fileName: string): string {
        const templates: Record<string, string> = {
            [FileType.CONTROLLER]: this.getControllerTemplate(fileName),
            [FileType.SERVICE]: this.getServiceTemplate(fileName),
            [FileType.REPOSITORY]: this.getRepositoryTemplate(fileName),
            [FileType.MODEL]: this.getEntityTemplate(fileName),
            [FileType.CONFIG]: this.getConfigTemplate(fileName),
        };
        return templates[fileType] || '';
    }

    getComponentTemplate(componentName: string, options?: ComponentOptions): string {
        // Spring Boot에서는 Controller가 컴포넌트 역할
        return this.getControllerTemplate(componentName);
    }

    getConfigFileTemplate(configType: string): string {
        const templates: Record<string, string> = {
            'application.properties': `# Spring Boot Application Properties
spring.application.name=\${project.name}
server.port=8080

# Database
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driverClassName=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=

# JPA
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true`,

            'application.yml': `spring:
  application:
    name: \${project.name}
  datasource:
    url: jdbc:h2:mem:testdb
    driver-class-name: org.h2.Driver
    username: sa
    password:
  jpa:
    database-platform: org.hibernate.dialect.H2Dialect
    hibernate:
      ddl-auto: update
    show-sql: true

server:
  port: 8080`,
        };
        return templates[configType] || '';
    }

    getImportStatement(moduleName: string, items?: string[]): string {
        if (items && items.length > 0) {
            return items.map(item => `import ${moduleName}.${item};`).join('\n');
        }
        return `import ${moduleName};`;
    }

    // ==================== 에러 처리 ====================

    getErrorPatterns(): ErrorPattern[] {
        return [
            {
                pattern: /NoSuchBeanDefinitionException.*No qualifying bean of type ['"]([^'"]+)['"]/,
                errorType: 'BEAN_NOT_FOUND',
                description: 'Spring Bean을 찾을 수 없음',
                commonCauses: ['@Component/@Service 어노테이션 누락', '@ComponentScan 설정 오류', '빈 생성 조건 불충족'],
            },
            {
                pattern: /UnsatisfiedDependencyException/,
                errorType: 'DEPENDENCY_INJECTION_FAILED',
                description: '의존성 주입 실패',
                commonCauses: ['순환 참조', '빈 생성 실패', '생성자 인자 오류'],
            },
            {
                pattern: /BeanCreationException.*Error creating bean with name ['"]([^'"]+)['"]/,
                errorType: 'BEAN_CREATION_FAILED',
                description: 'Bean 생성 실패',
                commonCauses: ['초기화 오류', '프로퍼티 설정 오류', '생성자 예외'],
            },
            {
                pattern: /Failed to configure a DataSource/,
                errorType: 'DATASOURCE_CONFIG_ERROR',
                description: 'DataSource 설정 오류',
                commonCauses: ['데이터베이스 설정 누락', 'JDBC 드라이버 미설치', '잘못된 DB URL'],
            },
            {
                pattern: /Port (\d+) is already in use/,
                errorType: 'PORT_IN_USE',
                description: '포트가 이미 사용 중',
                commonCauses: ['다른 애플리케이션이 같은 포트 사용', '이전 인스턴스가 종료되지 않음'],
            },
        ];
    }

    suggestErrorFix(error: FrameworkError): ErrorFixSuggestion | null {
        // BEAN_NOT_FOUND 에러 처리
        if (error.type === 'BEAN_NOT_FOUND') {
            const match = error.message.match(/No qualifying bean of type ['"]([^'"]+)['"]/);
            if (match) {
                const beanType = match[1];
                return {
                    diagnosis: `'${beanType}' 타입의 Bean을 찾을 수 없습니다.`,
                    suggestedFix: `해당 클래스에 @Component, @Service, 또는 @Repository 어노테이션을 추가하거나, @Configuration 클래스에서 @Bean으로 정의하세요.`,
                    filestoModify: [{
                        path: `src/main/java/**/${beanType}.java`,
                        changes: '@Service 어노테이션 추가',
                    }],
                };
            }
        }

        // PORT_IN_USE 에러 처리
        if (error.type === 'PORT_IN_USE') {
            const match = error.message.match(/Port (\d+) is already in use/);
            if (match) {
                const port = match[1];
                return {
                    diagnosis: `포트 ${port}가 이미 사용 중입니다.`,
                    suggestedFix: `application.properties에서 다른 포트로 변경하거나, 사용 중인 프로세스를 종료하세요.`,
                    commands: [
                        `lsof -ti:${port} | xargs kill -9`, // macOS/Linux
                        `netstat -ano | findstr :${port}`, // Windows
                    ],
                    filestoModify: [{
                        path: 'src/main/resources/application.properties',
                        changes: `server.port=8081 # 또는 다른 사용 가능한 포트`,
                    }],
                };
            }
        }

        // DATASOURCE_CONFIG_ERROR 처리
        if (error.type === 'DATASOURCE_CONFIG_ERROR') {
            return {
                diagnosis: 'DataSource 설정이 누락되었거나 잘못되었습니다.',
                suggestedFix: 'application.properties에 데이터베이스 설정을 추가하세요.',
                filestoModify: [{
                    path: 'src/main/resources/application.properties',
                    changes: `spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=`,
                }],
            };
        }

        return null;
    }

    // ==================== 프로젝트 타입 감지 ====================

    static async detect(projectPath: string): Promise<boolean> {
        try {
            const pomPath = path.join(projectPath, 'pom.xml');
            const gradlePath = path.join(projectPath, 'build.gradle');
            const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');

            const hasPom = await fs.access(pomPath).then(() => true).catch(() => false);
            const hasGradle = await fs.access(gradlePath).then(() => true).catch(() => false);
            const hasGradleKts = await fs.access(gradleKtsPath).then(() => true).catch(() => false);

            if (!hasPom && !hasGradle && !hasGradleKts) {
                return false;
            }

            // Spring Boot 의존성 확인
            if (hasPom) {
                const content = await fs.readFile(pomPath, 'utf-8');
                return content.includes('spring-boot');
            }

            if (hasGradle || hasGradleKts) {
                const gradleFile = hasGradle ? gradlePath : gradleKtsPath;
                const content = await fs.readFile(gradleFile, 'utf-8');
                return content.includes('spring-boot');
            }

            return false;
        } catch {
            return false;
        }
    }

    async extractProjectMetadata(projectPath: string): Promise<ProjectMetadata> {
        if (this.buildTool === 'maven') {
            return this.extractMavenMetadata(projectPath);
        } else {
            return this.extractGradleMetadata(projectPath);
        }
    }

    // ==================== Private 헬퍼 메서드 ====================

    private getControllerTemplate(controllerName: string): string {
        return `package com.example.demo.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/${controllerName.toLowerCase()}")
public class ${controllerName}Controller {

    @GetMapping
    public String get() {
        return "${controllerName} GET";
    }

    @PostMapping
    public String post(@RequestBody String body) {
        return "${controllerName} POST: " + body;
    }
}`;
    }

    private getServiceTemplate(serviceName: string): string {
        return `package com.example.demo.service;

import org.springframework.stereotype.Service;

@Service
public class ${serviceName}Service {

    public void execute() {
        // 비즈니스 로직 구현
    }
}`;
    }

    private getRepositoryTemplate(repositoryName: string): string {
        return `package com.example.demo.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.example.demo.entity.${repositoryName}Entity;

@Repository
public interface ${repositoryName}Repository extends JpaRepository<${repositoryName}Entity, Long> {
    // 커스텀 쿼리 메서드
}`;
    }

    private getEntityTemplate(entityName: string): string {
        return `package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Data
@Table(name = "${entityName.toLowerCase()}")
public class ${entityName}Entity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 필드 정의
}`;
    }

    private getConfigTemplate(configName: string): string {
        return `package com.example.demo.config;

import org.springframework.context.annotation.Configuration;

@Configuration
public class ${configName}Config {

    // 설정 정의
}`;
    }

    private async extractMavenMetadata(projectPath: string): Promise<ProjectMetadata> {
        const pomPath = path.join(projectPath, 'pom.xml');
        const content = await fs.readFile(pomPath, 'utf-8');

        // 간단한 XML 파싱 (실제로는 xml2js 같은 라이브러리 사용 권장)
        const nameMatch = content.match(/<artifactId>([^<]+)<\/artifactId>/);
        const versionMatch = content.match(/<version>([^<]+)<\/version>/);

        return {
            name: nameMatch ? nameMatch[1] : 'unknown',
            version: versionMatch ? versionMatch[1] : '0.0.1-SNAPSHOT',
            dependencies: {},
            mainEntryPoint: 'src/main/java/com/example/demo/DemoApplication.java',
        };
    }

    private async extractGradleMetadata(projectPath: string): Promise<ProjectMetadata> {
        const gradlePath = path.join(projectPath, 'build.gradle');
        const content = await fs.readFile(gradlePath, 'utf-8');

        return {
            name: 'gradle-project',
            version: '0.0.1-SNAPSHOT',
            dependencies: {},
            mainEntryPoint: 'src/main/java/com/example/demo/DemoApplication.java',
        };
    }
}

