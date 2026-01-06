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

**조사 단계의 역할:**
- 읽기 전용 도구(<read_file>, <list_files>, <search_files>, <ripgrep_search>)를 사용하여 정보를 수집하세요.
- 충분한 정보가 수집되었다면 <plan> 태그만 제출하세요.
- ⚠️ 실행 도구(<create_file>, <update_file>, <remove_file>, <run_command>)는 조사 단계에서 절대 사용하지 마세요.

## Constraints (지침)
1. **First, Investigation**: 코드 수정 전에 반드시 \`list_files\`, \`read_file\`, \`ripgrep_search\`를 통해 현황을 먼저 파악하세요.
2. **Fact-Check**: 파일이 존재한다고 가정하지 말고 직접 내용을 확인하세요. **특히 Vite 초기 템플릿 등 예상과 다른 구조인지 확인이 필수적입니다.**
3. **Planning (필수)**: **작업을 시작하기 전에 반드시 <plan> 태그를 사용하여 단계별 계획을 수립해야 합니다.**
   - ⚠️ **절대 금지**: 조사 단계에서는 실행 도구(<create_file>, <update_file>, <remove_file>, <run_command>)를 **절대로 사용할 수 없습니다.**
   - ⚠️ **절대 금지**: <plan> 태그와 함께 실행 도구를 같은 응답에 포함하는 것은 **엄격히 금지**됩니다.
   - 조사 단계에서는 오직 읽기 전용 도구(<read_file>, <list_files>, <search_files>, <ripgrep_search>)만 사용할 수 있습니다.
   - <plan> 태그만 제출하세요. 실행 도구는 계획이 승인된 후 실행 단계에서만 사용됩니다.
4. **Patch Strategy**: 파일 구조가 단순하거나(예: < 50줄) 예상과 많이 다르다면 \`update_file\`의 SEARCH/REPLACE 대신 \`create_file\`로 전체를 재작성하세요. (단, 이는 실행 단계에서만 적용됩니다)
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
    
    **⚠️ 절대 금지 사항 (조사 단계):**
    - ❌ <plan> 태그와 함께 <create_file>, <update_file>, <remove_file>, <run_command>를 같은 응답에 포함하는 것
    - ❌ 조사 단계에서 실행 도구를 사용하는 것
    - ❌ 계획 없이 실행 도구를 호출하는 것
    
    **✅ 올바른 조사 단계 응답 형식:**
    1. 조사 도구만 사용: <read_file>...</read_file> 또는 <list_files>...</list_files>
    2. 계획만 제출: <plan>...</plan> (실행 도구 없이)
    
    **❌ 잘못된 예시 (절대 금지):**
    <plan>...</plan>
    <create_file>...</create_file>  ← 이것은 조사 단계에서 금지됩니다!
    
    충분한 정보가 수집되었다면 **오직 <plan> 태그만** 출력하세요. 실행 도구는 절대 포함하지 마세요.
    
    계획이 승인되면 시스템이 자동으로 실행 단계로 전환하며, 그때 실행 도구를 사용할 수 있습니다.
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
