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
  userQuery?: string; // 사용자 쿼리 (프레임워크 추출용)
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
      console.log(`[PromptBuilder] 프로젝트에서 프레임워크 감지: ${frameworkName}`);
    } else if (options.userQuery) {
      // 프로젝트가 감지되지 않았을 때 사용자 쿼리에서 프레임워크 추출
      frameworkName = this.extractFrameworkFromQuery(options.userQuery);
      console.log(`[PromptBuilder] 사용자 쿼리에서 프레임워크 추출: ${frameworkName || '없음'} (쿼리: ${options.userQuery.substring(0, 100)})`);
    }

    const composerOptions: PromptComposerOptions = {
      userOS: this.userOS,
      modelType: this.modelType,
      taskType: taskType,
      frameworkName,
      projectType: currentProject?.type,
      codebaseContext: codebaseContext, // 코드베이스 컨텍스트 포함
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

  /**
   * 사용자 쿼리에서 프레임워크 키워드를 추출합니다.
   */
  private extractFrameworkFromQuery(userQuery: string): string | undefined {
    const lower = userQuery.toLowerCase();

    // Vite 감지 (React TypeScript + Vite 조합)
    if (lower.includes('vite')) {
      return 'vite';
    }

    // Spring Boot 감지
    if (lower.includes('spring') || lower.includes('spring-boot') || lower.includes('springboot')) {
      return 'spring-boot';
    }

    // Express 감지
    if (lower.includes('express')) {
      return 'express';
    }

    // Node.js TypeScript 감지 (한글 포함)
    const hasNode = lower.includes('node') || lower.includes('nodejs') || lower.includes('node.js') || userQuery.includes('노드');
    const hasTypeScript = lower.includes('typescript') || lower.includes('type script') || lower.includes('ts') ||
      userQuery.includes('타입스크립트') || userQuery.includes('타입 스크립트');

    if (hasNode && hasTypeScript) {
      return 'node-typescript';
    }

    // 백엔드 프로젝트 + TypeScript 조합도 감지
    if ((lower.includes('backend') || lower.includes('back-end') || lower.includes('백엔드') || lower.includes('백엔')) && hasTypeScript) {
      return 'node-typescript';
    }

    return undefined;
  }
}

