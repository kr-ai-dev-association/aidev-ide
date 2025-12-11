/**
 * Vite 프레임워크 프롬프트 컴포넌트
 */

export function getVitePrompt(): string {
    return `**Vite 프로젝트 특화 규칙:**
- package.json에서 "vite" 대신 "npx vite" 사용
- **package.json에 반드시 "type": "module" 필드를 추가하여 ESM 모드 활성화**
- App, App.css, index.css, main는 필수 입니다.
- React 프로젝트인 경우 @vitejs/plugin-react-swc "^4.2.2"가 설치되어 있지 않으면 자동으로 설치하고 vite.config.ts에 플러그인을 추가해야 합니다.
- tsconfig.json: ES 모듈 호환 설정 필수
  * module: "CommonJS"
  * moduleResolution: "node"`;
}

