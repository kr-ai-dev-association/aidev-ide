/**
 * ContextGatherer
 * UI 준비, MCP 프롬프트 수집, Intent 감지, Context 수집 — ConversationManager에서 분리
 * v11.12.0
 */

import * as vscode from 'vscode';
import type { ConversationOptions, GatheredContext } from '../ConversationManager';
import { IntentDetectionResult, IntentDetector } from '../../action/IntentDetector';
import { ContextManager } from '../../context/ContextManager';
import { LLMManager } from '../../model/LLMManager';
import { StateManager } from '../../state/StateManager';
import { WebviewBridge } from '../../../webview/WebviewBridge';
import { TaskManager } from '../../task/TaskManager';
import { MCPManager } from '../../../mcp/MCPManager';
import { RelevantFilesFinder } from '../../context/file/RelevantFilesFinder';
import { PromptType } from '../../context/PromptBuilder';
import { ReferenceItem } from '../../../webview/types';

export class ContextGatherer {
    /** 마지막 gatherContext 호출에서 수집된 RAG 참조 정보 (standalone: 항상 빈 배열) */
    private static _lastRagReferences: ReferenceItem[] = [];

    /** 마지막 RAG 참조 정보 반환 */
    public static getLastRagReferences(): ReferenceItem[] {
        return [...ContextGatherer._lastRagReferences];
    }

    constructor(
        private contextManager: ContextManager,
        private llmManager: LLMManager,
        private stateManager: StateManager | null = null,
    ) {}

    /**
     * stateManager 주입 (setStateManager 호환)
     */
    setStateManager(stateManager: StateManager): void {
        this.stateManager = stateManager;
    }

    /**
     * UI 초기 상태 설정
     */
    prepareUI(webview: vscode.Webview): void {
        WebviewBridge.sendProcessingStep(webview, 'intent');
        WebviewBridge.sendProcessingStatus(
            webview,
            'intent',
            '사용자 요청 분석 중...',
        );

        const taskManager = TaskManager.getInstance();
        taskManager.clearPlanQueue();
        WebviewBridge.clearTaskQueue(webview);
    }

    /**
     * 활성화된 MCP 서버의 커스텀 프롬프트를 수집하여 결합
     */
    collectMcpCustomPrompts(): string {
        try {
            const mcpManager = MCPManager.getInstance();
            const mcpServers = mcpManager.getServers();
            const mcpPromptParts = mcpServers
                .filter((s) => s.enabled && s.customPrompt?.trim())
                .map((s) => `**[MCP: ${s.name}]**\n${s.customPrompt!.trim()}`);
            if (mcpPromptParts.length > 0) {
                return `## MCP 도구 사용 지침\n\n${mcpPromptParts.join('\n\n')}`;
            }
        } catch (error) {
            console.warn('[ContextGatherer] Failed to collect MCP custom prompts:', error);
        }
        return '';
    }

    /**
     * 사용자 의도 및 작업 타입 감지
     * Intent 모델이 설정된 경우 해당 모델 사용, 미설정 시 메인 모델 사용
     */
    async detectIntent(query: string): Promise<IntentDetectionResult> {
        const detector = new IntentDetector(this.llmManager);

        if (this.stateManager) {
            detector.setStateManager(this.stateManager);
        }

        const intent = await detector.detectIntent(query);

        console.log(
            `[ContextGatherer] Intent detected: ${intent.category}/${intent.subtype} (confidence: ${intent.confidence})`,
        );
        return intent;
    }

    /**
     * 필요한 컨텍스트 수집
     */
    async gatherContext(
        options: ConversationOptions,
        intent: IntentDetectionResult,
    ): Promise<GatheredContext> {
        WebviewBridge.sendProcessingStep(options.webviewToRespond, 'assembling');
        WebviewBridge.sendProcessingStatus(
            options.webviewToRespond,
            'assembling',
            '컨텍스트 수집 중...',
        );

        const contextData = await this.contextManager.collectContext({});

        // selectedFiles에서 파일 내용 읽기
        let selectedFilesContent = '';
        if (options.selectedFiles && options.selectedFiles.length > 0) {
            const fileContents: string[] = [];
            for (const filePath of options.selectedFiles) {
                try {
                    const uri = vscode.Uri.file(filePath);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const content = document.getText();
                    const fileName = filePath.split(/[/\\]/).pop() || filePath;
                    fileContents.push(`=== ${fileName} (${filePath}) ===\n${content}\n`);
                } catch (error) {
                    console.warn(`[ContextGatherer] Failed to read file ${filePath}:`, error);
                }
            }
            selectedFilesContent = fileContents.join('\n\n');
        }

        // 에디터에서 선택된 코드 스니펫 포함
        if (options.selectedCode) {
            const codeBlock = `=== 에디터 선택 코드 ===\n${options.selectedCode}\n`;
            selectedFilesContent = selectedFilesContent
                ? `${selectedFilesContent}\n\n${codeBlock}`
                : codeBlock;
        }

        // Ask 모드: 메시지에서 언급된 파일명을 자동 감지하여 컨텍스트에 포함
        if (options.promptType === PromptType.GENERAL_ASK && options.userQuery) {
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (workspaceRoot) {
                    const mentionedFiles = await RelevantFilesFinder.findExplicitFiles(
                        options.userQuery,
                        workspaceRoot,
                        options.abortSignal,
                    );
                    const alreadySelected = new Set((options.selectedFiles || []).map((f) => f.toLowerCase()));
                    const newFiles = mentionedFiles.filter((f) => !alreadySelected.has(f.toLowerCase()));
                    if (newFiles.length > 0) {
                        const fileContents: string[] = [];
                        for (const filePath of newFiles) {
                            try {
                                const uri = vscode.Uri.file(filePath);
                                const document = await vscode.workspace.openTextDocument(uri);
                                const content = document.getText();
                                const fileName = filePath.split(/[/\\]/).pop() || filePath;
                                fileContents.push(`=== ${fileName} (${filePath}) ===\n${content}\n`);
                            } catch (error) {
                                console.warn(`[ContextGatherer] Failed to read auto-detected file ${filePath}:`, error);
                            }
                        }
                        if (fileContents.length > 0) {
                            selectedFilesContent += (selectedFilesContent ? '\n\n' : '') + fileContents.join('\n\n');
                        }
                    }
                }
            } catch (error) {
                console.warn('[ContextGatherer] Ask mode auto file detection failed:', error);
            }
        }

