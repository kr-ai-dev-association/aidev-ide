/**
 * Critic Pass Prompt
 * LLM이 생성/수정한 코드를 재검증하는 프롬프트
 */

export interface CriticPassPromptOptions {
    createdFiles: Array<{ path: string; content: string }>;
    modifiedFiles: Array<{ path: string; content: string; originalContent?: string }>;
    userRequest: string;
    projectType?: string;
    languageInstruction?: string;
}

export function getCriticPassPrompt(options: CriticPassPromptOptions): string {
    const {
        createdFiles,
        modifiedFiles,
        userRequest,
        projectType = "unknown",
        languageInstruction = "",
    } = options;

    // 생성된 파일 섹션
    const createdFilesSection = createdFiles.length > 0
        ? `
## 생성된 파일
${createdFiles.map(f => `### ${f.path}
\`\`\`
${f.content}
\`\`\``).join('\n\n')}`
        : "";

    // 수정된 파일 섹션
    const modifiedFilesSection = modifiedFiles.length > 0
        ? `
## 수정된 파일
${modifiedFiles.map(f => `### ${f.path}
${f.originalContent ? `**수정 전:**
\`\`\`
${f.originalContent}
\`\`\`

**수정 후:**` : ''}
\`\`\`
${f.content}
\`\`\``).join('\n\n')}`
        : "";

    return `당신은 코드 리뷰 전문가입니다. 다른 LLM이 생성/수정한 코드를 검증하고 문제가 있다면 수정해야 합니다.

## 원래 사용자 요청
${userRequest}

## 프로젝트 타입
${projectType}
${createdFilesSection}
${modifiedFilesSection}

## 검증 지침

다음 항목들을 검토하세요:

1. **요구사항 충족**: 사용자 요청을 정확히 구현했는가?
2. **구문 오류**: 문법적 오류가 없는가?
3. **논리 오류**: 로직이 올바른가?
4. **누락된 부분**: 필요한 import, export, 의존성이 모두 있는가?
5. **일관성**: 기존 코드 스타일과 일관성이 있는가?
6. **보안**: 명백한 보안 취약점이 없는가?

## 응답 형식

JSON 형식으로 응답하세요:

\`\`\`json
{
  "status": "pass" | "fail",
  "issues": [
    {
      "file": "파일 경로",
      "line": 줄 번호 (선택적),
      "severity": "error" | "warning",
      "description": "문제 설명"
    }
  ],
  "fixes": [
    {
      "file": "수정할 파일 경로",
      "action": "create" | "modify",
      "content": "수정된 전체 파일 내용"
    }
  ],
  "summary": "검증 결과 요약"
}
\`\`\`

**중요 규칙:**
- status가 "pass"이면 issues와 fixes는 빈 배열이어야 합니다.
- status가 "fail"이면 반드시 fixes에 수정 방안을 제시해야 합니다.
- 작은 스타일 문제는 무시하고, 실제 기능에 영향을 주는 문제만 지적하세요.
- 수정할 때는 반드시 전체 파일 내용을 제공하세요.
${languageInstruction}`;
}

/**
 * Critic Pass 결과 파싱
 */
export interface CriticPassResult {
    status: "pass" | "fail";
    issues: Array<{
        file: string;
        line?: number;
        severity: "error" | "warning";
        description: string;
    }>;
    fixes: Array<{
        file: string;
        action: "create" | "modify";
        content: string;
    }>;
    summary: string;
}

export function parseCriticPassResult(response: string): CriticPassResult | null {
    try {
        // JSON 블록 추출
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : response;

        const result = JSON.parse(jsonStr);

        // 기본값 설정
        return {
            status: result.status || "pass",
            issues: result.issues || [],
            fixes: result.fixes || [],
            summary: result.summary || "",
        };
    } catch (error) {
        console.error("[CriticPass] Failed to parse result:", error);
        return null;
    }
}
