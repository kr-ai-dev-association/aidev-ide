"use strict";
/**
 * Express 프레임워크 프롬프트 컴포넌트
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpressPrompt = getExpressPrompt;
function getExpressPrompt() {
    return `**Express 기반 프로젝트 특화 규칙:**
- 프로젝트 컨텍스트: Node.js / TypeScript / Express
- **중요: package.json과 기존 Express 서버 파일들을 먼저 확인하고, 현재 설정에 맞게 작업 수행**
- package.json 의존성 정확히 명시 (express, @types/express 등)
- express 패키지 사용, 기본 Express 서버 구조 생성
- **Express 라우터 파일 분석 규칙 (API 경로 인식)**:
  * 라우터 파일(src/routes/*.ts) 과 app 파일(src/index.ts) 을 모두 분석합니다.
  * 주석에 명시된 API 경로(GET /api/refund/:orderId 등)이 있으면 이를 최우선으로 사용합니다.
  * app.use() 마운트 경로와 router.get/post/put/delete 등 내부 경로를 결합해 최종 경로를 계산합니다.
      - 예: app.use('/api/refund', refundRouter) + router.get('/:id') → GET /api/refund/:id
  * 모든 HTTP 메서드(get, post, put, delete, patch)를 인식합니다.
  * 요청 파라미터 구분:
      - req.params: /api/users/:id
      - req.query: /api/users?page=1
      - req.body: POST/PUT JSON 데이터
  * 동적 파라미터(:id 등)를 정확히 인식합니다.
  * 추측 금지 — 파일명이나 일부 경로만 보고 유추하지 않습니다.
  * **올바른 분석 방법**:
      - 모든 라우터 파일을 열어서 확인
      - Express 앱 파일을 열어서 모든 app.use() 확인
      - 주석, 마운트 경로, 라우터 경로를 모두 종합하여 정확한 API 경로 도출
- **ES Module 실행 오류 방지 (매우 중요)**:
  * "Error: Must use import to load ES Module" 오류는 package.json에 "type": "module"이 있는데 ts-node-dev를 사용할 때 발생합니다.
  * **절대 해결 방법**: ts-node-dev를 사용하지 말고 반드시 tsx를 사용하세요.
  * package.json scripts에서 "ts-node-dev"를 "tsx"로 교체하세요.
  * 예: "dev": "ts-node-dev src/server.ts" → "dev": "tsx watch src/server.ts"
  * tsx가 설치되어 있지 않으면: npm install -D tsx
  * **절대 하지 말 것**: "type": "module"을 제거하거나 "CommonJS"로 변경하지 마세요. tsx를 사용하면 ESM이 정상 작동합니다.`;
}
//# sourceMappingURL=ExpressPrompt.js.map