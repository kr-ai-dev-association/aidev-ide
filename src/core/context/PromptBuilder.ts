/**
 * Prompt Builder
 * LLM 프롬프트 생성을 담당하는 서비스
 * OS별, 모델별, 프로젝트별 프롬프트 생성
 * 
 * @deprecated 이 클래스는 PromptComposer를 사용하도록 리팩토링되었습니다.
 * 새로운 코드에서는 PromptComposer를 직접 사용하세요.
 */

import { AiModelType, PromptType } from '../../services';
import { PromptComposer, PromptComposerOptions } from './prompts/PromptComposer';
import { ProjectManager } from '../project/ProjectManager';

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
  taskType?: 'code_work' | 'execution_work' | 'analysis' | 'documentation' | 'terminal';
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
    const { promptType, codebaseContext, realTimeInfo, profileContext, intentContext, gitContext, languageInstruction, taskType } = options;

    if (promptType === PromptType.GENERAL_ASK) {
      return `당신은 전문적인 소프트웨어 개발자이자 기술 전문가입니다. 사용자의 질문에 대해 정확하고 유용한 답변을 제공합니다.

주요 지침:
1. 기술적 질문에 대해 명확하고 이해하기 쉬운 답변을 제공하세요.
2. 코드 예제가 필요한 경우 완전하고 실행 가능한 코드를 제공하세요.
3. 한글로 답변하되, 필요한 경우 영어 용어나 코드는 그대로 사용하세요.
4. 실시간 정보가 있는 경우 이를 활용하여 답변하세요.
5. 파일 생성, 수정, 삭제 또는 터미널 명령어 실행은 하지 마세요. 이는 단순 질의 응답 모드입니다.
6. 첨부된 파일이 있는 경우 해당 파일의 내용을 분석하여 답변하세요.

코드베이스 컨텍스트:
${codebaseContext || ''}

프로젝트 프로필:
${profileContext || ''}

사용자 의도:
${intentContext || ''}

실시간 정보:
${realTimeInfo || ''}

${gitContext || ''}

사용자의 질문에 대해 전문적이고 유용한 답변을 제공해주세요.${languageInstruction || ''}`;
    }

    // CODE_GENERATION 타입은 PromptComposer 사용
    const projectManager = ProjectManager.getInstance();
    const currentProject = projectManager.getCurrentProject();

    // 프레임워크 감지
    let frameworkName: string | undefined;
    if (currentProject?.framework) {
      frameworkName = currentProject.framework.toLowerCase();
    }

    const composerOptions: PromptComposerOptions = {
      userOS: this.userOS,
      modelType: this.modelType,
      taskType: taskType,
      frameworkName,
      projectType: currentProject?.type,
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

