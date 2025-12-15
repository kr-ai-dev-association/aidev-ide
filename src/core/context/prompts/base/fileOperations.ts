/**
 * File Operations 프롬프트 컴포넌트
 * 파일 작업 형식 및 규칙
 */

export function getFileOperationsRules(): string {
    return `파일 작업 형식:
- 새 파일: "새 파일: [파일경로]" + 코드 블록
- 수정 파일: "수정 파일: [파일경로]" + 수정된 코드 블록
- 삭제 파일: "삭제 파일: [파일경로]"
- 마크다운(.md): 코드 블록 없이 마크다운 내용 직접 포함

**JSON 파일 주석 금지**:
- **package.json, tsconfig.json, .eslintrc.json 등 모든 JSON 파일에는 주석을 절대 포함하지 마세요.**
- JSON 표준은 주석을 지원하지 않습니다. 주석이 포함되면 파싱 오류가 발생합니다.`;
}

