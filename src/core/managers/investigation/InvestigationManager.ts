import * as vscode from 'vscode';
import { BaseManager } from '../base/BaseManager';
import { Tool } from '../../tools/types';

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
        Tool.SEARCH_FILES
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
        return `
## Role: Investigation Manager (Sherlock Holmes for Code)

## Mission
당신의 목표는 사용자 요청을 해결하기 위해 **현재 코드베이스의 상태(Facts)**를 수집하고 분석하는 것입니다.
분석이 완벽히 끝나기 전까지는 코드를 수정할 수 없습니다.

## Constraints (절대 원칙)
1. **READ-ONLY**: 현재 '조사(Investigation)' 단계입니다. 절대 코드를 수정하거나 파일을 생성하지 마세요 (<create_file>, <update_file>, <run_command>, <remove_file> 사용 금지).
2. **Fact-Check**: 파일이 존재한다고 가정하지 말고, \`list_files\`로 확인 후 \`read_file\` 하세요.
3. **PHASE TRANSITION**: 다음 '실행(Execution)' 단계로 넘어가려면 반드시 아래 양식에 맞는 **완전한 계획(<plan>)**을 제출해야 합니다.
4. **Safety**: 파일 삭제(\`remove_file\`)는 파괴적인 작업입니다. 삭제가 필요한 경우 반드시 계획(<plan>)에 포함시키고 그 이유를 상세히 기술해야 합니다. 계획에 없는 삭제는 절대 금지됩니다.

## Plan Format (MANDATORY)
계획은 반드시 다음 XML 구조를 엄격히 지켜야 합니다. 일반 텍스트 리스트는 거부됩니다.
<plan>
  <item>
    <title>작업 제목</title>
    <detail>작업에 대한 상세 설명 (수정할 파일, 함수 등)</detail>
  </item>
  ...
</plan>

## User Query
"${userQuery}"

## Output
정보 수집이 완료되었다면 분석 내용을 요약하고 <plan> 태그를 출력하세요. 계획이 승인되면 즉시 실행 단계로 전환됩니다.
`;
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

