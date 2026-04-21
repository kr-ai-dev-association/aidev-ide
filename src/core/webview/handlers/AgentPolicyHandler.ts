import * as vscode from "vscode";
import * as path from "path";
import { StateManager } from "../../managers/state/StateManager";

/**
 * 웹뷰에 안전하게 메시지를 전송하는 헬퍼 함수
 */
function safePostMessage(panel: vscode.WebviewPanel, message: any): void {
  try {
    if (panel && !panel.webview) {
      return;
    }
    panel.webview.postMessage(message);
  } catch (error) {}
}

interface NotificationServiceLike {
  showInfoMessage(msg: string): void;
  showErrorMessage(msg: string): void;
}

const AGENT_POLICY_COMMANDS = new Set([
  "uploadAgentPolicyStableVersion",
  "uploadAgentPolicyCodingStyle",
  "uploadAgentPolicyProjectArchitecture",
  "uploadAgentPolicyDependencyPolicy",
  "uploadAgentPolicyDbPolicy",
  "getAgentPolicyStableVersion",
  "getAgentPolicyCodingStyle",
  "getAgentPolicyProjectArchitecture",
  "getAgentPolicyDependencyPolicy",
  "getAgentPolicyDbPolicy",
  "deleteAgentPolicyStableVersion",
  "deleteAgentPolicyCodingStyle",
  "deleteAgentPolicyProjectArchitecture",
  "deleteAgentPolicyDependencyPolicy",
  "deleteAgentPolicyDbPolicy",
  "addAgentPolicyFile",
  "addPathAgentPolicy",
  "deleteAgentPolicyFile",
  "listAllAgentPolicyFiles",
  "downloadSkillFromUrl",
  "previewAgentPolicyPath",
]);

// URL Skill 다운로드 제약 (Transport & SSRF 검증은 현재 스코프 외)
const MAX_SKILL_SIZE = 1024 * 1024; // 1 MB
const ACCEPTED_CONTENT_TYPES = [
  "text/markdown",
  "text/plain",
  "text/x-markdown",
  "application/x-markdown",
];

function deriveSkillFilename(rawUrl: string): string {
  let base = "skill";
  try {
    const u = new URL(rawUrl);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last) base = last;
  } catch {
    /* invalid URL → default */
  }
  let clean = base.replace(/[^\w.-]/g, "_").replace(/_+/g, "_");
  clean = clean.replace(/^\.+/, "");
  if (clean.includes("..")) clean = clean.replace(/\.\.+/g, "_");
  if (!clean.endsWith(".md") && !clean.endsWith(".markdown")) {
    clean = clean.replace(/\.[^.]+$/, "") + ".md";
  }
  if (clean.length > 80) clean = clean.slice(0, 76) + ".md";
  return clean || "skill.md";
}

