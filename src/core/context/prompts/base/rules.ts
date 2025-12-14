/**
 * Rules 프롬프트 컴포넌트
 * 기본 코딩 규칙 및 가이드라인
 */

export function getBaseRules(): string {
    return `기본 규칙:
- 완전하고 실행 가능한 코드 제공
- 기존 코드 구조와 스타일 유지
- 파일 경로 포함하여 구체적으로 명시
- 한글로 설명 제공
- **프로젝트 파일 읽기**: 명령어나 설정을 생성하기 전에 프로젝트의 설정 파일(package.json, pom.xml, build.gradle, vite.config.ts, tsconfig.json 등)을 먼저 읽어서 현재 설정에 맞게 작업을 수행하세요. (cline 스타일)`;
}

