/**
 * Task Prompt Components
 * 작업 타입별 프롬프트 컴포넌트 통합 파일
 */
// ==================== Code Work ====================
export function getCodeWorkPrompt() {
    return `**코드 작성 작업 (code_work) 특화 규칙:**

**작업 모드 결정:**
- 정보가 부족하면: 파일 읽기 → 작업 실행 (같은 턴에 가능)
- 정보가 충분하면: 바로 작업 실행
- 복잡하면: Plan 수립 → 실행
- **절대 규칙 충돌로 멈추지 마세요. 의심스러우면 파일을 읽고 실행하세요.**

**파일 작업:**
- 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등) 생성/수정/삭제만 수행.
- **절대로 쉘 스크립트(.sh, .bat, .ps1)나 빌드 스크립트를 생성하지 마세요.**
- **README.md, CHANGELOG.md 등 문서 파일을 생성하지 마세요.** 사용자가 명시적으로 요청한 경우에만 허용됩니다.
- 프로그래밍 언어의 소스 코드 파일만 작성하세요.
- 스크립트/명령어로 파일을 만들거나, 터미널 명령을 포함한 코드블록을 만들지 마세요.
- 빌드/실행 명령은 별도 요청 시에만 처리합니다.`;
}
// ==================== Execution Work ====================
export function getExecutionWorkPrompt() {
    return `**실행 작업 (execution_work) 특화 규칙:**

**작업 모드 결정:**
- 정보가 부족하면: 파일 읽기 → 명령 실행 (같은 턴에 가능)
- 정보가 충분하면: 바로 명령 실행
- **절대 규칙 충돌로 멈추지 마세요. 의심스러우면 파일을 읽고 명령을 실행하세요.**

**실행 작업 규칙:**
- 프로젝트의 설치, 빌드, 배포, 실행을 위한 터미널 명령을 실행합니다.
- 소스 코드 파일을 생성/수정하지 마세요 (code_work가 아닙니다).
- 실행 계획을 만들지 마세요. 직접 명령 실행을 진행하세요.

**절대 하지 말아야 할 것:**
- "실행 계획 (Step-by-Step)" 형식으로 응답
- 스크립트 파일(.sh, .bat, .ps1) 생성 (단순 명령 실행은 스크립트 파일 불필요)
- 플레이스홀더 경로(/path/to/your/sql 등) 사용
- 텍스트 설명만 제공 (실행이 필요한 작업입니다)
- "We need to...", "I should..." 같은 내부 독백 (바로 명령 실행)`;
}
// ==================== Summarize ====================
export function getSummarizationPrompt(options, taskProgress) {
    const includeTechnical = options.includeTechnicalDetails ? '포함' : '제외';
    const includeCode = options.includeCodeSnippets ? '포함' : '제외';
    const includeFiles = options.includeFileChanges ? '포함' : '제외';
    let prompt = `당신은 대화 요약 전문가입니다. 제공된 대화 히스토리를 분석하여 구조화된 요약을 생성해주세요.

## 요약 형식 (반드시 이 형식으로 작성하세요):

### 1. 주요 요청 및 의도
- 사용자의 명시적 요청과 의도를 상세하게 요약
- 모든 사용자 요청을 시간순으로 포함

### 2. 핵심 기술 개념
- 기술 개념, 프레임워크, 패턴을 리스트 형식으로 나열
- 예: React, TypeScript, Spring Boot, REST API 등
- 각 개념이 왜 중요한지 간단히 설명

### 3. 파일 및 코드 섹션
- **수정된 파일**: 파일 경로 리스트 (각 파일별로 변경 내용 요약 포함)
- **생성된 파일**: 파일 경로 리스트 (각 파일의 목적과 주요 내용 포함)
- **삭제된 파일**: 파일 경로 리스트
- 각 파일에 대해:
  - 파일이 왜 읽혔거나 수정되었는지 요약
  - 중요한 코드 스니펫 포함 (${includeCode === '포함' ? '필수' : '선택'})
  - 변경사항 요약

### 4. 문제 해결
- 해결된 문제 및 진행 중인 트러블슈팅을 리스트 형식으로 나열
- 각 문제에 대해:
  - 문제 설명
  - 해결 방법
  - 결과

### 5. 대기 중인 작업
- 명시적으로 요청받은 미완료 작업을 리스트 형식으로 나열
- 각 작업의 우선순위와 상태 포함

### 6. 작업 진화
- 작업의 진화 과정을 시간순으로 나열
- **Original Task**: 초기 사용자 요청 (원본 요청을 그대로 복사)
- **Task Modifications**: 사용자가 작업을 수정하거나 방향을 바꾼 내용 (시간순)
- **Current Active Task**: 현재 가장 최근에 요청받은 작업
- **Context for Changes**: 작업이 진화한 이유 (사용자 피드백, 새로운 요구사항 등)
  - 사용자 메시지에서 직접 인용하여 드리프트 방지

### 7. 현재 작업
- 요약 직전 작업 내용을 상세하게 설명
- 가장 최근 메시지들(사용자 및 AI)에 특별히 주의
- 파일명과 코드 스니펫 포함 (${includeCode === '포함' ? '필수' : '선택'})
- **명령어 포함 시**: 실행 가능한 명령어(예: npm run dev, npm install, python main.py 등)는 반드시 코드 블록 형식으로 작성하세요
  - 예: \`\`\`bash\\nnpm run dev\\n\`\`\`
  - 예: \`\`\`powershell\\nnpm install\\n\`\`\`
  - 이렇게 하면 사용자가 명령어를 복사하거나 실행할 수 있습니다

### 8. 다음 단계
- 다음 단계를 한 문장으로 설명
- **중요**: 이 단계는 사용자의 원래 요청과 직접 연관되어야 함
- 가장 최근 작업과 직접적으로 연결되어야 함
- 다음 단계가 없다면 이 섹션을 생략하거나 "없음"으로 표시
- 다음 단계가 있다면:
  - 대화에서 직접 인용하여 정확한 작업 내용 포함
  - 어디서 멈췄는지 명확히 표시
  - **명령어 포함 시**: 실행 가능한 명령어(예: npm run dev, npm install, python main.py 등)는 반드시 코드 블록 형식으로 작성하세요
    - 예: \`\`\`bash\\nnpm run dev\\n\`\`\`
    - 예: \`\`\`powershell\\nnpm install\\n\`\`\`
    - 이렇게 하면 사용자가 명령어를 복사하거나 실행할 수 있습니다

### 9. 필요한 파일
- 다음 단계에 필요한 파일 목록을 리스트 형식으로 나열
- 각 파일 경로는 상대 경로로 작성 (프로젝트 루트 기준)
- 최소한의 필수 파일만 포함 (추측하지 말고 확실한 것만)
- 형식: 각 파일을 새 줄에 "- "로 시작
- 예: 
  - src/main.ts
  - package.json
- 파일이 필요 없다면 이 섹션을 생략

`;
    if (options.includeTechnicalDetails) {
        prompt += `### 10. 기술 세부사항
- 중요한 기술적 세부사항을 포함하세요
- 아키텍처 결정, 디자인 패턴, 성능 고려사항 등
`;
    }
    if (options.includeCodeSnippets) {
        prompt += `### 11. 코드 스니펫
- 중요한 코드 스니펫을 포함하세요
- 전체 파일이 아닌 핵심 부분만 포함
`;
    }
    if (taskProgress) {
        prompt += `\n## 작업 진행 상태:
- 완료: ${taskProgress.completed}/${taskProgress.total}
- 현재 작업: ${taskProgress.currentTask || '없음'}
${taskProgress.errors && taskProgress.errors.length > 0 ? `- 에러: ${taskProgress.errors.join(', ')}` : ''}
`;
    }
    prompt += `\n## 중요 지침:
1. **정확성**: 요약은 대화 내용을 정확하게 반영해야 합니다
2. **간결성**: 핵심 정보만 포함하고 불필요한 세부사항은 제외하세요
3. **구조화**: 위 형식을 정확히 따르세요
4. **완전성**: 모든 섹션을 채워주세요 (해당 사항이 없으면 "없음"으로 표시)
5. **다음 단계**: 다음 단계는 사용자의 원래 요청과 직접 연관되어야 합니다
6. **최신성**: 가장 최근 메시지에 특별히 주의를 기울이세요
7. **인용**: 작업 변경 이유는 사용자 메시지를 직접 인용하세요
8. **명령어 형식 (CRITICAL)**: 실행 가능한 명령어는 반드시 코드 블록 형식으로 작성하세요
   - 잘못된 예: "npm install && npm run dev 로 바로 개발 서버를 실행할 수 있습니다"
   - 올바른 예: "\`\`\`bash\\nnpm install && npm run dev\\n\`\`\` 로 바로 개발 서버를 실행할 수 있습니다"
   - 올바른 예: "이 파일들을 통해 \`\`\`bash\\nnpm install && npm run dev\\n\`\`\` 로 바로 개발 서버를 실행할 수 있습니다"
   - 올바른 예: "다음 명령어를 실행하세요: \`\`\`powershell\\nnpm run dev\\n\`\`\`"
   - **중요**: 명령어가 문장 중간에 있어도 반드시 코드 블록 형식으로 작성하세요

위 형식에 맞춰 요약을 작성해주세요.`;
    return prompt;
}
export function getSimpleSummaryPrompt(createdFiles, modifiedFiles) {
    const createdList = createdFiles.length > 0
        ? createdFiles.map(f => `- \`${f}\``).join('\n')
        : '';
    const modifiedList = modifiedFiles.length > 0
        ? modifiedFiles.map(f => `- \`${f}\``).join('\n')
        : '';
    // 파일 타입에 따른 사용 방법 힌트 생성
    const allFiles = [...createdFiles, ...modifiedFiles];
    const hasPackageJson = allFiles.some(f => f.includes('package.json'));
    const hasTsConfig = allFiles.some(f => f.includes('tsconfig'));
    const hasReactFiles = allFiles.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    const hasPythonFiles = allFiles.some(f => f.endsWith('.py'));
    const hasHtmlFiles = allFiles.some(f => f.endsWith('.html'));
    return `[SYSTEM INSTRUCTION - 요약 생성 단계. 도구 태그 출력 절대 금지]

## 작업한 파일
${createdFiles.length > 0 ? `**생성:**\n${createdList}\n` : ''}
${modifiedFiles.length > 0 ? `**수정:**\n${modifiedList}\n` : ''}

## 출력 형식 (반드시 마크다운 형식으로)

### 작업 완료
(전체 작업을 한 문장으로 요약)

### 변경 내용
(각 파일별로 무엇이 변경/생성되었는지 설명)
- **파일명**: 설명

### 사용 방법
(프로젝트 실행 방법이나 다음 단계 안내 - 해당되는 경우만)

---

## 예시 출력

### 작업 완료
React + TypeScript 기반의 Vite 프로젝트가 초기화되었습니다.

### 변경 내용
- **package.json**: React, React-DOM, Vite 및 TypeScript 관련 의존성 설정
- **tsconfig.json**: TypeScript 컴파일러 옵션 정의 (strict 모드, JSX 지원)
- **src/App.tsx**: 기본 UI를 표시하는 메인 컴포넌트

### 사용 방법
\`\`\`bash
npm install    # 의존성 설치
npm run dev    # 개발 서버 실행
\`\`\`

---

## 절대 금지 사항
- <create_file>, <update_file>, <read_file>, <run_command> 등 XML 도구 태그 출력 금지
- <think>, <reasoning> 등 사고 과정 태그 출력 금지
- 영어로 응답 금지 - 반드시 한국어로만 응답
- "I think", "Let me" 등 사고 과정 표현 금지

지금 바로 한국어로 마크다운 형식의 요약을 작성하세요:`;
}
//# sourceMappingURL=task.js.map