function detectSuspiciousPatterns(content: string): string[] {
  const matches: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [
      /ignore\s+(previous|all|above)\s+(instructions|rules|directives)/i,
      "이전 지시 무시 유도 문구",
    ],
    [/disregard\s+(previous|all|above)/i, "이전 지시 무시 유도 문구"],
    [/^\s*(system|assistant)\s*:\s*/im, "역할 태그 흉내 (system:/assistant:)"],
    [/[A-Za-z0-9+/=]{200,}/, "매우 긴 base64/hex 블록"],
    [/\bcurl\s+[^\s]+|\bwget\s+[^\s]+/i, "외부 커맨드 호출 (curl/wget)"],
    [/<!--\s*prompt\s*injection\s*-->/i, "prompt injection 마커"],
    [/(new\s+)?function\s*\(|eval\s*\(|require\s*\(/i, "JS 코드 실행 패턴"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(content) && !matches.includes(label)) matches.push(label);
  }
  return matches;
}

function injectOriginMetadata(
  content: string,
  originUrl: string,
  hash: string,
): string {
  const safeUrl = originUrl.replace(/"/g, '\\"');
  const m = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!m) {
    // frontmatter 없으면 origin 메타만 포함한 frontmatter 생성
    // (Core의 injectFm이 이후 type/description을 같은 블록에 merge)
    return `---\n_source_url: "${safeUrl}"\n_source_hash: "${hash}"\n---\n${content}`;
  }
  const addition = `\n_source_url: "${safeUrl}"\n_source_hash: "${hash}"`;
  return (
    content.slice(0, m[1].length + m[2].length) +
    addition +
    content.slice(m[1].length + m[2].length)
  );
}

async function handleDownloadSkillFromUrl(
  data: any,
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    const rawUrl = (data.url || "").trim();
    if (!rawUrl) throw new Error("URL이 비어있습니다");

    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const cl = Number(contentLengthHeader);
      if (Number.isFinite(cl) && cl > MAX_SKILL_SIZE) {
        throw new Error(
          `파일이 너무 큽니다 (최대 ${MAX_SKILL_SIZE} bytes, 헤더 보고값: ${cl})`,
        );
      }
    }

    const contentType = (response.headers.get("content-type") || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    if (contentType && !ACCEPTED_CONTENT_TYPES.includes(contentType)) {
      // application/octet-stream은 URL이 .md/.markdown 확장자인 경우에만 허용
      // (많은 서버가 .md MIME 매핑 없어 octet-stream로 내려주는 현실 반영)
      const isMdUrl = /\.(md|markdown)(\?|#|$)/i.test(rawUrl);
      if (contentType !== "application/octet-stream" || !isMdUrl) {
        throw new Error(
          `허용되지 않은 Content-Type: ${contentType || "(empty)"} — .md 파일만 허용`,
        );
      }
    }

    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > MAX_SKILL_SIZE) {
      throw new Error(`파일이 너무 큽니다 (최대 ${MAX_SKILL_SIZE} bytes)`);
    }
    if (buf.includes(0)) {
      throw new Error("Null byte가 포함된 파일은 허용되지 않습니다");
    }

    let content = buf.toString("utf-8");
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    if (content.includes("\uFFFD")) {
      throw new Error("UTF-8이 아닌 인코딩입니다");
    }

    // frontmatter 필수 검증 제거 — Core의 injectFm이 저장 시 자동 주입
    // (type/skill_description은 UI 입력값에서 Core가 병합)

    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const contentWithOrigin = injectOriginMetadata(content, rawUrl, hash);
    const suspicious = detectSuspiciousPatterns(contentWithOrigin);
    const filename = deriveSkillFilename(rawUrl);
    let origin = "";
    try {
      origin = new URL(rawUrl).hostname;
    } catch {
      /* ignore */
    }

    safePostMessage(panel, {
      command: "skillUrlDownloadPreview",
      category: data.category,
      policyType: data.policyType,
      skillDescription: data.skillDescription,
      content: contentWithOrigin,
      filename,
      originUrl: rawUrl,
      origin,
      hash,
      size: buf.length,
      suspicious,
    });
  } catch (e: any) {
    safePostMessage(panel, {
      command: "skillUrlDownloadError",
      category: data.category,
      error: e?.message || String(e),
    });
  }
}

async function handlePreviewAgentPolicyPath(
  data: any,
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    const filePath = String(data.filePath || "").trim();
    if (!filePath) throw new Error("파일 경로가 비어있습니다");
    if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown")) {
      throw new Error("Markdown 파일(.md)만 미리보기 가능합니다");
    }
    const fs = await import("fs/promises");
    const pathMod = await import("path");
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_SKILL_SIZE) {
      throw new Error(`파일이 너무 큽니다 (최대 ${MAX_SKILL_SIZE} bytes)`);
    }
    const buf = await fs.readFile(filePath);
    if (buf.includes(0)) throw new Error("Null byte 포함 파일");
    let content = buf.toString("utf-8");
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    if (content.includes("\uFFFD")) throw new Error("UTF-8이 아닌 인코딩");
    const { createHash } = await import("crypto");
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    const suspicious = detectSuspiciousPatterns(content);
    const filename = pathMod.basename(filePath);
    safePostMessage(panel, {
      command: "agentPolicyPathPreview",
      category: data.category,
      filePath,
      policyType: data.policyType,
      skillDescription: data.skillDescription,
      content,
      filename,
      originUrl: filePath,
      hash,
      size: buf.length,
      suspicious,
    });
  } catch (e: any) {
    safePostMessage(panel, {
      command: "agentPolicyPathPreviewError",
      category: data.category,
      error: e?.message || String(e),
    });
  }
}

export class AgentPolicyHandler {
  /**
   * 주어진 command가 AgentPolicy 관련 명령인지 확인합니다.
   */
  static isAgentPolicyCommand(command: string): boolean {
    return AGENT_POLICY_COMMANDS.has(command);
  }

