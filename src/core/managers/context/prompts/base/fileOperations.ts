/**
 * File Operations 프롬프트 컴포넌트
 * 파일 작업 형식 및 규칙
 */

export function getFileOperationsRules(): string {
  return `파일 작업 형식 (XML 전용):

**XML 툴 형식만 사용**
- TOOLS 섹션에 정의된 XML 형식으로만 파일 작업을 지시하세요.
- 예시: \`<create_file><path>src/App.tsx</path><content>...</content></create_file>\`

**JSON 파일 주의**
- package.json, tsconfig.json, .eslintrc.json 등 JSON 파일에는 주석을 절대 포함하지 마세요. JSON 표준은 주석을 허용하지 않습니다.

**tsconfig.json 규칙**
- tsconfig.json에 "references" 필드를 추가하지 마세요. (예: "references": [{ "path": "./tsconfig.node.json" }])`;
}

