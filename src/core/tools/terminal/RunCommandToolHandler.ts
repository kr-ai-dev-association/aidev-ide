/**
 * Run Command Tool Handler
 * 터미널 명령어 실행 툴 핸들러
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { HotLoadManager } from '../../managers/hotload/HotLoadManager';

export class RunCommandToolHandler implements IToolHandler {
    readonly name = Tool.RUN_COMMAND;

    async execute(toolUse: ToolUse, context: ToolExecutionContext): Promise<ToolResponse> {
        const command = toolUse.params.command;

        if (!command) {
            return {
                success: false,
                message: 'Command parameter is required',
                error: { code: 'MISSING_PARAM', message: 'command is required' }
            };
        }

        // HotLoad 매칭 확인 - 완료 조건/재시도가 설정된 항목이면 executeWithRetry 사용
        const hotLoadResult = await this.tryHotLoadExecution(command, context);
        if (hotLoadResult) {
            return hotLoadResult;
        }

        const timeoutSeconds = toolUse.params.timeout ? parseInt(toolUse.params.timeout) : undefined;

        // ── 출력 기반 명령어 분류 (패턴 매칭 없이 동작) ──────────────
        // 1단계: 짧은 타임아웃으로 실행하여 출력 확인
        const INITIAL_TIMEOUT = 8000; // 8초 대기
        const MAX_COMPLETION_TIMEOUT = 120000; // 완료 대기 상한 120초

        const initialResult = await context.executionManager.executeCommand(command, {
            cwd: context.projectRoot,
            timeout: timeoutSeconds ? timeoutSeconds * 1000 : INITIAL_TIMEOUT,
            killOnTimeout: false,
        });

        // 2단계: 초기 실행에서 완료된 경우 → exit code로 판단
        if (initialResult.exitCode !== undefined && !initialResult.error) {
            console.log(`[RunCommandToolHandler] Command completed: ${command} (exit=${initialResult.exitCode})`);
            return {
                success: initialResult.success,
                message: initialResult.success
                    ? `Command executed: ${command}`
                    : `Command failed: ${command}`,
                data: {
                    output: initialResult.stdout,
                    error: initialResult.stderr,
                    exitCode: initialResult.exitCode,
                }
            };
        }

        // 3단계: 타임아웃 발생 → 출력 기반으로 장기 실행 여부 판단
        const pid = initialResult.pid || context.executionManager.getRunningProcesses()
            .find(p => p.command === command)?.pid;

        let isLongRunning = false;
        if (pid) {
            isLongRunning = context.executionManager.isLongRunningCommand(pid);
        }

        // stdout에 서버/워처 마커가 있으면 → 백그라운드 전환
        if (isLongRunning) {
            if (pid) {
                context.executionManager.continueProcess(pid);
                console.log(`[RunCommandToolHandler] Long-running detected (output-based): ${command} (PID: ${pid})`);
                return {
                    success: true,
                    message: `Long-running command started: ${command} (PID: ${pid})`,
                    data: {
                        output: initialResult.stdout || `서버가 백그라운드에서 시작되었습니다 (PID: ${pid}).`,
                        llmNote: '이 명령어는 장기 실행 프로세스입니다. 이미 백그라운드에서 실행 중이므로 동일 명령어를 다시 실행하지 마세요.',
                        error: initialResult.stderr,
                        exitCode: undefined,
                    }
                };
            }
        }

        // 서버 마커 없음 → 아직 실행 중인 일반 명령어 (npm install 등)
        // 완료까지 대기 (상한 120초)
        if (pid) {
            console.log(`[RunCommandToolHandler] Waiting for completion (max ${MAX_COMPLETION_TIMEOUT}ms): ${command}`);
            const finalResult = await context.executionManager.executeCommand(command, {
                cwd: context.projectRoot,
                timeout: MAX_COMPLETION_TIMEOUT,
                killOnTimeout: true,
            });
            return {
                success: finalResult.success,
                message: finalResult.success
                    ? `Command executed: ${command}`
                    : `Command failed: ${command}`,
                data: {
                    output: finalResult.stdout,
                    error: finalResult.stderr,
                    exitCode: finalResult.exitCode,
                }
            };
        }

        // pid 없이 타임아웃 → 에러 반환
        return {
            success: false,
            message: `Command timed out: ${command}`,
            data: {
                output: initialResult.stdout,
                error: initialResult.stderr || 'Command timed out without producing a process ID',
                exitCode: undefined,
            }
        };
    }

    getDescription(toolUse: ToolUse): string {
        return `[run_command: ${toolUse.params.command}]`;
    }

    /**
     * HotLoad 항목과 명령어 매칭 확인 후 executeWithRetry 실행
     * 매칭되고 completionCondition/maxRetries가 있으면 HotLoad 방식으로 실행
     */
    private async tryHotLoadExecution(
        command: string,
        context: ToolExecutionContext
    ): Promise<ToolResponse | null> {
        try {
            const hotLoadManager = HotLoadManager.getInstance();
            const items = await hotLoadManager.getAllHotLoads();

            // 명령어가 정확히 일치하는 HotLoad 항목 찾기
            const matchedItem = items.find(item =>
                item.command.trim() === command.trim()
            );

            if (!matchedItem) {
                return null; // 매칭 없음 → 일반 실행으로 진행
            }

            // completionCondition 또는 maxRetries가 있어야 HotLoad 실행 의미가 있음
            if (!matchedItem.completionCondition && (!matchedItem.maxRetries || matchedItem.maxRetries === 0)) {
                console.log(`[RunCommandToolHandler] HotLoad matched but no conditions/retries: ${command}`);
                return null; // 일반 실행으로 진행
            }

            console.log(`[RunCommandToolHandler] HotLoad executeWithRetry: ${command}`);

            // context에서 webview 가져오기 (없으면 더미 생성)
            const webview = context.webview || this.createDummyWebview();

            const result = await hotLoadManager.executeWithRetry(
                matchedItem,
                context.projectRoot,
                webview
            );

            // 결과 처리
            if (result.success) {
                return {
                    success: true,
                    message: `HotLoad command executed: ${command} (${result.attempts} attempt(s))`,
                    data: {
                        output: result.output,
                        exitCode: result.exitCode,
                        hotload: true,
                        attempts: result.attempts
                    }
                };
            }

            // 실패 시 failureAction에 따라 처리
            const response: ToolResponse = {
                success: false,
                message: `HotLoad command failed: ${command} (${result.attempts} attempt(s))`,
                data: {
                    output: result.output,
                    exitCode: result.exitCode,
                    hotload: true,
                    attempts: result.attempts,
                    failureAction: result.failureAction
                }
            };

            // pass_to_llm인 경우 error 필드에 상세 정보 추가
            if (result.failureAction === 'pass_to_llm') {
                response.error = {
                    code: 'HOTLOAD_FAILED',
                    message: `HotLoad 실패 (${result.attempts}회 시도): ${result.output}`
                };
            }

            return response;
        } catch (error) {
            console.warn('[RunCommandToolHandler] HotLoad check failed:', error);
            return null; // 에러 시 일반 실행으로 진행
        }
    }

    /**
     * webview가 없을 때 사용할 더미 객체
     */
    private createDummyWebview(): vscode.Webview {
        return {
            postMessage: () => Promise.resolve(true),
            html: '',
            options: {},
            onDidReceiveMessage: () => ({ dispose: () => {} }),
            asWebviewUri: (uri: vscode.Uri) => uri,
            cspSource: ''
        } as unknown as vscode.Webview;
    }
}


