import * as vscode from 'vscode';
import { BaseManager } from '../base/BaseManager';
import { Tool } from '../../tools/types';
import { getInvestigationPrompt as getInvestigationPromptFromFile } from '../context/prompts/phase';

/**
 * 조사 관리자 (Investigation Manager)
 * AI가 코드를 수정하기 전에 프로젝트 상태를 파악하고 사실을 수집하도록 관리합니다.
 */
// @ts-ignore - BaseManager 상속 타입 호환성
export class InvestigationManager extends BaseManager {
  // 조사 단계에서 허용되는 읽기 전용 도구 목록
  private readonly INVESTIGATION_TOOLS: Tool[] = [
    Tool.READ_FILE,
    Tool.LIST_FILES,
    Tool.RIPGREP_SEARCH,
    Tool.MEMORY_SAVE,
    Tool.MEMORY_DELETE,
  ];

  private constructor(context?: vscode.ExtensionContext) {
    super(context);
  }

  public static getInstance(context?: vscode.ExtensionContext): InvestigationManager {
    return BaseManager.getInstance.call(InvestigationManager as any, context) as unknown as InvestigationManager;
  }

  /**
   * 조사 단계 전용 프롬프트를 생성합니다 (v5.2.0: 엄격한 단계 전환 가이드 추가).
   */
  public getInvestigationPrompt(userQuery: string): string {
    // 프롬프트를 context/prompts에서 가져옴
    return getInvestigationPromptFromFile(userQuery);
  }

  /**
   * 지정된 도구가 조사 도구인지 확인합니다.
   */
  public isInvestigationTool(toolName: string): boolean {
    return this.INVESTIGATION_TOOLS.includes(toolName as Tool);
  }

  /**
   * 조사 단계에서 사용 가능한 도구 목록을 반환합니다.
   */
  public getInvestigationTools(): Tool[] {
    return [...this.INVESTIGATION_TOOLS];
  }
}
