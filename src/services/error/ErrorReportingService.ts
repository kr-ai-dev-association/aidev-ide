/**
 * Error Reporting Service (no-op stub)
 */

export class ErrorReportingService {
  private static instance: ErrorReportingService;

  private constructor() {}

  static getInstance(): ErrorReportingService {
    if (!ErrorReportingService.instance) {
      ErrorReportingService.instance = new ErrorReportingService();
    }
    return ErrorReportingService.instance;
  }

  report(
    _level: "error" | "warning" | "critical",
    _message: string,
    _options?: {
      stackTrace?: string;
      source?: string;
      metadata?: Record<string, any>;
    }
  ): void {}

  reportError(_error: Error, _metadata?: Record<string, any>): void {}

  reportLLMError(_message: string, _model: string, _metadata?: Record<string, any>): void {}

  reportToolError(_toolName: string, _message: string, _metadata?: Record<string, any>): void {}

  reportMCPError(_serverId: string, _serverName: string, _message: string, _metadata?: Record<string, any>): void {}

  reportAuthError(_message: string, _metadata?: Record<string, any>): void {}

  reportSyncError(_message: string, _metadata?: Record<string, any>): void {}

  reportFileError(_filePath: string, _message: string, _metadata?: Record<string, any>): void {}

  flush(): void {}

  dispose(): void {}
}
