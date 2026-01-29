import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitRepositoryInfo {
    owner: string;
    repo: string;
    url: string;
    branch: string;
    remoteName: string;
    isGitHub: boolean;
}

export class GitRepositoryService {
    private static readonly GIT_REPO_KEY = 'aidev.gitRepositoryInfo';
    private static readonly GIT_REMOTE_KEY = 'aidev.gitRemoteInfo';

    constructor(private context: vscode.ExtensionContext) { }

    /**
     * 프로젝트 루트에서 Git 리포지토리 정보를 자동으로 감지하고 저장
     */
    async detectAndSaveRepositoryInfo(projectRoot: string): Promise<GitRepositoryInfo | null> {
        try {
            const gitInfo = await this.getGitRepositoryInfo(projectRoot);

            if (gitInfo) {
                // VS Code 설정에 저장
                await this.saveRepositoryInfo(gitInfo);

                // 글로벌 상태에 저장
                await this.context.globalState.update(GitRepositoryService.GIT_REPO_KEY, gitInfo);

                console.log(`[GitRepositoryService] Git 리포지토리 정보 저장됨: ${gitInfo.owner}/${gitInfo.repo}`);
                return gitInfo;
            }
        } catch (error) {
            console.log('[GitRepositoryService] Git 리포지토리가 아니거나 정보를 가져올 수 없습니다.');
        }

        return null;
    }

    /**
     * 저장된 Git 리포지토리 정보 조회
     */
    async getRepositoryInfo(): Promise<GitRepositoryInfo | null> {
        try {
            // 글로벌 상태에서 조회
            const gitInfo = this.context.globalState.get<GitRepositoryInfo>(GitRepositoryService.GIT_REPO_KEY);

            if (gitInfo) {
                return gitInfo;
            }

            // 워크스페이스 설정에서 조회
            const workspaceGitInfo = vscode.workspace.getConfiguration('aidev').get<GitRepositoryInfo>('gitRepositoryInfo');

            if (workspaceGitInfo) {
                return workspaceGitInfo;
            }

            return null;
        } catch (error) {
            console.error('[GitRepositoryService] Git 리포지토리 정보 조회 실패:', error);
            return null;
        }
    }

