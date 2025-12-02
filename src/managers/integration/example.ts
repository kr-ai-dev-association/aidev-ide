/**
 * Manager Integration Example
 * 새로운 매니저 시스템을 사용하는 실제 예제
 */

import * as vscode from 'vscode';
import { getManagerAdapter } from './ManagerAdapter';

/**
 * 예제 1: LLM 응답 처리
 */
export async function exampleProcessLLMResponse(): Promise<void> {
    const managerAdapter = getManagerAdapter();

    // 시뮬레이션된 LLM 응답
    const llmResponse = `
I'll help you create a utility function. Here's what we need to do:

1. Create a new file \`src/utils/dateHelper.ts\`:

\`\`\`typescript:src/utils/dateHelper.ts
export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return \`\${year}-\${month}-\${day}\`;
}

export function parseDate(dateString: string): Date {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}
\`\`\`

2. Install the required dependencies:

\`\`\`bash
npm install date-fns
\`\`\`

3. Run the tests:

\`\`\`bash
npm test
\`\`\`
    `;

    // 액션 추출
    const result = await managerAdapter.processLLMResponse(
        llmResponse,
        {
            projectRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || '',
            workspaceRoot: vscode.workspace.workspaceFolders?.[0].uri.fsPath || ''
        }
    );

    console.log('[Example] Extracted actions:');
    console.log(`  Total: ${result.actions.length}`);
    console.log(`  Confidence: ${result.confidence}`);

    // 액션 실행
    const actionManager = managerAdapter.getActionManager();
    
    for (const action of result.actions) {
        console.log(`[Example] Executing action: ${action.type}`);
        
        // 검증
        const validation = await actionManager.validateAction(action);
        if (!validation.valid) {
            console.error('[Example] Validation failed:', validation.errors);
            continue;
        }

        // 실행
        const actionResult = await actionManager.executeAction(action);
        console.log(`[Example] Result:`, actionResult.success ? '✓' : '✗');
    }
}

/**
 * 예제 2: 명령어 실행 및 에러 처리
 */
export async function exampleExecuteCommandWithErrorHandling(): Promise<void> {
    const managerAdapter = getManagerAdapter();

    const commands = [
        'npm install',
        'npm run build',
        'npm test'
    ];

    for (const command of commands) {
        console.log(`[Example] Executing: ${command}`);

        const result = await managerAdapter.executeCommand(command, {
            cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
            timeout: 60000
        });

        if (result.success) {
            console.log('[Example] ✓ Success');
            console.log(`[Example] Duration: ${result.duration}ms`);
        } else {
            console.error('[Example] ✗ Failed');
            console.error(`[Example] Exit code: ${result.exitCode}`);
            
            // 에러 감지
            const executionManager = managerAdapter.getExecutionManager();
            const error = executionManager.detectError(result.stderr);
            
            if (error) {
                console.error(`[Example] Error type: ${error.type}`);
                console.error(`[Example] Severity: ${error.severity}`);
                console.error(`[Example] Message: ${error.message}`);
                
                if (error.details?.suggestion) {
                    console.log(`[Example] 💡 Suggestion: ${error.details.suggestion}`);
                }
            }

            // 포트 충돌 확인
            const portConflict = executionManager.detectPortConflict(result.stderr);
            if (portConflict) {
                console.error(`[Example] Port ${portConflict.port} is already in use!`);
                vscode.window.showWarningMessage(
                    `Port ${portConflict.port} is already in use. Would you like to kill the process?`,
                    'Yes', 'No'
                ).then(choice => {
                    if (choice === 'Yes') {
                        // 포트를 사용하는 프로세스 종료 로직
                        console.log('[Example] Killing process on port', portConflict.port);
                    }
                });
            }
        }
    }
}

/**
 * 예제 3: 터미널에서 명령어 실행
 */
export async function exampleTerminalExecution(): Promise<void> {
    const managerAdapter = getManagerAdapter();

    // 개발 서버 시작
    const { sessionId } = await managerAdapter.executeInTerminal(
        'npm run dev',
        {
            cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
            createNew: true,
            captureOutput: true
        }
    );

    console.log('[Example] Dev server started in terminal:', sessionId);

    // 터미널 히스토리 확인
    const terminalManager = managerAdapter.getTerminalManager();
    const history = terminalManager.getHistory();
    
    console.log('[Example] Command history:');
    const recent = history.getRecent(5);
    recent.forEach(entry => {
        console.log(`  - ${entry.command.command} (${entry.sessionName})`);
    });
}

