/**
 * Error Reporting Service
 * IDE에서 발생한 오류를 백엔드로 전송하는 서비스
 * codepilot.errorReportingEnabled 설정에 따라 on/off
 */

import * as vscode from "vscode";

export class ErrorReportingService {
  private static instance: ErrorReportingService;
  private queue: ErrorEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 10000; // 10초마다 배치 전송
  private readonly MAX_QUEUE = 50;

  private constructor() {
    this.startFlushTimer();
  }

  static getInstance(): ErrorReportingService {
    if (!ErrorReportingService.instance) {
      ErrorReportingService.instance = new ErrorReportingService();
    }
    return ErrorReportingService.instance;
  }

  /**
   * 오류 리포팅이 활성화되어 있는지 확인
   */
  private isEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("codepilot");
    return config.get<boolean>("errorReportingEnabled", false);
  }

  /**
   * 오류를 큐에 추가 (비동기, 논블로킹)
   */
  report(
    level: "error" | "warning" | "critical",
    message: string,
    options?: {
      stackTrace?: string;
      source?: string;
      metadata?: Record<string, any>;
    }
  ): void {
    if (!this.isEnabled()) return;

    this.queue.push({
      level,
      message,
      stack_trace: options?.stackTrace,
      source: options?.source || "ide",
      metadata: {
        ...options?.metadata,
        timestamp: new Date().toISOString(),
        extensionVersion: this.getExtensionVersion(),
      },
    });

    // 큐가 가득 차면 즉시 전송
    if (this.queue.length >= this.MAX_QUEUE) {
      this.flush();
    }
  }

  /**
   * 편의 메서드: Error 객체에서 리포트
   */
  reportError(error: Error, metadata?: Record<string, any>): void {
    this.report("error", error.message, {
      stackTrace: error.stack,
      metadata,
    });
  }

  /**
   * 편의 메서드: LLM 에러 리포트
   */
  reportLLMError(message: string, model: string, metadata?: Record<string, any>): void {
    this.report("error", message, {
      source: "ide-llm",
      metadata: { model, ...metadata },
    });
  }

  /**
   * 편의 메서드: 도구 실행 에러 리포트
   */
  reportToolError(toolName: string, message: string, metadata?: Record<string, any>): void {
    this.report("warning", `Tool '${toolName}' failed: ${message}`, {
      source: "ide-tool",
      metadata: { toolName, ...metadata },
    });
  }

  /**
   * 편의 메서드: MCP 서버 연결 에러 리포트
   */
  reportMCPError(serverId: string, serverName: string, message: string, metadata?: Record<string, any>): void {
    this.report("error", `MCP '${serverName}' (${serverId}): ${message}`, {
      source: "ide-mcp",
      metadata: { serverId, serverName, ...metadata },
    });
  }

  /**
   * 편의 메서드: 인증 에러 리포트
   */
  reportAuthError(message: string, metadata?: Record<string, any>): void {
    this.report("error", `Auth: ${message}`, {
      source: "ide-auth",
      metadata,
    });
  }

  /**
   * 편의 메서드: 설정 동기화 에러 리포트
   */
  reportSyncError(message: string, metadata?: Record<string, any>): void {
    this.report("warning", `Settings sync: ${message}`, {
      source: "ide-sync",
      metadata,
    });
  }

  /**
   * 편의 메서드: 파일 I/O 에러 리포트
   */
  reportFileError(filePath: string, message: string, metadata?: Record<string, any>): void {
    this.report("warning", `File I/O '${filePath}': ${message}`, {
      source: "ide-file",
      metadata: { filePath, ...metadata },
    });
  }

  /**
   * 큐에 있는 오류를 백엔드로 전송
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (!this.isEnabled()) {
      this.queue = [];
      return;
    }

    const batch = this.queue.splice(0, this.MAX_QUEUE);

    try {
      const { CodePilotApiClient } = await import("../api/CodePilotApiClient");
      const { AuthService } = await import("../auth/AuthService");

      const auth = AuthService.getInstance();
      if (!auth.isLoggedIn()) return;

      const api = CodePilotApiClient.getInstance();

      // 각 에러를 개별 전송 (백엔드 API가 단건 처리)
      const promises = batch.map((entry) =>
        api.reportError({
          level: entry.level,
          message: entry.message,
          stack_trace: entry.stack_trace,
          source: entry.source,
          metadata: entry.metadata,
        }).catch(() => {
          // 개별 전송 실패 시 무시
        })
      );

      await Promise.allSettled(promises);
    } catch {
      // 전체 전송 실패 시 무시 (오프라인 등)
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  private getExtensionVersion(): string {
    try {
      const ext = vscode.extensions.getExtension("banya.codepilot");
      return ext?.packageJSON?.version || "unknown";
    } catch {
      return "unknown";
    }
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // 남은 큐 즉시 전송
    this.flush();
  }
}

interface ErrorEntry {
  level: "error" | "warning" | "critical";
  message: string;
  stack_trace?: string;
  source: string;
  metadata?: Record<string, any>;
}