  /**
   * AgentPolicy 관련 메시지를 처리합니다.
   * @returns true if the command was handled, false otherwise
   */
  static async handleMessage(
    data: any,
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    notificationService: NotificationServiceLike,
  ): Promise<boolean> {
    if (!this.isAgentPolicyCommand(data.command)) {
      return false;
    }

    // URL 다운로드는 fetch+검증만 수행, 저장은 미리보기 후 addAgentPolicyFile로 재라우팅
    if (data.command === "downloadSkillFromUrl") {
      await handleDownloadSkillFromUrl(data, panel);
      return true;
    }

    // 경로 추가 미리보기 — 파일 읽어서 메타+의심 패턴과 함께 웹뷰로 전송
    if (data.command === "previewAgentPolicyPath") {
      await handlePreviewAgentPolicyPath(data, panel);
      return true;
    }

    const stateManager = StateManager.getInstance(context);

    switch (data.command) {
      case "uploadAgentPolicyStableVersion": // Stable Version Markdown 저장
        try {
          const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
          if (mdContent && typeof mdContent === "string") {
            // 워크스페이스 루트 가져오기
            const workspaceRoot =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // storageUri/rules 디렉토리 생성
            const agentDir = path.join(context.storageUri!.fsPath, "rules");
            const agentDirUri = vscode.Uri.file(agentDir);
            await vscode.workspace.fs.createDirectory(agentDirUri);

            // 파일 저장
            const filePath = path.join(agentDir, "stable-version.md");
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(
              fileUri,
              Buffer.from(mdContent, "utf8"),
            );

            // 메모리에도 저장 (호환성)
            await stateManager.saveAgentPolicyStableVersion(mdContent);

            safePostMessage(panel, {
              command: "agentPolicyStableVersionSaved",
            });
            notificationService.showInfoMessage(
              `CODEPILOT: 버전 관리 파일 저장됨 — ${filePath}`,
            );
          } else {
            safePostMessage(panel, {
              command: "agentPolicyStableVersionSaveError",
              error: "Invalid Markdown content",
            });
            notificationService.showErrorMessage(
              "Invalid Markdown content provided.",
            );
          }
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyStableVersionSaveError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `Error saving Stable Version Markdown: ${error.message}`,
          );
        }
        break;
      case "uploadAgentPolicyCodingStyle": // Coding Style Markdown 저장
        try {
          const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
          if (mdContent && typeof mdContent === "string") {
            // 워크스페이스 루트 가져오기
            const workspaceRoot =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // storageUri/rules 디렉토리 생성
            const agentDir = path.join(context.storageUri!.fsPath, "rules");
            const agentDirUri = vscode.Uri.file(agentDir);
            await vscode.workspace.fs.createDirectory(agentDirUri);

            // 파일 저장
            const filePath = path.join(agentDir, "coding-style.md");
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(
              fileUri,
              Buffer.from(mdContent, "utf8"),
            );

            // 메모리에도 저장 (호환성)
            await stateManager.saveAgentPolicyCodingStyle(mdContent);

            safePostMessage(panel, { command: "agentPolicyCodingStyleSaved" });
            notificationService.showInfoMessage(
              `CODEPILOT: 코딩 스타일 파일 저장됨 — ${filePath}`,
            );
          } else {
            safePostMessage(panel, {
              command: "agentPolicyCodingStyleSaveError",
              error: "Invalid Markdown content",
            });
            notificationService.showErrorMessage(
              "Invalid Markdown content provided.",
            );
          }
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyCodingStyleSaveError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `Error saving Coding Style Markdown: ${error.message}`,
          );
        }
        break;
      case "uploadAgentPolicyProjectArchitecture": // Project Architecture Markdown 저장
        try {
          const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
          if (mdContent && typeof mdContent === "string") {
            // 워크스페이스 루트 가져오기
            const workspaceRoot =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // storageUri/rules 디렉토리 생성
            const agentDir = path.join(context.storageUri!.fsPath, "rules");
            const agentDirUri = vscode.Uri.file(agentDir);
            await vscode.workspace.fs.createDirectory(agentDirUri);

            // 파일 저장
            const filePath = path.join(agentDir, "project-architecture.md");
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(
              fileUri,
              Buffer.from(mdContent, "utf8"),
            );

            // 메모리에도 저장 (호환성)
            await stateManager.saveAgentPolicyProjectArchitecture(mdContent);

            safePostMessage(panel, {
              command: "agentPolicyProjectArchitectureSaved",
            });
            notificationService.showInfoMessage(
              `CODEPILOT: 프로젝트 아키텍처 파일 저장됨 — ${filePath}`,
            );
          } else {
            safePostMessage(panel, {
              command: "agentPolicyProjectArchitectureSaveError",
              error: "Invalid Markdown content",
            });
            notificationService.showErrorMessage(
              "Invalid Markdown content provided.",
            );
          }
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyProjectArchitectureSaveError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `Error saving Project Architecture Markdown: ${error.message}`,
          );
        }
        break;
      case "uploadAgentPolicyDependencyPolicy": // Dependency Policy Markdown 저장
        try {
          const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
          if (mdContent && typeof mdContent === "string") {
            // 워크스페이스 루트 가져오기
            const workspaceRoot =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // storageUri/rules 디렉토리 생성
            const agentDir = path.join(context.storageUri!.fsPath, "rules");
            const agentDirUri = vscode.Uri.file(agentDir);
            await vscode.workspace.fs.createDirectory(agentDirUri);

            // 파일 저장
            const filePath = path.join(agentDir, "dependency-policy.md");
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(
              fileUri,
              Buffer.from(mdContent, "utf8"),
            );

            // 메모리에도 저장 (호환성)
            await stateManager.saveAgentPolicyDependencyPolicy(mdContent);

            safePostMessage(panel, {
              command: "agentPolicyDependencyPolicySaved",
            });
            notificationService.showInfoMessage(
              `CODEPILOT: 의존성 정책 파일 저장됨 — ${filePath}`,
            );
          } else {
            safePostMessage(panel, {
              command: "agentPolicyDependencyPolicySaveError",
              error: "Invalid Markdown content",
            });
            notificationService.showErrorMessage(
              "Invalid Markdown content provided.",
            );
          }
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyDependencyPolicySaveError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `Error saving Dependency Policy Markdown: ${error.message}`,
          );
        }
        break;
      case "uploadAgentPolicyDbPolicy": // DB Policy Markdown 저장
        try {
          const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
          if (mdContent && typeof mdContent === "string") {
            // 워크스페이스 루트 가져오기
            const workspaceRoot =
              vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
              throw new Error("워크스페이스가 열려있지 않습니다.");
            }

            // storageUri/rules 디렉토리 생성
            const agentDir = path.join(context.storageUri!.fsPath, "rules");
            const agentDirUri = vscode.Uri.file(agentDir);
            await vscode.workspace.fs.createDirectory(agentDirUri);

            // 파일 저장
            const filePath = path.join(agentDir, "db-policy.md");
            const fileUri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.writeFile(
              fileUri,
              Buffer.from(mdContent, "utf8"),
            );

            // 메모리에도 저장 (호환성)
            await stateManager.saveAgentPolicyDbPolicy(mdContent);

            safePostMessage(panel, { command: "agentPolicyDbPolicySaved" });
            notificationService.showInfoMessage(
              `CODEPILOT: DB 정책 파일 저장됨 — ${filePath}`,
            );
          } else {
            safePostMessage(panel, {
              command: "agentPolicyDbPolicySaveError",
              error: "Invalid Markdown content",
            });
            notificationService.showErrorMessage(
              "Invalid Markdown content provided.",
            );
          }
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyDbPolicySaveError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `Error saving DB Policy Markdown: ${error.message}`,
          );
        }
        break;
      case "getAgentPolicyStableVersion": // Stable Version Markdown 로드
        try {
          const mdContent = await stateManager.getAgentPolicyStableVersion();
          safePostMessage(panel, {
            command: "agentPolicyStableVersionLoaded",
            mdContent: mdContent || "",
            xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
          });
        } catch (error: any) {
          console.error("Error loading Stable Version Markdown:", error);
          safePostMessage(panel, {
            command: "agentPolicyStableVersionLoadError",
            error: error.message,
          });
        }
        break;
      case "getAgentPolicyCodingStyle": // Coding Style Markdown 로드
        try {
          const mdContent = await stateManager.getAgentPolicyCodingStyle();
          safePostMessage(panel, {
            command: "agentPolicyCodingStyleLoaded",
            mdContent: mdContent || "",
            xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
          });
        } catch (error: any) {
          console.error("Error loading Coding Style Markdown:", error);
          safePostMessage(panel, {
            command: "agentPolicyCodingStyleLoadError",
            error: error.message,
          });
        }
        break;
      case "getAgentPolicyProjectArchitecture": // Project Architecture Markdown 로드
        try {
          const mdContent =
            await stateManager.getAgentPolicyProjectArchitecture();
          safePostMessage(panel, {
            command: "agentPolicyProjectArchitectureLoaded",
            mdContent: mdContent || "",
            xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
          });
        } catch (error: any) {
          console.error("Error loading Project Architecture Markdown:", error);
          safePostMessage(panel, {
            command: "agentPolicyProjectArchitectureLoadError",
            error: error.message,
          });
        }
        break;
      case "getAgentPolicyDependencyPolicy": // Dependency Policy Markdown 로드
        try {
          const mdContent = await stateManager.getAgentPolicyDependencyPolicy();
          safePostMessage(panel, {
            command: "agentPolicyDependencyPolicyLoaded",
            mdContent: mdContent || "",
            xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
          });
        } catch (error: any) {
          console.error("Error loading Dependency Policy Markdown:", error);
          safePostMessage(panel, {
            command: "agentPolicyDependencyPolicyLoadError",
            error: error.message,
          });
        }
        break;
      case "getAgentPolicyDbPolicy": // DB Policy Markdown 로드
        try {
          const mdContent = await stateManager.getAgentPolicyDbPolicy();
          safePostMessage(panel, {
            command: "agentPolicyDbPolicyLoaded",
            mdContent: mdContent || "",
            xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
          });
        } catch (error: any) {
          console.error("Error loading DB Policy Markdown:", error);
          safePostMessage(panel, {
            command: "agentPolicyDbPolicyLoadError",
            error: error.message,
          });
        }
        break;
      case "deleteAgentPolicyStableVersion": // Stable Version Markdown 삭제
        try {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const filePath = path.join(
              context.storageUri!.fsPath,
              "rules",
              "stable-version.md",
            );
            const fileUri = vscode.Uri.file(filePath);
            try {
              await vscode.workspace.fs.delete(fileUri);
            } catch (e: any) {
              // 파일이 없으면 무시
              if (e.code !== "FileNotFound") throw e;
            }
          }
          await stateManager.deleteAgentPolicyStableVersion();
          safePostMessage(panel, {
            command: "agentPolicyStableVersionDeleted",
          });
          notificationService.showInfoMessage(
            "CODEPILOT: 버전 관리 파일 삭제됨",
          );
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyStableVersionDeleteError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 버전 관리 파일 삭제 실패 — ${error.message}`,
          );
        }
        break;
      case "deleteAgentPolicyCodingStyle": // Coding Style Markdown 삭제
        try {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const filePath = path.join(
              context.storageUri!.fsPath,
              "rules",
              "coding-style.md",
            );
            const fileUri = vscode.Uri.file(filePath);
            try {
              await vscode.workspace.fs.delete(fileUri);
            } catch (e: any) {
              // 파일이 없으면 무시
              if (e.code !== "FileNotFound") throw e;
            }
          }
          await stateManager.deleteAgentPolicyCodingStyle();
          safePostMessage(panel, { command: "agentPolicyCodingStyleDeleted" });
          notificationService.showInfoMessage(
            "CODEPILOT: 코딩 스타일 파일 삭제됨",
          );
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyCodingStyleDeleteError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 코딩 스타일 파일 삭제 실패 — ${error.message}`,
          );
        }
        break;
      case "deleteAgentPolicyProjectArchitecture": // Project Architecture Markdown 삭제
        try {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const filePath = path.join(
              context.storageUri!.fsPath,
              "rules",
              "project-architecture.md",
            );
            const fileUri = vscode.Uri.file(filePath);
            try {
              await vscode.workspace.fs.delete(fileUri);
            } catch (e: any) {
              // 파일이 없으면 무시
              if (e.code !== "FileNotFound") throw e;
            }
          }
          await stateManager.deleteAgentPolicyProjectArchitecture();
          safePostMessage(panel, {
            command: "agentPolicyProjectArchitectureDeleted",
          });
          notificationService.showInfoMessage(
            "CODEPILOT: 프로젝트 아키텍처 파일 삭제됨",
          );
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyProjectArchitectureDeleteError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 프로젝트 아키텍처 파일 삭제 실패 — ${error.message}`,
          );
        }
        break;
      case "deleteAgentPolicyDependencyPolicy": // Dependency Policy Markdown 삭제
        try {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const filePath = path.join(
              context.storageUri!.fsPath,
              "rules",
              "dependency-policy.md",
            );
            const fileUri = vscode.Uri.file(filePath);
            try {
              await vscode.workspace.fs.delete(fileUri);
            } catch (e: any) {
              // 파일이 없으면 무시
              if (e.code !== "FileNotFound") throw e;
            }
          }
          await stateManager.deleteAgentPolicyDependencyPolicy();
          safePostMessage(panel, {
            command: "agentPolicyDependencyPolicyDeleted",
          });
          notificationService.showInfoMessage(
            "CODEPILOT: 의존성 정책 파일 삭제됨",
          );
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyDependencyPolicyDeleteError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 의존성 정책 파일 삭제 실패 — ${error.message}`,
          );
        }
        break;
      case "deleteAgentPolicyDbPolicy": // DB Policy Markdown 삭제
        try {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (workspaceRoot) {
            const filePath = path.join(
              context.storageUri!.fsPath,
              "rules",
              "db-policy.md",
            );
            const fileUri = vscode.Uri.file(filePath);
            try {
              await vscode.workspace.fs.delete(fileUri);
            } catch (e: any) {
              // 파일이 없으면 무시
              if (e.code !== "FileNotFound") throw e;
            }
          }
          await stateManager.deleteAgentPolicyDbPolicy();
          safePostMessage(panel, { command: "agentPolicyDbPolicyDeleted" });
          notificationService.showInfoMessage("CODEPILOT: DB 정책 파일 삭제됨");
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyDbPolicyDeleteError",
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: DB 정책 파일 삭제 실패 — ${error.message}`,
          );
        }
        break;
      // ===== AgentPolicy 다중 파일 관리 =====
      case "addAgentPolicyFile": // 카테고리에 파일 추가
        try {
          const {
            category,
            fileName,
            content: rawFileContent,
            policyType: fileType,
            skillDescription: fileSkillDesc,
          } = data;
          if (!category || !fileName || !rawFileContent) {
            throw new Error("카테고리, 파일명, 내용이 필요합니다.");
          }

          // frontmatter 주입
          const content = (() => {
            const t = fileType || "rule";
            const d = t === "skill" && fileSkillDesc ? fileSkillDesc : "";
            const fmMatch = rawFileContent.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fmMatch) {
              let fm = fmMatch[1];
              fm = /^type:\s*.+$/m.test(fm)
                ? fm.replace(/^type:\s*.+$/m, `type: ${t}`)
                : fm + `\ntype: ${t}`;
              if (d) {
                fm = /^description:\s*.+$/m.test(fm)
                  ? fm.replace(/^description:\s*.+$/m, `description: "${d}"`)
                  : fm + `\ndescription: "${d}"`;
              } else {
                fm = fm.replace(/\n?description:\s*.+$/m, "");
              }
              return rawFileContent.replace(
                /^---\s*\n[\s\S]*?\n---/,
                `---\n${fm.trim()}\n---`,
              );
            }
            let fm = `type: ${t}`;
            if (d) fm += `\ndescription: "${d}"`;
            return `---\n${fm}\n---\n${rawFileContent}`;
          })();

          // 카테고리 검증
          const validCategories = [
            "stable-version",
            "coding-style",
            "project-architecture",
            "dependency-policy",
            "db-policy",
            "global-rules",
          ];
          if (!validCategories.includes(category)) {
            throw new Error(`유효하지 않은 카테고리: ${category}`);
          }

          // 글로벌 규칙은 globalStorageUri에 저장 (워크스페이스 불필요)
          // global-rules는 globalStorageUri, 나머지는 storageUri (없으면 globalStorageUri 폴백)
          const categoryBaseDir =
            category === "global-rules"
              ? context.globalStorageUri.fsPath
              : (context.storageUri || context.globalStorageUri).fsPath;
          const categoryDir = path.join(categoryBaseDir, "rules", category);
          const categoryDirUri = vscode.Uri.file(categoryDir);
          await vscode.workspace.fs.createDirectory(categoryDirUri);

          // 파일명 정리 (확장자 추가)
          let safeFileName = fileName.replace(/[<>:"/\\|?*]/g, "_");
          if (
            !safeFileName.endsWith(".md") &&
            !safeFileName.endsWith(".markdown")
          ) {
            safeFileName += ".md";
          }

          // 파일 저장
          const filePath = path.join(categoryDir, safeFileName);
          const fileUri = vscode.Uri.file(filePath);
          await vscode.workspace.fs.writeFile(
            fileUri,
            Buffer.from(content, "utf8"),
          );

          safePostMessage(panel, {
            command: "agentPolicyFileAdded",
            category,
            fileName: safeFileName,
          });
          notificationService.showInfoMessage(
            `CODEPILOT: ${safeFileName} 저장됨`,
          );
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyFileAddError",
            category: data.category,
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 파일 저장 실패 — ${error.message}`,
          );
        }
        break;

      case "addPathAgentPolicy": // 경로 입력으로 파일 추가
        try {
          const {
            category,
            filePath: srcFilePath,
            policyType: pathPolicyType,
            skillDescription: pathSkillDesc,
          } = data;
          const validCategories = [
            "stable-version",
            "coding-style",
            "project-architecture",
            "dependency-policy",
            "db-policy",
            "global-rules",
          ];
          if (!category || !validCategories.includes(category)) {
            throw new Error(`유효하지 않은 카테고리: ${category}`);
          }
          if (!srcFilePath || typeof srcFilePath !== "string") {
            throw new Error("파일 경로가 필요합니다.");
          }

          // 파일 읽기
          const srcUri = vscode.Uri.file(srcFilePath);
          const rawBytes = await vscode.workspace.fs.readFile(srcUri);
          const rawPathContent = Buffer.from(rawBytes).toString("utf8");

          // frontmatter 주입
          const content = (() => {
            const t = pathPolicyType || "rule";
            const d = t === "skill" && pathSkillDesc ? pathSkillDesc : "";
            const fmMatch = rawPathContent.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fmMatch) {
              let fm = fmMatch[1];
              fm = /^type:\s*.+$/m.test(fm)
                ? fm.replace(/^type:\s*.+$/m, `type: ${t}`)
                : fm + `\ntype: ${t}`;
              if (d) {
                fm = /^description:\s*.+$/m.test(fm)
                  ? fm.replace(/^description:\s*.+$/m, `description: "${d}"`)
                  : fm + `\ndescription: "${d}"`;
              } else {
                fm = fm.replace(/\n?description:\s*.+$/m, "");
              }
              return rawPathContent.replace(
                /^---\s*\n[\s\S]*?\n---/,
                `---\n${fm.trim()}\n---`,
              );
            }
            let fm = `type: ${t}`;
            if (d) fm += `\ndescription: "${d}"`;
            return `---\n${fm}\n---\n${rawPathContent}`;
          })();

          // 파일명 추출 및 정리
          const baseName = path.basename(srcFilePath);
          if (!baseName.endsWith(".md") && !baseName.endsWith(".markdown")) {
            throw new Error(
              "Markdown 파일(.md, .markdown)만 추가할 수 있습니다.",
            );
          }
          let safeFileName = baseName.replace(/[<>:"/\\|?*]/g, "_");

          // global-rules는 globalStorageUri, 나머지는 storageUri (없으면 globalStorageUri 폴백)
          const pathBaseDir =
            category === "global-rules"
              ? context.globalStorageUri.fsPath
              : (context.storageUri || context.globalStorageUri).fsPath;
          const categoryDir = path.join(pathBaseDir, "rules", category);
          await vscode.workspace.fs.createDirectory(
            vscode.Uri.file(categoryDir),
          );

          // 파일 저장
          const destPath = path.join(categoryDir, safeFileName);
          await vscode.workspace.fs.writeFile(
            vscode.Uri.file(destPath),
            Buffer.from(content, "utf8"),
          );

          safePostMessage(panel, {
            command: "agentPolicyFileAdded",
            category,
            fileName: safeFileName,
          });
          notificationService.showInfoMessage(
            `CODEPILOT: ${safeFileName} 저장됨`,
          );
        } catch (error: any) {
          safePostMessage(panel, {
            command: "agentPolicyFileAddError",
            category: data.category,
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 경로 추가 실패 — ${error.message}`,
          );
        }
        break;

      case "deleteAgentPolicyFile": // 카테고리에서 특정 파일 삭제
        try {
          const { category, fileName, isLegacy } = data;

          if (!category || !fileName) {
            throw new Error("카테고리와 파일명이 필요합니다.");
          }

          // 파일명에 확장자가 없으면 .md 추가
          let targetFileName = fileName;
          if (
            !targetFileName.endsWith(".md") &&
            !targetFileName.endsWith(".markdown")
          ) {
            targetFileName += ".md";
          }

          let deleted = false;

          // global-rules는 globalStorageUri, 나머지는 storageUri (없으면 globalStorageUri 폴백)
          const deleteBaseDir =
            category === "global-rules"
              ? context.globalStorageUri.fsPath
              : (context.storageUri || context.globalStorageUri).fsPath;

          if (isLegacy) {
            // 레거시 파일: rules/{fileName}
            const legacyPath = path.join(
              deleteBaseDir,
              "rules",
              targetFileName,
            );
            try {
              const legacyUri = vscode.Uri.file(legacyPath);
              await vscode.workspace.fs.stat(legacyUri);
              await vscode.workspace.fs.delete(legacyUri);
              deleted = true;
            } catch (e: any) {
              console.warn(
                `[SettingsPanel] Legacy file not found: ${legacyPath}`,
                e.message,
              );
            }
          } else {
            // 새 구조 파일: rules/{category}/{fileName}
            const newStructurePath = path.join(
              deleteBaseDir,
              "rules",
              category,
              targetFileName,
            );
            try {
              const newUri = vscode.Uri.file(newStructurePath);
              await vscode.workspace.fs.stat(newUri);
              await vscode.workspace.fs.delete(newUri);
              deleted = true;
            } catch (e: any) {
              console.warn(
                `[SettingsPanel] New structure file not found: ${newStructurePath}`,
                e.message,
              );
            }
          }

          if (!deleted) {
            throw new Error(`파일을 찾을 수 없습니다: ${targetFileName}`);
          }

          safePostMessage(panel, {
            command: "agentPolicyFileDeleted",
            category,
            fileName: targetFileName,
          });
          notificationService.showInfoMessage(
            `CODEPILOT: ${targetFileName} 삭제됨`,
          );
        } catch (error: any) {
          console.error(`[SettingsPanel] deleteAgentPolicyFile error:`, error);
          safePostMessage(panel, {
            command: "agentPolicyFileDeleteError",
            category: data.category,
            error: error.message,
          });
          notificationService.showErrorMessage(
            `CODEPILOT: 파일 삭제 실패 — ${error.message}`,
          );
        }
        break;

      case "listAllAgentPolicyFiles": // 모든 카테고리의 파일 목록 조회
        try {
          const categories = [
            "stable-version",
            "coding-style",
            "project-architecture",
            "dependency-policy",
            "db-policy",
            "global-rules",
          ];
          const allFiles: Record<string, string[]> = {};
          const allFileTypes: Record<string, Record<string, string>> = {}; // { category: { filename: 'rule'|'skill' } }

          // frontmatter에서 type 파싱 헬퍼
          const parseFrontmatterType = (content: string): string => {
            const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (!match) return "rule";
            const typeMatch = match[1].match(/^type:\s*(.+)$/m);
            return typeMatch
              ? typeMatch[1].trim().replace(/^["']|["']$/g, "")
              : "rule";
          };
          // frontmatter에서 description 파싱 헬퍼
          const parseFrontmatterDesc = (content: string): string => {
            const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (!match) return "";
            const descMatch = match[1].match(/^description:\s*(.+)$/m);
            return descMatch
              ? descMatch[1].trim().replace(/^["']|["']$/g, "")
              : "";
          };
          const allFileDescriptions: Record<
            string,
            Record<string, string>
          > = {};

          for (const category of categories) {
            allFiles[category] = [];
            allFileTypes[category] = {};
            allFileDescriptions[category] = {};

            // global-rules는 globalStorageUri, 나머지는 storageUri (없으면 globalStorageUri 폴백)
            const listBaseDir =
              category === "global-rules"
                ? context.globalStorageUri.fsPath
                : (context.storageUri || context.globalStorageUri).fsPath;
            const categoryDir = path.join(listBaseDir, "rules", category);

            // 디렉토리가 존재하면 파일 목록 조회
            try {
              const categoryDirUri = vscode.Uri.file(categoryDir);
              // stat()으로 존재 여부 먼저 확인 — readDirectory 전에 ENOENT 내부 로그 방지
              try {
                await vscode.workspace.fs.stat(categoryDirUri);
              } catch {
                // 디렉토리 없음 — 레거시 파일 확인으로 넘어감
                throw Object.assign(new Error("Dir not found"), {
                  code: "FileNotFound",
                });
              }
              const entries =
                await vscode.workspace.fs.readDirectory(categoryDirUri);

              for (const [name, type] of entries) {
                if (
                  type === vscode.FileType.File &&
                  (name.endsWith(".md") || name.endsWith(".markdown"))
                ) {
                  allFiles[category].push(name);
                  // frontmatter 파싱하여 type 확인
                  try {
                    const filePath = path.join(categoryDir, name);
                    const content = Buffer.from(
                      await vscode.workspace.fs.readFile(
                        vscode.Uri.file(filePath),
                      ),
                    ).toString("utf8");
                    allFileTypes[category][name] =
                      parseFrontmatterType(content);
                    const desc = parseFrontmatterDesc(content);
                    if (desc) allFileDescriptions[category][name] = desc;
                  } catch {
                    allFileTypes[category][name] = "rule";
                  }
                }
              }
            } catch (e: any) {
              // 디렉토리가 없으면 레거시 단일 파일 확인
              if (e.code === "FileNotFound" || e.code === "ENOENT") {
                const legacyFileMap: Record<string, string> = {
                  "stable-version": "stable-version.md",
                  "coding-style": "coding-style.md",
                  "project-architecture": "project-architecture.md",
                  "dependency-policy": "dependency-policy.md",
                  "db-policy": "db-policy.md",
                  "global-rules": "global-rules.md",
                };
                const legacyFile = legacyFileMap[category];
                if (legacyFile) {
                  const legacyPath = path.join(
                    listBaseDir,
                    "rules",
                    legacyFile,
                  );
                  try {
                    await vscode.workspace.fs.stat(vscode.Uri.file(legacyPath));
                    allFiles[category].push(legacyFile + " (레거시)");
                    allFileTypes[category][legacyFile + " (레거시)"] = "rule";
                  } catch {
                    // 레거시 파일도 없음
                  }
                }
              }
            }
          }

          safePostMessage(panel, {
            command: "allAgentPolicyFilesList",
            files: allFiles,
            fileTypes: allFileTypes,
            fileDescriptions: allFileDescriptions,
          });
        } catch (error: any) {
          safePostMessage(panel, {
            command: "allAgentPolicyFilesListError",
            error: error.message,
          });
        }
        break;

      default:
        return false;
    }

    return true;
  }
}
