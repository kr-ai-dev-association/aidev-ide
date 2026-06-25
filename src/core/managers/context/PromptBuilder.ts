/**
 * Prompt Builder
 * LLM 프롬프트 생성을 담당하는 서비스
 * OS별, 모델별, 프로젝트별 프롬프트 생성
 *
 * @deprecated 이 클래스는 PromptComposer를 사용하도록 리팩토링되었습니다.
 * 새로운 코드에서는 PromptComposer를 직접 사용하세요.
 */

import { AiModelType, PromptType } from "../../../services";
export { PromptType };
import {
  PromptComposer,
  PromptComposerOptions,
} from "./prompts/PromptComposer";
import { ProjectManager } from "../project/ProjectManager";
import { Tool } from "../../tools/types";
import { getGeneralAskPrompt } from "./prompts/general";

export interface PromptBuilderOptions {
  userOS: string;
  modelType: AiModelType;
  promptType: PromptType;
  codebaseContext?: string;
  realTimeInfo?: string;
  profileContext?: string;
  intentContext?: string;
  gitContext?: string;
  languageInstruction?: string;
  selectedFilesContent?: string; // 사용자가 선택한 파일들의 내용
  terminalContextContent?: string; // 사용자가 선택한 터미널 히스토리
  diagnosticsContextContent?: string; // 사용자가 선택한 Diagnostics (에러/경고)
  taskType?:
    | "code_work"
    | "execution_work"
    | "analysis"
    | "documentation"
    | "terminal";
  userQuery?: string; // 사용자 쿼리 (프레임워크 추출용)
  allowedTools?: Tool[]; // 사용 가능한 도구 목록
  frameworkRulesPrompt?: string; // v9.2.1: 동적 프레임워크 규칙 프롬프트
  hotLoadPrompt?: string; // Hot Load 프롬프트 (최우선 규칙)
  ragContext?: string; // 서버 RAG 검색 결과
  memoryContext?: string; // 영속적 메모리 컨텍스트 (이전 대화에서 저장된 정보)
  activeSkillKeys?: string[]; // IntentDetector가 선택한 활성 스킬 키 목록
  subProjectStructure?: string; // 서브프로젝트 구조 (모노레포 경로 grounding)
  repoMap?: string; // 프로젝트 파일 맵 (파일 경로 + 심볼)
  nativeMode?: boolean; // 네이티브 API Function Call 모드 (코드 블록 형식 교육 제외)
}

export class PromptBuilder {
  private userOS: string;
  private modelType: AiModelType;

  constructor(userOS: string, modelType: AiModelType) {
    this.userOS = userOS;
    this.modelType = modelType;
  }

  /**
   * 최종 시스템 프롬프트를 생성합니다.
   */
  public generateSystemPrompt(options: PromptBuilderOptions): string {
    const {
      promptType,
      codebaseContext,
      realTimeInfo,
      profileContext,
      intentContext,
      gitContext,
      languageInstruction,
      taskType,
    } = options;

    // CODE_GENERATION 타입은 PromptComposer 사용
    const projectManager = ProjectManager.getInstance();
    const currentProject = projectManager.getCurrentProject();

    // ASK(읽기 전용) 모드는 전용 질의응답 프롬프트 사용 — plan 유도 없음 (v2 미러)
    if (promptType === PromptType.GENERAL_ASK) {
      // ASK(읽기 전용 질의응답)는 HotLoad 프롬프트를 제외한다.
      // HotLoad는 "키워드 매칭 시 run_command 도구로 실행"하라는 작업 트리거라,
      // 읽기 전용 ASK에 주입되면 LLM을 도구(tool_code)·작업(plan JSON) 모드로 유도해
      // 자연어 답변을 막는다. (덤프 결과 ASK system prompt의 대부분이 HotLoad였음)
      return getGeneralAskPrompt({
        codebaseContext,
        profileContext,
        intentContext,
        realTimeInfo,
        gitContext,
        languageInstruction,
        selectedFilesContent: options.selectedFilesContent,
        terminalContextContent: options.terminalContextContent,
        diagnosticsContextContent: options.diagnosticsContextContent,
        frameworkRulesPrompt: options.frameworkRulesPrompt,
        ragContext: options.ragContext,
      });
    }

    const composerOptions: PromptComposerOptions = {
      userOS: this.userOS,
      modelType: this.modelType,
      promptType: options.promptType,
      taskType: taskType,
      projectType: currentProject?.type,
      codebaseContext: codebaseContext, // 코드베이스 컨텍스트 포함
      selectedFilesContent: options.selectedFilesContent, // 사용자가 선택한 파일들 내용 포함
      terminalContextContent: options.terminalContextContent, // 사용자가 선택한 터미널 히스토리 포함
      diagnosticsContextContent: options.diagnosticsContextContent, // 사용자가 선택한 Diagnostics 포함
      allowedTools: options.allowedTools, // 허용된 도구 전달
      nativeMode: options.nativeMode, // 네이티브 Function Call 모드
      frameworkRulesPrompt: options.frameworkRulesPrompt, // v9.2.1: 동적 프레임워크 규칙
      hotLoadPrompt: options.hotLoadPrompt, // Hot Load 프롬프트
      ragContext: options.ragContext, // 서버 RAG 문서 컨텍스트
      memoryContext: options.memoryContext, // 영속적 메모리 컨텍스트
      activeSkillKeys: options.activeSkillKeys, // IntentDetector가 선택한 활성 스킬
      subProjectStructure: options.subProjectStructure, // 서브프로젝트 구조
      repoMap: options.repoMap, // 프로젝트 파일 맵
    };

    return PromptComposer.composeSystemPrompt(composerOptions);
  }

  /**
   * 모델 타입을 업데이트합니다.
   */
  public setModelType(modelType: AiModelType): void {
    this.modelType = modelType;
  }

  /**
   * OS를 업데이트합니다.
   */
  public setUserOS(userOS: string): void {
    this.userOS = userOS;
  }
}