    /**
     * Git 리포지토리 정보를 VS Code 설정에 저장
     */
    private async saveRepositoryInfo(gitInfo: GitRepositoryInfo): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('aidev');
            await config.update('gitRepositoryInfo', gitInfo, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            console.error('[GitRepositoryService] Git 리포지토리 정보 저장 실패:', error);
        }
    }

    /**
     * 프로젝트 루트에서 Git 리포지토리 정보 추출
     */
    private async getGitRepositoryInfo(projectRoot: string): Promise<GitRepositoryInfo | null> {
        try {
            // .git 디렉토리 존재 확인
            const gitDir = path.join(projectRoot, '.git');
            const gitDirExists = await this.directoryExists(gitDir);

            if (!gitDirExists) {
                return null;
            }

            // 현재 브랜치 정보 가져오기
            const currentBranch = await this.getCurrentBranch(projectRoot);

            // 원격 저장소 정보 가져오기
            const remoteInfo = await this.getRemoteInfo(projectRoot);

            if (!remoteInfo) {
                return null;
            }

            // GitHub URL인지 확인
            const isGitHub = this.isGitHubUrl(remoteInfo.url);

            if (!isGitHub) {
                console.log('[GitRepositoryService] GitHub 리포지토리가 아닙니다.');
                return null;
            }

            // owner와 repo 이름 추출
            const { owner, repo } = this.parseGitHubUrl(remoteInfo.url);

            if (!owner || !repo) {
                console.log('[GitRepositoryService] GitHub URL을 파싱할 수 없습니다.');
                return null;
            }

            return {
                owner,
                repo,
                url: remoteInfo.url,
                branch: currentBranch,
                remoteName: remoteInfo.name,
                isGitHub: true
            };
        } catch (error) {
            console.error('[GitRepositoryService] Git 리포지토리 정보 추출 실패:', error);
            return null;
        }
    }

    /**
     * 현재 브랜치 정보 가져오기
     */
    private async getCurrentBranch(projectRoot: string): Promise<string> {
        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: projectRoot });
            return stdout.trim();
        } catch (error) {
            console.error('[GitRepositoryService] 현재 브랜치 정보 가져오기 실패:', error);
            return 'main';
        }
    }

    /**
     * 원격 저장소 정보 가져오기
     */
    private async getRemoteInfo(projectRoot: string): Promise<{ name: string; url: string } | null> {
        try {
            // origin 원격 저장소 정보 가져오기
            const { stdout } = await execAsync('git remote get-url origin', { cwd: projectRoot });
            const url = stdout.trim();

            if (url) {
                return { name: 'origin', url };
            }

            // origin이 없으면 첫 번째 원격 저장소 사용
            const { stdout: remotes } = await execAsync('git remote', { cwd: projectRoot });
            const remoteNames = remotes.trim().split('\n').filter(name => name.trim());

            if (remoteNames.length > 0) {
                const { stdout: remoteUrl } = await execAsync(`git remote get-url ${remoteNames[0]}`, { cwd: projectRoot });
                return { name: remoteNames[0], url: remoteUrl.trim() };
            }

            return null;
        } catch (error) {
            console.error('[GitRepositoryService] 원격 저장소 정보 가져오기 실패:', error);
            return null;
        }
    }

    /**
     * GitHub URL인지 확인
     */
    private isGitHubUrl(url: string): boolean {
        return url.includes('github.com') || url.includes('github.io');
    }

    /**
     * GitHub URL에서 owner와 repo 이름 추출
     */
    private parseGitHubUrl(url: string): { owner: string | null; repo: string | null } {
        try {
            // SSH 형식: git@github.com:owner/repo.git
            if (url.startsWith('git@github.com:')) {
                const match = url.match(/git@github\.com:([^/]+)\/(.+)\.git$/);
                if (match) {
                    return { owner: match[1], repo: match[2] };
                }
            }

            // HTTPS 형식: https://github.com/owner/repo.git 또는 https://github.com/owner/repo
            if (url.includes('github.com/')) {
                const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
                if (match) {
                    return { owner: match[1], repo: match[2] };
                }
            }

            return { owner: null, repo: null };
        } catch (error) {
            console.error('[GitRepositoryService] GitHub URL 파싱 실패:', error);
            return { owner: null, repo: null };
        }
    }

    /**
     * 디렉토리 존재 여부 확인
     */
    private async directoryExists(dirPath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(dirPath);
            return stats.isDirectory();
        } catch (error) {
            return false;
        }
    }

    /**
     * Git 리포지토리 정보 초기화
     */
    async clearRepositoryInfo(): Promise<void> {
        try {
            await this.context.globalState.update(GitRepositoryService.GIT_REPO_KEY, undefined);

            const config = vscode.workspace.getConfiguration('aidev');
            await config.update('gitRepositoryInfo', undefined, vscode.ConfigurationTarget.Workspace);

            console.log('[GitRepositoryService] Git 리포지토리 정보 초기화됨');
        } catch (error) {
            console.error('[GitRepositoryService] Git 리포지토리 정보 초기화 실패:', error);
        }
    }

    /**
     * Git 리포지토리 정보 업데이트
     */
    async updateRepositoryInfo(projectRoot: string): Promise<GitRepositoryInfo | null> {
        try {
            // 기존 정보 초기화
            await this.clearRepositoryInfo();

            // 새 정보 감지 및 저장
            return await this.detectAndSaveRepositoryInfo(projectRoot);
        } catch (error) {
            console.error('[GitRepositoryService] Git 리포지토리 정보 업데이트 실패:', error);
            return null;
        }
    }

    /**
     * Git 명령어 실행을 위한 컨텍스트 정보 생성
     */
    async getGitContextForLlm(): Promise<string> {
        const gitInfo = await this.getRepositoryInfo();

        if (!gitInfo) {
            return '';
        }

        return `
## Git 리포지토리 정보
- **리포지토리**: ${gitInfo.owner}/${gitInfo.repo}
- **URL**: ${gitInfo.url}
- **현재 브랜치**: ${gitInfo.branch}
- **원격 저장소**: ${gitInfo.remoteName}
- **GitHub MCP 사용 가능**: ${gitInfo.isGitHub ? 'true' : 'false'}

GitHub 관련 작업을 요청할 때는 위 정보를 참고하여 작업하세요.
현재 브랜치에서 작업하고 있으며, 원격 저장소는 ${gitInfo.remoteName}입니다.
`;
    }
}

