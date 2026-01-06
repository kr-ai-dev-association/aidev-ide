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
        Tool.SEARCH_FILES,
        Tool.RIPGREP_SEARCH
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
당신의 목표는 사용자 요청을 해결하기 위해 최적의 경로를 찾는 것입니다. 
**현재 코드베이스의 상태(Facts)**를 수집하고 분석하여, 문제를 해결하기 위한 정확한 정보를 파악하세요.
충분한 정보가 수집되었다면 즉시 작업을 시작하거나 계획(<plan>)을 제출하세요.
필요하다면 조사 단계에서도 즉시 도구를 사용하여 문제를 해결할 수 있습니다.

## Constraints (지침)
1. **First, Investigation**: 코드 수정 전에 반드시 \`list_files\`, \`read_file\`, \`ripgrep_search\`를 통해 현황을 먼저 파악하세요.
2. **Fact-Check**: 파일이 존재한다고 가정하지 말고 직접 내용을 확인하세요. **특히 Vite 초기 템플릿 등 예상과 다른 구조인지 확인이 필수적입니다.**
3. **Planning (필수)**: **작업을 시작하기 전에 반드시 <plan> 태그를 사용하여 단계별 계획을 수립해야 합니다.**
   - 조사 단계에서는 실행 도구(<create_file>, <update_file>, <remove_file>, <run_command>)를 사용할 수 없습니다.
   - 계획을 수립한 후에는 각 계획 항목에 해당하는 도구 호출을 같은 응답에 포함할 수 있습니다.
4. **Patch Strategy**: 파일 구조가 단순하거나(예: < 50줄) 예상과 많이 다르다면 \`update_file\`의 SEARCH/REPLACE 대신 \`create_file\`로 전체를 재작성하세요.
5. **Safety**: 파일 삭제(\`remove_file\`) 등 파괴적인 작업은 신중하게 결정하고 계획에 포함시키세요.

    ## Plan Format (MANDATORY)
    계획은 반드시 다음 XML 구조를 엄격히 지켜야 합니다. **절대 숫자 리스트(1., 2. 등)를 사용하지 마세요.**
    - <title>: 수행할 작업의 요약 (예: "Button 컴포넌트 생성")
    - <detail>: 작업에 대한 간결한 설명 (파일 경로, 수정할 함수 등). **주의: 실제 소스코드를 여기에 포함하지 마세요.** 코드는 나중에 실행 단계에서 도구를 통해 작성합니다.
    
    ### 올바른 예시:
    <plan>
      <item>
        <title>파일 구조 분석</title>
        <detail>list_files를 사용하여 프로젝트 구조를 파악합니다.</detail>
      </item>
      <item>
        <title>컴포넌트 구현</title>
        <detail>분석된 내용을 바탕으로 코드를 작성합니다.</detail>
      </item>
    </plan>

    ### 잘못된 예시 (절대 금지):
    <plan>
    1. 파일 구조 분석
    2. 컴포넌트 구현
    </plan>
    
    **중요: 조사 단계에서는 반드시 <plan> 태그를 먼저 생성해야 합니다.**
    - 실행 도구(<create_file>, <update_file>, <remove_file>, <run_command>)는 조사 단계에서 사용할 수 없습니다.
    - 계획을 수립한 후에는 각 계획 항목에 해당하는 도구 호출을 같은 응답에 포함할 수 있습니다.
    - 예시: <plan>...</plan> 다음에 바로 <create_file>...</create_file> 또는 <update_file>...</update_file>를 호출하세요.
    - 이렇게 하면 계획 수립 후 추가 LLM 호출 없이 즉시 작업을 시작할 수 있습니다.
    
    충분한 정보가 수집되었다면 즉시 위 구조에 맞춰 <plan> 태그를 출력하세요.
    
    계획이 승인되면 즉시 실행 단계로 전환되며, 도구 호출이 있으면 바로 실행됩니다.
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