        // 터미널 컨텍스트
        const terminalContextContent = options.terminalContext || '';
        if (terminalContextContent) {
            console.log('[ContextGatherer] Terminal context included in system prompt');
        }

        // Diagnostics 컨텍스트
        const diagnosticsContextContent = options.diagnosticsContext || '';
        if (diagnosticsContextContent) {
            console.log('[ContextGatherer] Diagnostics context included in system prompt');
        }

        // v9.2.1: 프레임워크 세부 스택 규칙 생성
        let frameworkRulesPrompt = '';
        try {
            frameworkRulesPrompt = await this.contextManager.getFrameworkRulesPrompt();
            if (frameworkRulesPrompt) {
                console.log('[ContextGatherer] Framework rules prompt generated');
            }
        } catch (error) {
            console.warn('[ContextGatherer] Failed to generate framework rules:', error);
        }

        // 서버 RAG 검색 — standalone 모드에서는 비활성화
        const ragContext = '';

        // Git 컨텍스트 수집
        let gitContext = '';
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot) {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);
                const [branchResult, remoteResult] = await Promise.all([
                    execAsync('git branch --show-current', { cwd: workspaceRoot }).catch(() => ({ stdout: '' })),
                    execAsync('git remote get-url origin', { cwd: workspaceRoot }).catch(() => ({ stdout: '' })),
                ]);
                const branch = branchResult.stdout.trim();
                const remote = remoteResult.stdout.trim();
                if (branch) {
                    gitContext = `\n## Git 리포지토리 정보\n- **현재 브랜치**: ${branch}\n`;
                    if (remote) {
                        gitContext += `- **원격 저장소**: ${remote}\n`;
                    }
                    gitContext += `\nGit 관련 작업 시 위 정보를 참고하세요.\n`;
                }
            }
        } catch {
            // Git 정보 수집 실패는 무시
        }

        // 서브프로젝트 구조 감지 (모노레포/멀티 디렉토리 경로 grounding)
        let subProjectStructure: string | undefined;
        try {
            const workspaceRoot2 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot2) {
                const { SubProjectDetector } = require('../../project/SubProjectDetector');
                subProjectStructure = SubProjectDetector.formatForPrompt(workspaceRoot2);
                if (subProjectStructure) {
                    console.log(`[ContextGatherer] SubProject structure detected (${subProjectStructure.length} chars)`);
                }
            }
        } catch (error) {
            console.warn('[ContextGatherer] SubProject detection failed (non-critical):', error);
        }

        // Repo Map 생성 (파일 경로 + 심볼 맵 — LLM 경로 추측 방지)
        let repoMap: string | undefined;
        try {
            const workspaceRoot3 = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot3) {
                const { RepoMapGenerator } = require('../../context/RepoMapGenerator');
                const result = await RepoMapGenerator.generate(workspaceRoot3);
                repoMap = result.map;
                console.log(`[ContextGatherer] RepoMap generated: ${result.strategy} (${result.fileCount} files, ${result.symbolCount} symbols, ${result.map.length} chars)`);
            }
        } catch (error) {
            console.warn('[ContextGatherer] RepoMap generation failed (non-critical):', error);
        }

        return {
            codebaseContext: contextData.file?.content,
            realTimeInfo: contextData.terminal?.lastOutput,
            profileContext: contextData.project?.structure,
            intentContext: JSON.stringify(intent),
            gitContext,
            languageInstruction: '반드시 한국어로 답변하세요.',
            selectedFilesContent,
            terminalContextContent,
            diagnosticsContextContent,
            frameworkRulesPrompt,
            ragContext,
            subProjectStructure,
            repoMap,
        };
    }
}
