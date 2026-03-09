/**
 * Run Command Tool Handler
 * 터미널 명령어 실행 툴 핸들러
 */

import * as vscode from 'vscode';
import { IToolHandler, ToolExecutionContext } from '../IToolHandler';
import { ToolUse, ToolResponse, Tool } from '../types';
import { ExecutionResult } from '../../managers/execution/types';
import { HotLoadManager, HotLoadItem } from '../../managers/hotload/HotLoadManager';

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

        // ── 명령어 분류 ──────────────────────────────────────────────
        // 설치 명령어: 완료까지 대기 (exit code 필수, 상한 120초)
        const INSTALL_PATTERNS = [
            'npm install', 'npm i ',
            'yarn install', 'yarn add',
            'pnpm install', 'pnpm add',
            'pip install', 'pip3 install',
            'poetry install',
            'cargo build', 'cargo install',
            'mvn install', 'mvn package', 'gradle build',
            'gem install', 'bundle install',
            'go get', 'go mod download',
            'dotnet restore',
        ];
        const isInstallCommand = INSTALL_PATTERNS.some(p => command.includes(p));

        // 서버/워처 명령어: 백그라운드 전환 (종료되지 않는 프로세스)
        const SERVER_PATTERNS = [
            'npm run dev', 'npm run start', 'npm start',
            'yarn dev', 'yarn start',
            'pnpm dev', 'pnpm start',
            'ng serve', 'next dev',
            'python manage.py runserver', 'flask run', 'uvicorn',
            'cargo run', 'go run',
            'rails server', 'rails s',
        ];
        const isServerCommand = SERVER_PATTERNS.some(p => command.includes(p));
        // ─────────────────────────────────────────────────────────────

        // 설치 명령어: 완료까지 대기 (최대 120초)
        if (isInstallCommand) {
            const installTimeout = 120000;
            console.log(`[RunCommandToolHandler] Install command detected, waiting for completion (timeout: ${installTimeout}ms): ${command}`);
            const result = await context.executionManager.executeCommand(command, {
                cwd: context.projectRoot,
                timeout: installTimeout,
                killOnTimeout: true,
            });
            return {
                success: result.success,
                message: result.success ? `Command executed: ${command}` : `Command failed: ${command}`,
                data: {
                    output: result.stdout,
                    error: result.stderr,
                    exitCode: result.exitCode,
                }
            };
        }

        // 서버 명령어: 짧게 확인 후 바로 백그라운드 전환
        if (isServerCommand) {
            const initialResult = await context.executionManager.executeCommand(command, {
                cwd: context.projectRoot,
                timeout: 5000,
                killOnTimeout: false,
            });
            const pid = initialResult.pid || context.executionManager.getRunningProcesses()
                .find(p => p.command === command)?.pid;

            if (pid) {
                context.executionManager.continueProcess(pid);
                console.log(`[RunCommandToolHandler] Server command started in background: ${command} (PID: ${pid})`);
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

        // 그 외 일반 명령어: 출력 기반으로 판단 (기존 로직)
        const initialResult = await context.executionManager.executeCommand(command, {
            cwd: context.projectRoot,
            timeout: 5000,
            killOnTimeout: false
        });

        const pid = initialResult.pid || context.executionManager.getRunningProcesses()
            .find(p => p.command === command)?.pid;

        let isLongRunning = false;
        if (pid) {
            isLongRunning = context.executionManager.isLongRunningCommand(pid);
        }

        // 출력 기반으로 장기 실행으로 판단되면 백그라운드 전환
        if (isLongRunning || initialResult.error?.code === 'TIMEOUT' || initialResult.error?.code === 'TIMEOUT_CONTINUE') {
            if (pid) {
                console.log(`[RunCommandToolHandler] Long-running command detected (output-based/timeout): ${command}, using continue() pattern`);
                context.executionManager.continueProcess(pid);

                const isTimeout = initialResult.error?.code === 'TIMEOUT' || initialResult.error?.code === 'TIMEOUT_CONTINUE';
                const outputMessage = isTimeout
                    ? `백그라운드에서 시작되었습니다.${initialResult.stdout ? `\n${initialResult.stdout}` : ''}`
                    : (initialResult.stdout || `서버가 백그라운드에서 시작되었습니다${pid ? ` (PID: ${pid})` : ''}.`);

                return {
                    success: true,
                    message: `Long-running command started: ${command}${pid ? ` (PID: ${pid})` : ''}`,
                    data: {
                        output: outputMessage,
                        llmNote: '이 명령어는 장기 실행 프로세스입니다. 이미 백그라운드에서 실행 중이므로 동일 명령어를 다시 실행하지 마세요. 다음 단계로 진행하거나 작업 완료를 선언하세요.',
                        error: initialResult.stderr,
                        exitCode: undefined,
                    }
                };
            }
        }

        // 초기 실행에서 완료된 경우 바로 반환
        if (initialResult.exitCode !== undefined && !initialResult.error) {
            console.log(`[RunCommandToolHandler] Command completed in initial execution: ${command}`);
            return {
                success: initialResult.success,
                message: initialResult.success
                    ? `Command executed: ${command}`
                    : `Command failed: ${command}`,
                data: {
                    output: initialResult.stdout,
                    error: initialResult.stderr,
                    exitCode: initialResult.exitCode
                }
            };
        }

        // 사용자가 명시적으로 타임아웃을 지정한 경우
        if (timeoutSeconds && timeoutSeconds > 0) {
            try {
                // 타임아웃으로 Promise.race 사용
                const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('COMMAND_TIMEOUT'));
                    }, timeoutSeconds * 1000);
                });

                const executePromise = context.executionManager.executeCommand(command, {
                    cwd: context.projectRoot
                });

                const raceResult = await Promise.race([executePromise, timeoutPromise]);

                return {
                    success: raceResult.success,
                    message: raceResult.success
                        ? `Command executed: ${command}`
                        : `Command failed: ${command}`,
                    data: {
                        output: raceResult.stdout,
                        error: raceResult.stderr,
                        exitCode: raceResult.exitCode
                    }
                };
            } catch (error) {
                // 타임아웃 발생 시 continue() 호출
                if (error instanceof Error && error.message === 'COMMAND_TIMEOUT') {
                    const runningProcesses = context.executionManager.getRunningProcesses();
                    const process = runningProcesses.find(p => p.command === command);

                    if (process) {
                        context.executionManager.continueProcess(process.pid);

                        const buffer = context.executionManager.getProcessOutput(process.pid);
                        return {
                            success: true,
                            message: `Command execution timed out after ${timeoutSeconds} seconds. Command is still running in background.`,
                            data: {
                                output: buffer?.stdout || '',
                                error: buffer?.stderr,
                                exitCode: undefined
                            }
                        };
                    }
                }

                // 다른 에러는 그대로 전달
                throw error;
            }
        }

        // 초기 실행에서 타임아웃이 발생했지만 장기 실행이 아닌 경우
        // 완료될 때까지 대기 (타임아웃 없이)
        const finalResult = await context.executionManager.executeCommand(command, {
            cwd: context.projectRoot
        });

        return {
            success: finalResult.success,
            message: finalResult.success
                ? `Command executed: ${command}`
                : `Command failed: ${command}`,
            data: {
                output: finalResult.stdout,
                error: finalResult.stderr,
                exitCode: finalResult.exitCode
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


