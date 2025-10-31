import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitRepositoryService } from './gitRepositoryService';

const execAsync = promisify(exec);

export interface BranchIssue {
    branch: string;
    issue: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'bug' | 'feature' | 'performance' | 'security' | 'refactor' | 'documentation' | 'test';
    description: string;
    suggestedFix: string;
    priority: number;
}

export interface BranchAnalysis {
    branch: string;
    totalIssues: number;
    issuesByCategory: Record<string, BranchIssue[]>;
    criticalIssues: BranchIssue[];
    suggestedImprovements: string[];
    branchHealth: 'excellent' | 'good' | 'needs_attention' | 'critical';
}

export interface ProjectAnalysis {
    totalBranches: number;
    totalIssues: number;
    overallHealth: 'excellent' | 'good' | 'needs_attention' | 'critical';
    branchAnalyses: BranchAnalysis[];
    crossBranchIssues: BranchIssue[];
    recommendedActions: string[];
}

export class GitBranchAnalysisService {
    private gitRepositoryService: GitRepositoryService;

    constructor(gitRepositoryService: GitRepositoryService) {
        this.gitRepositoryService = gitRepositoryService;
    }

    /**
     * 모든 브랜치의 이슈를 분석하고 개선 방안을 도출
     */
    async analyzeAllBranches(projectRoot: string): Promise<ProjectAnalysis> {
        try {
            // 모든 브랜치 목록 가져오기
            const branches = await this.getAllBranches(projectRoot);

            // 각 브랜치별 분석
            const branchAnalyses: BranchAnalysis[] = [];
            let totalIssues = 0;

            for (const branch of branches) {
                const analysis = await this.analyzeBranch(projectRoot, branch);
                branchAnalyses.push(analysis);
                totalIssues += analysis.totalIssues;
            }

            // 전체 프로젝트 분석
            const crossBranchIssues = this.identifyCrossBranchIssues(branchAnalyses);
            const recommendedActions = this.generateRecommendedActions(branchAnalyses, crossBranchIssues);
            const overallHealth = this.calculateOverallHealth(branchAnalyses);

            return {
                totalBranches: branches.length,
                totalIssues,
                overallHealth,
                branchAnalyses,
                crossBranchIssues,
                recommendedActions
            };
        } catch (error) {
            console.error('[GitBranchAnalysisService] 브랜치 분석 실패:', error);
            throw error;
        }
    }

    /**
     * 특정 브랜치의 이슈를 분석
     */
    async analyzeBranch(projectRoot: string, branch: string): Promise<BranchAnalysis> {
        try {
            // 브랜치로 전환
            await this.switchToBranch(projectRoot, branch);

            // 브랜치별 이슈 감지
            const issues = await this.detectBranchIssues(projectRoot, branch);

            // 이슈를 카테고리별로 분류
            const issuesByCategory = this.categorizeIssues(issues);

            // 심각한 이슈 식별
            const criticalIssues = issues.filter(issue =>
                issue.severity === 'critical' || issue.severity === 'high'
            );

            // 개선 방안 제안
            const suggestedImprovements = this.suggestImprovements(issues, branch);

            // 브랜치 건강도 계산
            const branchHealth = this.calculateBranchHealth(issues);

            return {
                branch,
                totalIssues: issues.length,
                issuesByCategory,
                criticalIssues,
                suggestedImprovements,
                branchHealth
            };
        } catch (error) {
            console.error(`[GitBranchAnalysisService] 브랜치 ${branch} 분석 실패:`, error);
            throw error;
        }
    }

