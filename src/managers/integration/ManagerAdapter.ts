/**
 * Manager Adapter
 * 기존 코드와 새로운 매니저 시스템을 연결하는 어댑터
 */

import { ActionManager } from '../action/ActionManager';
import { ExecutionManager } from '../execution/ExecutionManager';
import { TerminalManager } from '../terminal/TerminalManager';

/**
 * 매니저 통합 설정
 */
export interface ManagerIntegrationConfig {
    useActionManager: boolean;
    useExecutionManager: boolean;
    useTerminalManager: boolean;
}

/**
 * 매니저 어댑터 - 싱글톤
 */
export class ManagerAdapter {
    private static instance: ManagerAdapter;
    
    private actionManager: ActionManager;
    private executionManager: ExecutionManager;
    private terminalManager: TerminalManager;
    
    private config: ManagerIntegrationConfig = {
        useActionManager: true,
        useExecutionManager: true,
        useTerminalManager: true
    };

    private constructor() {
        this.actionManager = ActionManager.getInstance();
        this.executionManager = ExecutionManager.getInstance();
        this.terminalManager = TerminalManager.getInstance();
        
        console.log('[ManagerAdapter] Initialized with new manager architecture');
    }

    public static getInstance(): ManagerAdapter {
        if (!ManagerAdapter.instance) {
            ManagerAdapter.instance = new ManagerAdapter();
        }
        return ManagerAdapter.instance;
    }

    /**
     * 통합 설정을 업데이트합니다
     */
    public updateConfig(config: Partial<ManagerIntegrationConfig>): void {
        this.config = { ...this.config, ...config };
        console.log('[ManagerAdapter] Config updated:', this.config);
    }

    /**
     * Action Manager 사용 여부
     */
    public isActionManagerEnabled(): boolean {
        return this.config.useActionManager;
    }

    /**
     * Execution Manager 사용 여부
     */
    public isExecutionManagerEnabled(): boolean {
        return this.config.useExecutionManager;
    }

    /**
     * Terminal Manager 사용 여부
     */
    public isTerminalManagerEnabled(): boolean {
        return this.config.useTerminalManager;
    }

    /**
     * Action Manager를 가져옵니다
     */
    public getActionManager(): ActionManager {
        return this.actionManager;
    }

    /**
     * Execution Manager를 가져옵니다
     */
    public getExecutionManager(): ExecutionManager {
        return this.executionManager;
    }

    /**
     * Terminal Manager를 가져옵니다
     */
    public getTerminalManager(): TerminalManager {
        return this.terminalManager;
    }

    /**
     * LLM 응답을 처리합니다 (Action Manager 사용)
     */
    public async processLLMResponse(
        content: string,
        context?: {
            projectRoot: string;
            workspaceRoot: string;
            currentFile?: string;
        }
    ): Promise<{
        actions: any[];
        confidence: number;
    }> {
        if (!this.config.useActionManager) {
            console.log('[ManagerAdapter] Action Manager disabled, skipping');
            return { actions: [], confidence: 0 };
        }

        try {
            // 컨텍스트 설정
            if (context) {
                this.actionManager.setContext(context);
            }

            // LLM 응답을 액션으로 매핑
            const result = await this.actionManager.mapResponse({
                content,
                actions: undefined,
                explanation: undefined
            });

            console.log(`[ManagerAdapter] Mapped ${result.actions.length} actions from LLM response`);

            return {
                actions: result.actions,
                confidence: result.confidence
            };
        } catch (error) {
            console.error('[ManagerAdapter] Error processing LLM response:', error);
            return { actions: [], confidence: 0 };
        }
    }

    /**
     * 명령어를 실행합니다 (Execution Manager 사용)
     */
    public async executeCommand(
        command: string,
        options?: {
            cwd?: string;
            timeout?: number;
        }
    ): Promise<{
        success: boolean;
        exitCode: number;
        stdout: string;
        stderr: string;
        duration: number;
    }> {
        if (!this.config.useExecutionManager) {
            console.log('[ManagerAdapter] Execution Manager disabled, skipping');
            return {
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: 'Execution Manager disabled',
                duration: 0
            };
        }

        try {
            const result = await this.executionManager.executeCommand(command, options);

            console.log(`[ManagerAdapter] Command executed: ${command} (exit=${result.exitCode})`);

            return result;
        } catch (error) {
            console.error('[ManagerAdapter] Error executing command:', error);
            return {
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: error instanceof Error ? error.message : String(error),
                duration: 0
            };
        }
    }

    /**
     * 터미널에서 명령어를 실행합니다 (Terminal Manager 사용)
     */
    public async executeInTerminal(
        command: string,
        options?: {
            cwd?: string;
            createNew?: boolean;
            captureOutput?: boolean;
        }
    ): Promise<{
        sessionId: string;
        commandId: string;
    }> {
        if (!this.config.useTerminalManager) {
            console.log('[ManagerAdapter] Terminal Manager disabled, skipping');
            return {
                sessionId: '',
                commandId: ''
            };
        }

        try {
            const result = await this.terminalManager.executeCommand(command, options);

            console.log(`[ManagerAdapter] Terminal command executed: ${command}`);

            return result;
        } catch (error) {
            console.error('[ManagerAdapter] Error executing in terminal:', error);
            return {
                sessionId: '',
                commandId: ''
            };
        }
    }

    /**
     * 장기 실행 프로세스를 시작합니다
     */
    public async startLongRunningProcess(
        command: string,
        options?: {
            cwd?: string;
        }
    ): Promise<{
        pid: number;
        sessionId: string;
    }> {
        if (!this.config.useExecutionManager || !this.config.useTerminalManager) {
            console.log('[ManagerAdapter] Managers disabled, skipping');
            return { pid: -1, sessionId: '' };
        }

        try {
            // Execution Manager로 프로세스 시작
            const process = await this.executionManager.startProcess(command, options);

            // Terminal Manager로 UI 터미널 생성
            const terminal = this.terminalManager.createTerminal({
                name: `Process ${process.pid}`,
                cwd: options?.cwd,
                metadata: {
                    type: 'dev-server'
                }
            });

            terminal.sendCommand(command, options?.cwd);

            console.log(`[ManagerAdapter] Long-running process started: PID=${process.pid}`);

            return {
                pid: process.pid,
                sessionId: terminal.getId()
            };
        } catch (error) {
            console.error('[ManagerAdapter] Error starting long-running process:', error);
            return { pid: -1, sessionId: '' };
        }
    }

    /**
     * 통합 통계를 가져옵니다
     */
    public getStats(): {
        actionManager: any;
        executionManager: any;
        terminalManager: any;
    } {
        return {
            actionManager: {
                enabled: this.config.useActionManager,
                activeActions: this.actionManager.getActiveActions().length
            },
            executionManager: {
                enabled: this.config.useExecutionManager,
                stats: this.executionManager.getStats(),
                runningProcesses: this.executionManager.getRunningProcesses().length
            },
            terminalManager: {
                enabled: this.config.useTerminalManager,
                stats: this.terminalManager.getStats()
            }
        };
    }

    /**
     * 정리 작업을 수행합니다
     */
    public async cleanup(): Promise<void> {
        console.log('[ManagerAdapter] Cleaning up');

        await this.executionManager.cleanup();
        this.terminalManager.dispose();

        console.log('[ManagerAdapter] Cleanup complete');
    }
}

/**
 * 전역 매니저 어댑터 인스턴스를 가져옵니다
 */
export function getManagerAdapter(): ManagerAdapter {
    return ManagerAdapter.getInstance();
}

