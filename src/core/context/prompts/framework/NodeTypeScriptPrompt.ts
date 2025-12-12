/**
 * Node.js TypeScript 프레임워크 프롬프트 컴포넌트
 */

export function getNodeTypeScriptPrompt(): string {
  return `**Node.js TypeScript 프로젝트 특화 규칙:**
- 프로젝트 컨텍스트: Node.js / TypeScript
- 타입 안정성: tsconfig 준수, 타입 경고 해결 우선
- **ES 모듈(import/export) 방식 사용**: CommonJS(require/module.exports) 대신 ESM 모듈 문법 사용
- **package.json에 "type": "module" 필드 추가 필수**
- **node 로 바로 실행 가능하도록 설정**: package.json의 scripts에 "dev": "tsx watch src/index.ts" + index.ts 경로 추가
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
  - tsconfig.json: ES 모듈 호환 설정 필수
    * module: "CommonJS"
    * target: "ES2022" 
    * moduleResolution: "node"
    * "strict": true, "esModuleInterop": true, "skipLibCheck": true, "forceConsistentCasingInFileNames": true 설정`;
}

