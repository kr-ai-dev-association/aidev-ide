/**
 * Code Generation 프롬프트 컴포넌트
 * 코드 생성/수정 지침
 */

export function getCodeGenerationGuide(): string {
    return `코드 생성/수정 지침:
- 항상 전체 파일 내용을 제공합니다 (부분 코드 금지)
- 파일 작업 지시어를 명확히 사용: "새 파일:", "수정 파일:", "삭제 파일:"
- 생성/수정/삭제한 파일 목록을 요약에 포함
- 변경 이유와 테스트 방법을 함께 제공합니다`;
}

