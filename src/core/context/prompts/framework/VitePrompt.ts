/**
 * Vite 프레임워크 프롬프트 컴포넌트
 */

export function getVitePrompt(): string {
  return `**Vite 프로젝트 특화 규칙:**

**중요**: 프로젝트의 package.json과 vite.config.ts를 먼저 확인하여 현재 설정에 맞게 작업을 수행하세요.

- 프로젝트 컨텍스트: React/Vite (TypeScript)
- 프로젝트 컨텍스트: React/Vite (TypeScript)
- **중요: vite.config.ts와 package.json을 먼저 확인하고, 현재 설정에 맞게 작업 수행**
- package.json에서 "vite" 대신 "npx vite" 사용
- **새 프로젝트 생성 시에만** package.json에 "type": "module" 필드 추가 (기존 프로젝트는 현재 설정 유지)
- App, App.css, index.css, main는 필수 입니다.
- React 프로젝트인 경우 vite.config.ts를 확인하여 필요한 플러그인을 설치하고 추가 (예: @vitejs/plugin-react-swc)
- tsconfig.json: ES 모듈 호환 설정 필수
  * module: "CommonJS"
  * moduleResolution: "node"`;
}

