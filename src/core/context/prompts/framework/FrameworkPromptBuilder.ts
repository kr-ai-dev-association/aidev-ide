/**
 * Framework Prompt Builder
 * FrameworkAdapter의 정보를 활용하여 동적 프롬프트 생성
 */

import { IFrameworkAdapter } from '../../../project/framework/IFrameworkAdapter';
import * as framework from './index';

export class FrameworkPromptBuilder {
  /**
   * FrameworkAdapter 정보를 활용하여 프레임워크 프롬프트 생성
   */
  public static buildFromAdapter(adapter: IFrameworkAdapter): string {
    const parts: string[] = [];
    
    // 기본 프레임워크 프롬프트 가져오기
    const basePrompt = this.getBaseFrameworkPrompt(adapter);
    if (basePrompt) {
      parts.push(basePrompt);
    }
    
    // FrameworkAdapter의 명령어 정보를 프롬프트에 반영
    const commandInfo = this.buildCommandInfo(adapter);
    if (commandInfo) {
      parts.push(commandInfo);
    }
    
    // FrameworkAdapter의 구조 정보를 프롬프트에 반영
    const structureInfo = this.buildStructureInfo(adapter);
    if (structureInfo) {
      parts.push(structureInfo);
    }
    
    return parts.join('\n\n');
  }
  
  /**
   * 기본 프레임워크 프롬프트 가져오기
   */
  private static getBaseFrameworkPrompt(adapter: IFrameworkAdapter): string {
    const adapterId = adapter.frameworkId.toLowerCase();
    const adapterName = adapter.frameworkName.toLowerCase();
    const adapterFramework = adapter.framework?.toLowerCase() || '';
    
    // frameworkId로 매칭
    if (adapterId === 'typescript') {
      if (adapterFramework.includes('vite') || adapterName.includes('vite')) {
        return framework.getVitePrompt();
      }
      if (adapterFramework.includes('express') || adapterName.includes('express')) {
        return framework.getExpressPrompt();
      }
      return framework.getNodeTypeScriptPrompt();
    }
    
    if (adapterId === 'spring-boot' || adapterName.includes('spring')) {
      return framework.getSpringBootPrompt();
    }
    
    return '';
  }
  
  /**
   * FrameworkAdapter의 명령어 정보를 프롬프트에 반영
   */
  private static buildCommandInfo(adapter: IFrameworkAdapter): string {
    const commands: string[] = [];
    
    const installCmd = adapter.getInstallCommand();
    const buildCmd = adapter.getBuildCommand();
    const devCmd = adapter.getDevCommand();
    const testCmd = adapter.getTestCommand();
    
    if (installCmd || buildCmd || devCmd || testCmd) {
      commands.push(`**${adapter.frameworkName} 명령어:**`);
      
      if (installCmd) {
        commands.push(`- 의존성 설치: \`${installCmd}\``);
      }
      if (buildCmd) {
        commands.push(`- 빌드: \`${buildCmd}\``);
      }
      if (devCmd) {
        commands.push(`- 개발 서버: \`${devCmd}\``);
      }
      if (testCmd) {
        commands.push(`- 테스트: \`${testCmd}\``);
      }
    }
    
    return commands.length > 1 ? commands.join('\n') : '';
  }
  
  /**
   * FrameworkAdapter의 구조 정보를 프롬프트에 반영
   */
  private static buildStructureInfo(adapter: IFrameworkAdapter): string {
    const info: string[] = [];
    
    const sourceDirs = adapter.getSourceDirectories();
    const testDirs = adapter.getTestDirectories();
    const requiredFiles = adapter.getRequiredConfigFiles();
    
    if (sourceDirs.length > 0 || testDirs.length > 0 || requiredFiles.length > 0) {
      info.push(`**${adapter.frameworkName} 프로젝트 구조:**`);
      
      if (requiredFiles.length > 0) {
        info.push(`- 필수 설정 파일: ${requiredFiles.join(', ')}`);
      }
      if (sourceDirs.length > 0) {
        info.push(`- 소스 디렉토리: ${sourceDirs.join(', ')}`);
      }
      if (testDirs.length > 0) {
        info.push(`- 테스트 디렉토리: ${testDirs.join(', ')}`);
      }
    }
    
    return info.length > 1 ? info.join('\n') : '';
  }
}