/**
 * 예제 4: 장기 실행 프로세스 관리
 */
export async function exampleLongRunningProcess(): Promise<void> {
    const managerAdapter = getManagerAdapter();

    // 개발 서버 시작
    const { pid, sessionId } = await managerAdapter.startLongRunningProcess(
        'npm run dev',
        {
            cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath
        }
    );

    console.log('[Example] Long-running process started:');
    console.log(`  PID: ${pid}`);
    console.log(`  Terminal Session: ${sessionId}`);

    // 프로세스 모니터링
    const executionManager = managerAdapter.getExecutionManager();
    const monitor = executionManager.monitorProcess(pid);

    monitor.onOutput((data) => {
        console.log('[Example] Output:', data);
        
        // "Server started" 메시지 감지
        if (data.includes('Server') && data.includes('started')) {
            vscode.window.showInformationMessage('Dev server is ready!');
        }
    });

    monitor.onError((data) => {
        console.error('[Example] Error:', data);
        
        // 에러 감지 및 처리
        const error = executionManager.detectError(data);
        if (error && error.severity === 'high') {
            vscode.window.showErrorMessage(`Server error: ${error.message}`);
        }
    });

    monitor.onExit((code, signal) => {
        console.log('[Example] Process exited:', code, signal);
        vscode.window.showWarningMessage(`Dev server stopped (exit code: ${code})`);
    });

    // 10초 후 중지 (테스트용)
    setTimeout(async () => {
        console.log('[Example] Stopping process...');
        await monitor.stop();
    }, 10000);
}

/**
 * 예제 5: 통합 통계 확인
 */
export function exampleCheckStats(): void {
    const managerAdapter = getManagerAdapter();
    const stats = managerAdapter.getStats();

    console.log('[Example] Manager Statistics:');
    console.log('Action Manager:');
    console.log(`  Enabled: ${stats.actionManager.enabled}`);
    console.log(`  Active Actions: ${stats.actionManager.activeActions}`);
    
    console.log('Execution Manager:');
    console.log(`  Enabled: ${stats.executionManager.enabled}`);
    console.log(`  Total Executions: ${stats.executionManager.stats.totalExecutions}`);
    console.log(`  Success Rate: ${
        (stats.executionManager.stats.successfulExecutions / stats.executionManager.stats.totalExecutions * 100).toFixed(1)
    }%`);
    console.log(`  Running Processes: ${stats.executionManager.runningProcesses}`);
    
    console.log('Terminal Manager:');
    console.log(`  Enabled: ${stats.terminalManager.enabled}`);
    console.log(`  Total Sessions: ${stats.terminalManager.stats.totalSessions}`);
    console.log(`  Active Sessions: ${stats.terminalManager.stats.activeSessions}`);
    console.log(`  Total Commands: ${stats.terminalManager.stats.totalCommands}`);

    // VS Code에 표시
    vscode.window.showInformationMessage(
        `Manager Stats: ${stats.executionManager.stats.totalExecutions} executions, ` +
        `${stats.terminalManager.stats.totalSessions} terminals`
    );
}

/**
 * VS Code 명령어로 등록
 */
export function registerExampleCommands(context: vscode.ExtensionContext): void {
    // 예제 1
    context.subscriptions.push(
        vscode.commands.registerCommand('aidevIde.example.processLLMResponse', async () => {
            await exampleProcessLLMResponse();
        })
    );

    // 예제 2
    context.subscriptions.push(
        vscode.commands.registerCommand('aidevIde.example.executeCommand', async () => {
            await exampleExecuteCommandWithErrorHandling();
        })
    );

    // 예제 3
    context.subscriptions.push(
        vscode.commands.registerCommand('aidevIde.example.terminalExecution', async () => {
            await exampleTerminalExecution();
        })
    );

    // 예제 4
    context.subscriptions.push(
        vscode.commands.registerCommand('aidevIde.example.longRunningProcess', async () => {
            await exampleLongRunningProcess();
        })
    );

    // 예제 5
    context.subscriptions.push(
        vscode.commands.registerCommand('aidevIde.example.checkStats', () => {
            exampleCheckStats();
        })
    );

    console.log('[Example] Commands registered');
}

