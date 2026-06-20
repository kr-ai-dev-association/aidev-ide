import * as vscode from "vscode";
import { CommandContext } from "./types";

/**
 * Git 관련 커맨드 등록
 *
 * gitStatus, gitDiff, gitLog, gitBranch, gitInfo, gitStaged, gitStash
 * + 워크스페이스 변경 시 Git 리포지토리 정보 업데이트
 */
export function registerGitCommands(deps: CommandContext): vscode.Disposable[] {
  const { chatViewProvider } = deps;

  const postSystem = (text: string) =>
    chatViewProvider.postMessageToWebview({
      command: "receiveMessage",
      sender: "System",
      text,
    });

  /** child_process.exec의 promisified 버전 */
  const execGit = async (cmd: string, cwd: string): Promise<string> => {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(cmd, { cwd });
    return stdout as string;
  };

  const getWorkspaceCwd = (): string | undefined =>
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const requireWorkspace = (): string | null => {
    const cwd = getWorkspaceCwd();
    if (!cwd) {
      postSystem("워크스페이스가 열려있지 않습니다.");
    }
    return cwd || null;
  };

  return [
    // Git 상태 보기
    vscode.commands.registerCommand("codepilot.gitStatus", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const stdout = await execGit("git status", cwd);
        postSystem(`### Git 상태\n\n\`\`\`\n${stdout}\n\`\`\``);
      } catch (error: any) {
        postSystem(`Git 상태 확인 실패: ${error.message || error}`);
      }
    }),

    // Git 변경사항 보기
    vscode.commands.registerCommand("codepilot.gitDiff", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const stdout = await execGit("git diff --stat", cwd);
        if (!stdout.trim()) {
          postSystem("### Git 변경사항\n\n변경된 파일이 없습니다.");
          return;
        }
        postSystem(`### Git 변경사항\n\n\`\`\`\n${stdout}\n\`\`\``);
      } catch (error: any) {
        postSystem(`Git 변경사항 확인 실패: ${error.message || error}`);
      }
    }),

    // Git 히스토리 보기
    vscode.commands.registerCommand("codepilot.gitLog", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const stdout = await execGit("git log --oneline -15", cwd);
        postSystem(
          `Git 커밋 히스토리 (최근 15개)\n\n\`\`\`\n${stdout}\n\`\`\``,
        );
      } catch (error: any) {
        postSystem(`Git 히스토리 확인 실패: ${error.message || error}`);
      }
    }),

    // Git 브랜치 목록
    vscode.commands.registerCommand("codepilot.gitBranch", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const localBranches = await execGit("git branch", cwd);
        const remoteBranches = await execGit("git branch -r", cwd);
        postSystem(
          `### Git 브랜치 목록\n\n**로컬 브랜치:**\n\`\`\`\n${localBranches}\n\`\`\`\n\n**원격 브랜치:**\n\`\`\`\n${remoteBranches}\n\`\`\``,
        );
      } catch (error: any) {
        postSystem(`Git 브랜치 확인 실패: ${error.message || error}`);
      }
    }),

    // Git 리포지토리 정보
    vscode.commands.registerCommand("codepilot.gitInfo", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const branch = (
          await execGit("git rev-parse --abbrev-ref HEAD", cwd)
        ).trim();
        const remoteUrl = (
          await execGit("git remote get-url origin", cwd).catch(() => "")
        ).trim();
        const remoteName =
          (await execGit("git remote", cwd).catch(() => ""))
            .trim()
            .split("\n")[0] || "(none)";
        if (!remoteUrl) {
          postSystem(
            "### ℹGit 리포지토리 정보\n\nGit 리포지토리가 감지되지 않았습니다.",
          );
          return;
        }
        const match = remoteUrl.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
        const owner = match?.[1] || "(unknown)";
        const repo = match?.[2] || "(unknown)";
        const isGitHub = remoteUrl.includes("github.com");
        postSystem(
          `### ℹGit 리포지토리 정보\n\n` +
            `- **소유자**: ${owner}\n` +
            `- **리포지토리**: ${repo}\n` +
            `- **현재 브랜치**: ${branch}\n` +
            `- **원격 저장소**: ${remoteName}\n` +
            `- **URL**: ${remoteUrl}\n` +
            `- **GitHub**: ${isGitHub ? "✅" : "❌"}`,
        );
      } catch (error: any) {
        postSystem(`Git 정보 확인 실패: ${error.message || error}`);
      }
    }),

    // Git 스테이징된 변경사항 보기
    vscode.commands.registerCommand("codepilot.gitStaged", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const stdout = await execGit("git diff --staged --stat", cwd);
        if (!stdout.trim()) {
          postSystem("### 스테이징된 변경사항\n\n스테이징된 파일이 없습니다.");
          return;
        }
        postSystem(`### 스테이징된 변경사항\n\n\`\`\`\n${stdout}\n\`\`\``);
      } catch (error: any) {
        postSystem(`스테이징 변경사항 확인 실패: ${error.message || error}`);
      }
    }),

    // Git Stash 목록 보기
    vscode.commands.registerCommand("codepilot.gitStash", async () => {
      try {
        const cwd = requireWorkspace();
        if (!cwd) return;
        const stdout = await execGit("git stash list", cwd);
        if (!stdout.trim()) {
          postSystem("### Git Stash 목록\n\n저장된 stash가 없습니다.");
          return;
        }
        postSystem(`### Git Stash 목록\n\n\`\`\`\n${stdout}\n\`\`\``);
      } catch (error: any) {
        postSystem(`Stash 목록 확인 실패: ${error.message || error}`);
      }
    }),
  ];
}
