/**
 * TaskSplitter
 * 사용자 요청을 서브태스크로 분할하는 모듈
 *
 * LLM 1회 호출로 작업 복잡도 판단 + 분할 수행
 * 단순 작업 → shouldSplit: false (단일 ConversationManager 루프)
 * 복합 작업 → shouldSplit: true + SubTask[] (SubAgentLoop 병렬 실행)
 */

import { LLMManager } from '../managers/model/LLMManager';
import { SubTask, TaskSplitResult, ToolPermission } from './types';

const SYSTEM_PROMPT = `당신은 코딩 어시스턴트의 작업 분할 판단기입니다.
사용자의 요청을 분석하여, 여러 에이전트가 병렬로 처리하면 효율적인지 판단합니다.

## 핵심 원칙

1. **조사(investigation)는 거의 항상 병렬 가능합니다.**
   파일 읽기, 구조 파악, 검색, 코드 분석 같은 읽기 작업은 서로 충돌하지 않습니다.
   여러 영역을 동시에 조사하면 시간이 크게 단축됩니다.

2. **서로 다른 파일/모듈 생성은 병렬 가능합니다.**
   "로그인 페이지 + API 엔드포인트 + 테스트"처럼 각각 다른 파일을 만드는 작업은
   나중에 import로 연결되더라도 생성 자체는 독립적입니다.

3. **같은 파일을 동시에 수정하는 것만 충돌합니다.**
   두 에이전트가 동일한 파일을 동시에 수정하면 충돌이 발생합니다.
   하지만 A가 새 파일을 만들고, B가 다른 새 파일을 만드는 건 안전합니다.

5. **파일 의존성이 있으면 반드시 dependencies에 명시하세요.**
   task-B가 task-A가 생성할 파일을 read_file로 읽어야 한다면,
   task-B의 dependencies에 task-A를 반드시 포함해야 합니다.
   병렬 태스크는 다른 태스크가 생성할 파일에 접근할 수 없습니다.

4. **통합 작업은 병렬 작업 후 순차로 처리합니다.**
   라우팅 연결, index.ts 업데이트 등 여러 결과를 합치는 작업은
   dependencies에 선행 태스크를 명시하면 됩니다.

## 분할 판단 기준

### 분할해야 하는 경우 (shouldSplit: true)
- 서로 다른 디렉토리/모듈에 파일을 생성하는 작업
- 백엔드 + 프론트엔드처럼 레이어가 다른 작업
- 여러 독립 컴포넌트/페이지를 만드는 작업
- 복수 영역의 코드를 조사/분석하는 작업

### 분할하지 않는 경우 (shouldSplit: false)
- 단일 파일 수정 (버그 수정, 리팩토링)
- 하나의 기능만 추가하는 작업
- 전체 흐름이 순차적으로 의존하는 작업 (A 완료 후 B, B 완료 후 C)

## 서브태스크 설계 규칙

- 최소 2개, 최대 5개
- dependencies가 비어있으면 즉시 병렬 실행 가능
- dependencies에 다른 태스크 id가 있으면 해당 태스크 완료 후 실행
- toolPermission 설정:
  - "read-only": 파일 읽기, 검색만 필요 (조사/분석)
  - "read-only-with-commands": 읽기 + 명령어 실행 (테스트, 빌드 확인)
  - "full": 파일 생성/수정/삭제 필요 (구현)

## 예시

### 예시 1: 분할 O
요청: "백엔드 API 추가하고 프론트엔드 대시보드 만들고 테스트도 작성해줘"
→ shouldSplit: true
서브태스크:
  - task-1: "백엔드 API 엔드포인트 생성" (full, dependencies: [])
  - task-2: "프론트엔드 대시보드 페이지 생성" (full, dependencies: [])
  - task-3: "테스트 코드 작성" (full, dependencies: ["task-1", "task-2"])

### 예시 2: 분할 O
요청: "로그인 페이지, 회원가입 페이지, 설정 페이지 만들어줘"
→ shouldSplit: true
서브태스크:
  - task-1: "로그인 페이지 생성 (src/pages/Login.tsx)" (full, dependencies: [])
  - task-2: "회원가입 페이지 생성 (src/pages/Signup.tsx)" (full, dependencies: [])
  - task-3: "설정 페이지 생성 (src/pages/Settings.tsx)" (full, dependencies: [])
  - task-4: "App.tsx에 라우팅 연결" (full, dependencies: ["task-1", "task-2", "task-3"])

### 예시 3: 분할 X
요청: "버튼 하나 추가해줘"
→ shouldSplit: false (단일 파일 수정)

### 예시 4: 분할 X
요청: "이 함수의 버그 찾아서 고쳐줘"
→ shouldSplit: false (하나의 순차적 작업)

## 응답 형식

반드시 유효한 JSON만 출력하세요 (마크다운, 설명 없이):
{
  "shouldSplit": boolean,
  "reasoning": "판단 이유 (한국어, 1-2문장)",
  "subtasks": [
    {
      "id": "task-1",
      "title": "짧은 제목",
      "description": "에이전트에게 전달할 상세 지시사항. 어떤 파일을 만들고, 무엇을 구현해야 하는지 구체적으로 작성.",
      "dependencies": [],
      "toolPermission": "full"
    }
  ]
}
shouldSplit이 false이면 subtasks는 빈 배열.`;

