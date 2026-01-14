"use strict";
/**
 * Node.js TypeScript 프레임워크 프롬프트 컴포넌트
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNodeTypeScriptPrompt = getNodeTypeScriptPrompt;
function getNodeTypeScriptPrompt() {
    return `**Node.js TypeScript 프로젝트 특화 규칙:**
- 프로젝트 컨텍스트: Node.js / TypeScript
- 타입 안정성: tsconfig 준수, 타입 경고 해결 우선
- **중요: package.json과 tsconfig.json을 먼저 확인하고, 현재 설정에 맞게 작업 수행**
- **ES 모듈(import/export) 방식 사용**: CommonJS(require/module.exports) 대신 ESM 모듈 문법 사용
- **새 프로젝트 생성 시에만** package.json에 "type": "module" 필드 추가 (기존 프로젝트는 현재 설정 유지)
- **node 로 바로 실행 가능하도록 설정**: package.json의 scripts에 "dev": "tsx watch src/index.ts" + index.ts 경로 추가
- **매우 중요: ESM 모듈 실행 도구 선택**:
  * package.json에 "type": "module"이 있으면 **ts-node-dev는 사용하지 마세요**. ts-node-dev는 ESM 모듈을 제대로 처리하지 못합니다.
  * **반드시 tsx를 사용하세요**: tsx는 ESM을 완벽하게 지원합니다.
  * package.json scripts 예시:
    - 올바른 예: "dev": "tsx watch src/index.ts" 또는 "dev": "tsx src/index.ts"
    - 잘못된 예: "dev": "ts-node-dev src/index.ts" (ESM 모듈에서 오류 발생)
  * tsx가 설치되어 있지 않으면: npm install -D tsx
  * **오류 발생 시**: "Error: Must use import to load ES Module" 오류가 발생하면, ts-node-dev를 tsx로 교체하세요.
  * **중요**: "type": "module"은 유지하세요. tsx는 ESM을 완벽하게 지원합니다.
  * **ES Module 실행 오류 방지 (매우 중요)**:
    - "Error: Must use import to load ES Module" 오류는 package.json에 "type": "module"이 있는데 ts-node-dev를 사용할 때 발생합니다.
    - **절대 해결 방법**: ts-node-dev를 사용하지 말고 반드시 tsx를 사용하세요.
    - package.json scripts에서 "ts-node-dev"를 "tsx"로 교체하세요.
    - 예: "dev": "ts-node-dev src/server.ts" → "dev": "tsx watch src/server.ts"
    - tsx가 설치되어 있지 않으면: npm install -D tsx
    - **절대 하지 말 것**: "type": "module"을 제거하거나 "CommonJS"로 변경하지 마세요. tsx를 사용하면 ESM이 정상 작동합니다.
- **필수 파일**:
  - package.json: "type": "module", express, cors, @types/express, typescript, @types/node, @types/cors, @types/uuid 포함
    * **매우 중요: 코드에서 import하는 모든 패키지는 반드시 package.json의 dependencies 또는 devDependencies에 포함되어야 합니다**
    * **코드에서 사용하는 패키지 자동 감지 및 추가 규칙**:
      - import 문에서 사용하는 패키지는 모두 package.json에 포함
      - 예: import { Pool } from 'pg' → pg와 @types/pg 모두 dependencies에 추가
      - 예: import cors from 'cors' → cors와 @types/cors 모두 dependencies에 추가
      - 예: import express from 'express' → express와 @types/express 모두 dependencies에 추가
      - 예: import dotenv from 'dotenv' → dotenv와 @types/dotenv 모두 dependencies에 추가
    * 예외적으로 자체 타입을 포함한 패키지는 @types 설치를 생략합니다.
      - axios, dayjs, zod, chalk
    * **TypeScript 타입 정의 패키지 (@types/*) 규칙**:
      - 모든 외부 패키지 사용 시 해당하는 @types 패키지도 함께 설치
      - 예: pg 사용 → pg와 @types/pg 모두 dependencies에 추가
      - 예: cors 사용 → cors와 @types/cors 모두 dependencies에 추가
      - 예: express 사용 → express와 @types/express 모두 dependencies에 추가
      - 예: uuid 사용 → uuid와 @types/uuid 모두 dependencies에 추가
    * **package.json 생성 시 체크리스트**:
      1. 생성/수정할 모든 코드 파일의 import 문을 먼저 확인했는가?
      2. import 문에서 사용하는 모든 외부 패키지를 추출했는가? (Node.js 내장 모듈 제외)
      3. 추출한 각 패키지가 package.json의 dependencies 또는 devDependencies에 있는지 확인했는가?
      4. 누락된 패키지가 있으면 반드시 추가했는가?
      5. TypeScript 프로젝트인 경우 각 패키지에 대응하는 @types 패키지도 확인하고 추가했는가? (자체 타입 포함 패키지 제외)
      6. 최종 검증: 모든 import 문의 패키지가 package.json에 포함되었는지 다시 확인했는가?
      7. 예시: pg 사용 시 → "pg": "^8.11.3", "@types/pg": "^8.10.9" 추가
    * **기존 규칙 (참고)**:
      - cors 사용 시 → cors와 @types/cors 모두 설치
      - express 사용 시 → express와 @types/express 모두 설치
  - **파일/패키지 import 규칙 (매우 중요)**:
    * **모든 import 문을 추가하기 전에 반드시 해당 파일이나 패키지가 실제로 존재하는지 확인하세요.**
    * **파일 import 규칙**:
      - 상대 경로 import(예: \'import { UserService } from \'./services/UserService\'\')를 추가할 때는, 해당 파일이 실제로 존재하는지 먼저 확인합니다.
      - 파일이 존재하지 않으면 import를 추가하지 마세요. 또는 파일을 먼저 생성한 후에 import를 추가하세요.
      - "있다고 가정"하거나 "있다고 가정하고" 같은 표현을 사용하지 마세요. 실제로 존재하는 파일만 import하세요.
    * **패키지 import 규칙**:
      - 외부 패키지 import(예: \'import axios from \'axios\'\')를 추가할 때는, package.json의 dependencies 또는 devDependencies에 해당 패키지가 실제로 포함되어 있는지 먼저 확인합니다.
      - 패키지가 설치되지 않았다면 import를 추가하지 마세요. 또는 package.json에 패키지를 추가한 후에 import를 추가하세요.
      - "있다고 가정"하거나 "설치되어 있다고 가정" 같은 표현을 사용하지 마세요. 실제로 설치된 패키지만 import하세요.
  - tsconfig.json: ES 모듈 호환 설정 필수
    * module: "CommonJS"
    * target: "ES2022" 
    * moduleResolution: "node"
    * "strict": true, "esModuleInterop": true, "skipLibCheck": true, "forceConsistentCasingInFileNames": true 설정`;
}
//# sourceMappingURL=NodeTypeScriptPrompt.js.map