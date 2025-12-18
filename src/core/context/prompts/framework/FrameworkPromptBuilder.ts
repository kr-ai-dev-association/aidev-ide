/**
 * Framework Prompt Builder
 * 프레임워크 이름 기반으로 프롬프트 생성
 */

import * as framework from './index';

/**
 * Framework Prompt Builder
 * 프레임워크 이름 기반으로 프롬프트 생성
 */
export class FrameworkPromptBuilder {
  /**
   * 프로젝트 컨텍스트 프롬프트 생성
   * 프레임워크 이름 기반으로 프롬프트 생성
   */
  public static buildProjectContextPrompt(
    projectType: string,
    framework?: string[],
  ): string {
    let prompt = `\n## 프로젝트 컨텍스트:\n프로젝트 타입: ${projectType}`;

    if (framework && framework.length > 0) {
      prompt += `\n기술 스택: ${framework.join(', ')}`;

      // 프레임워크별 프롬프트 추가
      const frameworkPrompt = this.getFrameworkPromptByName(framework);
      if (frameworkPrompt) {
        prompt += `\n\n${frameworkPrompt}`;
      }
    }

    // LLM이 프로젝트 파일을 읽어서 판단하도록 지시
    prompt += `\n\n**중요**: 프로젝트의 설정 파일(package.json, pom.xml, build.gradle, vite.config.ts 등)을 읽어서 적절한 명령어와 구조를 판단하세요.`;

    return prompt;
  }

  /**
   * 프레임워크 이름으로 프롬프트 가져오기
   */
  private static getFrameworkPromptByName(frameworkNames: string[]): string {
    const prompts: string[] = [];

    for (const name of frameworkNames) {
      const lowerName = name.toLowerCase();

      if (lowerName.includes('vite')) {
        prompts.push(framework.getViteTypePrompt());
      } else if (lowerName.includes('express')) {
        prompts.push(framework.getExpressPrompt());
      } else if (lowerName.includes('spring') || lowerName.includes('spring-boot')) {
        prompts.push(framework.getSpringBootPrompt());
      } else if (lowerName.includes('typescript') || lowerName.includes('node')) {
        prompts.push(framework.getNodeTypeScriptPrompt());
      }
    }

    return prompts.join('\n\n');
  }
}