    /**
     * 모든 브랜치 목록 가져오기
     */
    private async getAllBranches(projectRoot: string): Promise<string[]> {
        try {
            const { stdout } = await execAsync('git branch -a', { cwd: projectRoot });
            const branches = stdout
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('*'))
                .map(line => line.replace('remotes/origin/', ''))
                .filter(line => !line.includes('HEAD'))
                .filter((branch, index, self) => self.indexOf(branch) === index); // 중복 제거

            return branches;
        } catch (error) {
            console.error('[GitBranchAnalysisService] 브랜치 목록 가져오기 실패:', error);
            return [];
        }
    }

    /**
     * 브랜치로 전환
     */
    private async switchToBranch(projectRoot: string, branch: string): Promise<void> {
        try {
            await execAsync(`git checkout ${branch}`, { cwd: projectRoot });
        } catch (error) {
            console.error(`[GitBranchAnalysisService] 브랜치 ${branch} 전환 실패:`, error);
            throw error;
        }
    }

    /**
     * 브랜치별 이슈 감지
     */
    private async detectBranchIssues(projectRoot: string, branch: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            // 1. 코드 품질 이슈 감지
            const codeQualityIssues = await this.detectCodeQualityIssues(projectRoot);
            issues.push(...codeQualityIssues);

            // 2. 의존성 이슈 감지
            const dependencyIssues = await this.detectDependencyIssues(projectRoot);
            issues.push(...dependencyIssues);

            // 3. 테스트 커버리지 이슈 감지
            const testCoverageIssues = await this.detectTestCoverageIssues(projectRoot);
            issues.push(...testCoverageIssues);

            // 4. 보안 이슈 감지
            const securityIssues = await this.detectSecurityIssues(projectRoot);
            issues.push(...securityIssues);

            // 5. 성능 이슈 감지
            const performanceIssues = await this.detectPerformanceIssues(projectRoot);
            issues.push(...performanceIssues);

            // 6. 문서화 이슈 감지
            const documentationIssues = await this.detectDocumentationIssues(projectRoot);
            issues.push(...documentationIssues);

        } catch (error) {
            console.error(`[GitBranchAnalysisService] 브랜치 ${branch} 이슈 감지 실패:`, error);
        }

        return issues;
    }

    /**
     * 코드 품질 이슈 감지
     */
    private async detectCodeQualityIssues(projectRoot: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            // ESLint 오류 검사
            try {
                const { stdout } = await execAsync('npx eslint . --format json', { cwd: projectRoot });
                const eslintResults = JSON.parse(stdout);

                eslintResults.forEach((file: any) => {
                    file.messages.forEach((message: any) => {
                        issues.push({
                            branch: 'current',
                            issue: `ESLint 오류: ${message.message}`,
                            severity: message.severity === 2 ? 'high' : 'medium',
                            category: 'bug',
                            description: `파일: ${file.filePath}, 라인: ${message.line}, ${message.message}`,
                            suggestedFix: this.suggestEslintFix(message),
                            priority: message.severity === 2 ? 8 : 5
                        });
                    });
                });
            } catch (eslintError) {
                // ESLint가 설정되지 않은 경우 무시
            }

            // TypeScript 오류 검사
            try {
                const { stdout } = await execAsync('npx tsc --noEmit --pretty false', { cwd: projectRoot });
                // TypeScript 오류가 있으면 stderr에 출력됨
            } catch (tscError: any) {
                const errorOutput = tscError.stdout || tscError.stderr || '';
                if (errorOutput.includes('error TS')) {
                    const errors = errorOutput.split('\n').filter(line => line.includes('error TS'));
                    errors.forEach(error => {
                        issues.push({
                            branch: 'current',
                            issue: `TypeScript 오류: ${error}`,
                            severity: 'high',
                            category: 'bug',
                            description: error,
                            suggestedFix: 'TypeScript 오류를 수정하세요.',
                            priority: 9
                        });
                    });
                }
            }

        } catch (error) {
            console.error('[GitBranchAnalysisService] 코드 품질 이슈 감지 실패:', error);
        }

        return issues;
    }

    /**
     * 의존성 이슈 감지
     */
    private async detectDependencyIssues(projectRoot: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            // package.json이 있는 경우
            const packageJsonPath = `${projectRoot}/package.json`;
            const fs = require('fs');

            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

                // npm audit 검사
                try {
                    const { stdout } = await execAsync('npm audit --json', { cwd: projectRoot });
                    const auditResults = JSON.parse(stdout);

                    if (auditResults.vulnerabilities) {
                        Object.entries(auditResults.vulnerabilities).forEach(([pkg, vuln]: [string, any]) => {
                            issues.push({
                                branch: 'current',
                                issue: `보안 취약점: ${pkg}`,
                                severity: vuln.severity === 'high' || vuln.severity === 'critical' ? 'critical' : 'medium',
                                category: 'security',
                                description: `${pkg}: ${vuln.title} (${vuln.severity})`,
                                suggestedFix: `npm audit fix를 실행하거나 ${pkg}를 업데이트하세요.`,
                                priority: vuln.severity === 'critical' ? 10 : 7
                            });
                        });
                    }
                } catch (auditError) {
                    // npm audit이 실패한 경우 무시
                }

                // 오래된 의존성 검사
                try {
                    const { stdout } = await execAsync('npm outdated --json', { cwd: projectRoot });
                    const outdatedResults = JSON.parse(stdout);

                    Object.entries(outdatedResults).forEach(([pkg, info]: [string, any]) => {
                        issues.push({
                            branch: 'current',
                            issue: `오래된 의존성: ${pkg}`,
                            severity: 'low',
                            category: 'performance',
                            description: `${pkg}: ${info.current} → ${info.latest}`,
                            suggestedFix: `npm update ${pkg}를 실행하여 최신 버전으로 업데이트하세요.`,
                            priority: 3
                        });
                    });
                } catch (outdatedError) {
                    // npm outdated가 실패한 경우 무시
                }
            }

        } catch (error) {
            console.error('[GitBranchAnalysisService] 의존성 이슈 감지 실패:', error);
        }

        return issues;
    }

    /**
     * 테스트 커버리지 이슈 감지
     */
    private async detectTestCoverageIssues(projectRoot: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            // Jest 테스트 커버리지 검사
            try {
                const { stdout } = await execAsync('npx jest --coverage --coverageReporters=json', { cwd: projectRoot });
                // Jest 커버리지 결과는 파일로 저장되므로 별도로 읽어야 함
            } catch (jestError) {
                // Jest가 설정되지 않은 경우 무시
            }

            // 테스트 파일 존재 여부 검사
            const fs = require('fs');
            const testFiles = this.findTestFiles(projectRoot);

            if (testFiles.length === 0) {
                issues.push({
                    branch: 'current',
                    issue: '테스트 파일이 없습니다',
                    severity: 'medium',
                    category: 'test',
                    description: '프로젝트에 테스트 파일이 없습니다.',
                    suggestedFix: '단위 테스트와 통합 테스트를 작성하세요.',
                    priority: 6
                });
            }

        } catch (error) {
            console.error('[GitBranchAnalysisService] 테스트 커버리지 이슈 감지 실패:', error);
        }

        return issues;
    }

    /**
     * 보안 이슈 감지
     */
    private async detectSecurityIssues(projectRoot: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            // 하드코딩된 비밀번호나 API 키 검사
            const fs = require('fs');
            const files = this.getAllSourceFiles(projectRoot);

            files.forEach(file => {
                const content = fs.readFileSync(file, 'utf8');

                // 일반적인 비밀번호 패턴 검사
                const passwordPatterns = [
                    /password\s*=\s*["'][^"']+["']/gi,
                    /api[_-]?key\s*=\s*["'][^"']+["']/gi,
                    /secret\s*=\s*["'][^"']+["']/gi,
                    /token\s*=\s*["'][^"']+["']/gi
                ];

                passwordPatterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            issues.push({
                                branch: 'current',
                                issue: '하드코딩된 비밀 정보',
                                severity: 'critical',
                                category: 'security',
                                description: `파일: ${file}, 발견된 패턴: ${match}`,
                                suggestedFix: '환경 변수나 설정 파일을 사용하여 비밀 정보를 관리하세요.',
                                priority: 10
                            });
                        });
                    }
                });
            });

        } catch (error) {
            console.error('[GitBranchAnalysisService] 보안 이슈 감지 실패:', error);
        }

        return issues;
    }

    /**
     * 성능 이슈 감지
     */
    private async detectPerformanceIssues(projectRoot: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            // 큰 파일 검사
            const fs = require('fs');
            const files = this.getAllSourceFiles(projectRoot);

            files.forEach(file => {
                const stats = fs.statSync(file);
                const fileSizeKB = stats.size / 1024;

                if (fileSizeKB > 1000) { // 1MB 이상
                    issues.push({
                        branch: 'current',
                        issue: '큰 파일 크기',
                        severity: 'medium',
                        category: 'performance',
                        description: `파일: ${file}, 크기: ${fileSizeKB.toFixed(2)}KB`,
                        suggestedFix: '파일을 더 작은 모듈로 분할하거나 불필요한 코드를 제거하세요.',
                        priority: 4
                    });
                }
            });

            // 중복 코드 검사 (간단한 버전)
            const duplicateCodeIssues = this.detectDuplicateCode(projectRoot);
            issues.push(...duplicateCodeIssues);

        } catch (error) {
            console.error('[GitBranchAnalysisService] 성능 이슈 감지 실패:', error);
        }

        return issues;
    }

    /**
     * 문서화 이슈 감지
     */
    private async detectDocumentationIssues(projectRoot: string): Promise<BranchIssue[]> {
        const issues: BranchIssue[] = [];

        try {
            const fs = require('fs');

            // README 파일 검사
            if (!fs.existsSync(`${projectRoot}/README.md`)) {
                issues.push({
                    branch: 'current',
                    issue: 'README.md 파일이 없습니다',
                    severity: 'medium',
                    category: 'documentation',
                    description: '프로젝트에 README.md 파일이 없습니다.',
                    suggestedFix: '프로젝트 설명, 설치 방법, 사용법을 포함한 README.md 파일을 작성하세요.',
                    priority: 5
                });
            }

            // API 문서 검사
            const apiDocFiles = this.findApiDocFiles(projectRoot);
            if (apiDocFiles.length === 0) {
                issues.push({
                    branch: 'current',
                    issue: 'API 문서가 없습니다',
                    severity: 'low',
                    category: 'documentation',
                    description: 'API 문서가 없습니다.',
                    suggestedFix: 'API 사용법과 예제를 포함한 문서를 작성하세요.',
                    priority: 3
                });
            }

        } catch (error) {
            console.error('[GitBranchAnalysisService] 문서화 이슈 감지 실패:', error);
        }

        return issues;
    }

    /**
     * 이슈를 카테고리별로 분류
     */
    private categorizeIssues(issues: BranchIssue[]): Record<string, BranchIssue[]> {
        const categorized: Record<string, BranchIssue[]> = {};

        issues.forEach(issue => {
            if (!categorized[issue.category]) {
                categorized[issue.category] = [];
            }
            categorized[issue.category].push(issue);
        });

        return categorized;
    }

    /**
     * 개선 방안 제안
     */
    private suggestImprovements(issues: BranchIssue[], branch: string): string[] {
        const improvements: string[] = [];

        const criticalIssues = issues.filter(issue => issue.severity === 'critical');
        const highIssues = issues.filter(issue => issue.severity === 'high');

        if (criticalIssues.length > 0) {
            improvements.push(`🚨 ${criticalIssues.length}개의 심각한 이슈를 즉시 수정하세요.`);
        }

        if (highIssues.length > 0) {
            improvements.push(`⚠️ ${highIssues.length}개의 높은 우선순위 이슈를 우선적으로 처리하세요.`);
        }

        const categories = Object.keys(this.categorizeIssues(issues));
        if (categories.includes('security')) {
            improvements.push('🔒 보안 이슈를 검토하고 수정하세요.');
        }

        if (categories.includes('test')) {
            improvements.push('🧪 테스트 커버리지를 개선하세요.');
        }

        if (categories.includes('performance')) {
            improvements.push('⚡ 성능 최적화를 고려하세요.');
        }

        if (categories.includes('documentation')) {
            improvements.push('📚 문서화를 개선하세요.');
        }

        return improvements;
    }

    /**
     * 브랜치 건강도 계산
     */
    private calculateBranchHealth(issues: BranchIssue[]): 'excellent' | 'good' | 'needs_attention' | 'critical' {
        const criticalCount = issues.filter(issue => issue.severity === 'critical').length;
        const highCount = issues.filter(issue => issue.severity === 'high').length;
        const totalCount = issues.length;

        if (criticalCount > 0) return 'critical';
        if (highCount > 2 || totalCount > 10) return 'needs_attention';
        if (totalCount > 5) return 'good';
        return 'excellent';
    }

    /**
     * 전체 프로젝트 건강도 계산
     */
    private calculateOverallHealth(branchAnalyses: BranchAnalysis[]): 'excellent' | 'good' | 'needs_attention' | 'critical' {
        const criticalBranches = branchAnalyses.filter(branch => branch.branchHealth === 'critical').length;
        const needsAttentionBranches = branchAnalyses.filter(branch => branch.branchHealth === 'needs_attention').length;

        if (criticalBranches > 0) return 'critical';
        if (needsAttentionBranches > branchAnalyses.length / 2) return 'needs_attention';
        if (needsAttentionBranches > 0) return 'good';
        return 'excellent';
    }

    /**
     * 브랜치 간 공통 이슈 식별
     */
    private identifyCrossBranchIssues(branchAnalyses: BranchAnalysis[]): BranchIssue[] {
        const crossBranchIssues: BranchIssue[] = [];

        // 모든 브랜치에서 공통으로 발견되는 이슈 패턴 찾기
        const allIssues = branchAnalyses.flatMap(branch =>
            branch.issuesByCategory.bug || []
        );

        // 중복된 이슈 패턴 찾기
        const issuePatterns = new Map<string, number>();
        allIssues.forEach(issue => {
            const pattern = issue.issue.toLowerCase();
            issuePatterns.set(pattern, (issuePatterns.get(pattern) || 0) + 1);
        });

        // 여러 브랜치에서 발견된 이슈
        issuePatterns.forEach((count, pattern) => {
            if (count > 1) {
                const sampleIssue = allIssues.find(issue => issue.issue.toLowerCase() === pattern);
                if (sampleIssue) {
                    crossBranchIssues.push({
                        ...sampleIssue,
                        issue: `[공통] ${sampleIssue.issue}`,
                        description: `${count}개 브랜치에서 발견된 이슈: ${sampleIssue.description}`,
                        priority: sampleIssue.priority + 2 // 공통 이슈는 우선순위 증가
                    });
                }
            }
        });

        return crossBranchIssues;
    }

    /**
     * 권장 액션 생성
     */
    private generateRecommendedActions(branchAnalyses: BranchAnalysis[], crossBranchIssues: BranchIssue[]): string[] {
        const actions: string[] = [];

        // 공통 이슈 우선 처리
        if (crossBranchIssues.length > 0) {
            actions.push(`🎯 ${crossBranchIssues.length}개의 공통 이슈를 우선적으로 수정하세요.`);
        }

        // 브랜치별 우선순위 정렬
        const sortedBranches = branchAnalyses.sort((a, b) => {
            const healthOrder = { 'critical': 4, 'needs_attention': 3, 'good': 2, 'excellent': 1 };
            return healthOrder[b.health] - healthOrder[a.health];
        });

        // 가장 문제가 많은 브랜치 식별
        const problematicBranches = sortedBranches.filter(branch =>
            branch.branchHealth === 'critical' || branch.branchHealth === 'needs_attention'
        );

        if (problematicBranches.length > 0) {
            actions.push(`🔧 다음 브랜치들을 우선적으로 개선하세요: ${problematicBranches.map(b => b.branch).join(', ')}`);
        }

        // 카테고리별 액션 제안
        const allIssues = branchAnalyses.flatMap(branch =>
            Object.values(branch.issuesByCategory).flat()
        );

        const categories = new Set(allIssues.map(issue => issue.category));

        if (categories.has('security')) {
            actions.push('🔒 보안 이슈를 즉시 검토하고 수정하세요.');
        }

        if (categories.has('test')) {
            actions.push('🧪 테스트 전략을 수립하고 커버리지를 개선하세요.');
        }

        if (categories.has('performance')) {
            actions.push('⚡ 성능 모니터링을 설정하고 최적화를 진행하세요.');
        }

        if (categories.has('documentation')) {
            actions.push('📚 문서화 표준을 수립하고 자동화하세요.');
        }

        return actions;
    }

    // 유틸리티 메서드들
    private suggestEslintFix(message: any): string {
        if (message.ruleId) {
            return `ESLint 규칙 '${message.ruleId}'에 따라 코드를 수정하세요.`;
        }
        return 'ESLint 오류를 수정하세요.';
    }

    private findTestFiles(projectRoot: string): string[] {
        const fs = require('fs');
        const path = require('path');
        const testFiles: string[] = [];

        const findFiles = (dir: string) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    findFiles(filePath);
                } else if (stat.isFile() && (file.includes('.test.') || file.includes('.spec.') || file.endsWith('Test.js') || file.endsWith('Spec.js'))) {
                    testFiles.push(filePath);
                }
            });
        };

        findFiles(projectRoot);
        return testFiles;
    }

    private getAllSourceFiles(projectRoot: string): string[] {
        const fs = require('fs');
        const path = require('path');
        const sourceFiles: string[] = [];

        const findFiles = (dir: string) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    findFiles(filePath);
                } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.jsx') || file.endsWith('.tsx'))) {
                    sourceFiles.push(filePath);
                }
            });
        };

        findFiles(projectRoot);
        return sourceFiles;
    }

    private detectDuplicateCode(projectRoot: string): BranchIssue[] {
        // 간단한 중복 코드 감지 (실제로는 더 정교한 알고리즘이 필요)
        const issues: BranchIssue[] = [];
        // TODO: 중복 코드 감지 로직 구현
        return issues;
    }

    private findApiDocFiles(projectRoot: string): string[] {
        const fs = require('fs');
        const path = require('path');
        const apiDocFiles: string[] = [];

        const findFiles = (dir: string) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    findFiles(filePath);
                } else if (stat.isFile() && (file.includes('api') || file.includes('doc') || file.endsWith('.md'))) {
                    apiDocFiles.push(filePath);
                }
            });
        };

        findFiles(projectRoot);
        return apiDocFiles;
    }
}