export class TaskSplitter {
    private llmManager: LLMManager;

    constructor() {
        this.llmManager = LLMManager.getInstance();
    }

    async split(userQuery: string, projectContext?: string): Promise<TaskSplitResult> {
        const prompt = this.buildPrompt(userQuery, projectContext);

        try {
            const response = await this.llmManager.sendMessageWithSystemPrompt(
                SYSTEM_PROMPT,
                [{ text: prompt }],
                { disableRetry: true }
            );

            return this.parseResponse(response);
        } catch (error) {
            console.error('[TaskSplitter] LLM call failed:', error);
            return { shouldSplit: false, subtasks: [], reasoning: 'LLM 호출 실패' };
        }
    }

    private buildPrompt(userQuery: string, projectContext?: string): string {
        let prompt = `사용자 요청: ${userQuery}`;
        if (projectContext) {
            prompt += `\n\n프로젝트 정보:\n${projectContext}`;
        }
        return prompt;
    }

    private parseResponse(response: string): TaskSplitResult {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { shouldSplit: false, subtasks: [], reasoning: '응답 파싱 실패' };
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!parsed.shouldSplit || !Array.isArray(parsed.subtasks) || parsed.subtasks.length < 2) {
                console.log(`[TaskSplitter] Not splitting: shouldSplit=${parsed.shouldSplit}, subtasks=${parsed.subtasks?.length ?? 0}, reasoning=${parsed.reasoning}`);
                return { shouldSplit: false, subtasks: [], reasoning: parsed.reasoning || '단일 작업' };
            }

            const subtasks: SubTask[] = parsed.subtasks.map((st: any, i: number) => ({
                id: st.id || `task-${i + 1}`,
                title: st.title || `서브태스크 ${i + 1}`,
                description: st.description || '',
                dependencies: Array.isArray(st.dependencies) ? st.dependencies : [],
                toolPermission: this.validatePermission(st.toolPermission),
            }));

            const independent = subtasks.filter(st => st.dependencies.length === 0);
            const dependent = subtasks.filter(st => st.dependencies.length > 0);

            if (independent.length < 2) {
                console.log(`[TaskSplitter] Not splitting: ${independent.length} independent / ${dependent.length} dependent tasks`);
                return { shouldSplit: false, subtasks: [], reasoning: '병렬 실행 가능한 독립 태스크 부족' };
            }

            console.log(`[TaskSplitter] Split result: ${subtasks.length} total, ${independent.length} independent, ${dependent.length} dependent`);

            return {
                shouldSplit: true,
                subtasks,  // 전체 반환 — 라우터가 독립/의존 실행 순서 결정
                reasoning: parsed.reasoning || '',
            };
        } catch (error) {
            console.error('[TaskSplitter] Failed to parse LLM response:', error);
            return { shouldSplit: false, subtasks: [], reasoning: '파싱 오류' };
        }
    }

    private validatePermission(perm: string): ToolPermission {
        if (perm === 'read-only' || perm === 'read-only-with-commands' || perm === 'full') {
            return perm;
        }
        return 'full';
    }
}
