/**
 * Prompt Builder
 * LLM 프롬프트 생성을 담당하는 서비스
 * OS별, 모델별, 프로젝트별 프롬프트 생성
 */

import { AiModelType, PromptType } from '../../services';
import { OSAdapterFactory } from '../execution/os/OSAdapterFactory';

export interface PromptBuilderOptions {
    userOS: string;
    modelType: AiModelType;
    promptType: PromptType;
    codebaseContext?: string;
    realTimeInfo?: string;
    profileContext?: string;
    intentContext?: string;
    gitContext?: string;
    languageInstruction?: string;
}

export class PromptBuilder {
    private userOS: string;
    private modelType: AiModelType;

    constructor(userOS: string, modelType: AiModelType) {
        this.userOS = userOS;
        this.modelType = modelType;
    }

    /**
     * OS별 시스템 프롬프트를 생성합니다.
     * 모델 타입에 따라 최적화된 프롬프트를 제공합니다.
     */
    public generateOSSpecificSystemPrompt(): string {
        // 추상화 서비스에서 OS 정보 가져오기
        const osDetectionResult = OSAdapterFactory.detect();

        // 프로젝트별 상세 가이드라인은 기존 로직 사용
        const commonGuidelines = this.getCommonGuidelines();
        const modelSpecificPrompt = this.getModelSpecificSystemPrompt();
        const osSpecificGuidelines = this.getOSSpecificGuidelines();

        // 추상화 서비스의 기본 컨텍스트 추가 (간결한 OS 정보)
        const osContextInfo = `**실행 환경:**
- OS: ${osDetectionResult.osName} (${osDetectionResult.osType})
- 셸: ${osDetectionResult.shellType}
- 아키텍처: ${osDetectionResult.architecture}
`;

        return `${osContextInfo}

${commonGuidelines}

${modelSpecificPrompt}

${osSpecificGuidelines}`;
    }

    /**
     * 모든 모델에 공통으로 적용되는 기본 지침
     */
    private getCommonGuidelines(): string {
        return `당신은 전문적인 소프트웨어 개발자입니다. 사용자의 요청에 따라 코드를 생성하고 수정하는 작업을 수행합니다.

기본 규칙:
- 완전하고 실행 가능한 코드 제공
- 기존 코드 구조와 스타일 유지
- 파일 경로 포함하여 구체적으로 명시
- 한글로 설명 제공

실행 의도/터미널 명령 출력 규칙 (중요):
- 실행 명령은 한 줄 순수 명령만 코드블록/백틱에 제공합니다. 주석/echo/if/elif/else/플레이스홀더 경로 금지.
- 최대 4개 이하 명령만 반환하세요.
- 버전 확인은 1회만(예: node -v && npm -v).
- package.json이 없을 때만 init 명령을 포함합니다.
- 설치는 lock 존재 시 npm ci / yarn install --frozen-lockfile / pnpm install --frozen-lockfile 중 하나만, 없으면 npm/yarn/pnpm install 중 하나만(중복 금지).
- npm audit/list/outdated 등 추가 진단 명령은 포함하지 마세요.
- 프레임워크/프로젝트 타입에 맞는 실행 명령을 한 줄만 제시하세요(예: react/vite/next → npm run dev, nest → npm run start:dev 등).

파일 작업 형식:
- 새 파일: "새 파일: [파일경로]" + 코드 블록
- 수정 파일: "수정 파일: [파일경로]" + 수정된 코드 블록
- 삭제 파일: "삭제 파일: [파일경로]"
- 마크다운(.md): 코드 블록 없이 마크다운 내용 직접 포함

프로젝트 특화:
- Vite: 
  * package.json에서 "vite" 대신 "npx vite" 사용
  * **package.json에 반드시 "type": "module" 필드를 추가하여 ESM 모드 활성화s**
  * App, App.css, index.css, main는 필수 입니다.
  * React 프로젝트인 경우 @vitejs/plugin-react-swc "^4.2.2"가 설치되어 있지 않으면 자동으로 설치하고 vite.config.ts에 플러그인을 추가해야 합니다.
  - tsconfig.json: ES 모듈 호환 설정 필수
    * module: "CommonJS"
    * moduleResolution: "node"
- Spring Boot: 3.4.0 이상 사용
- Node.js TypeScript:
  * **ES 모듈(import/export) 방식 사용**: CommonJS(require/module.exports) 대신 ESM 모듈 문법 사용
  * **package.json에 "type": "module" 필드 추가 필수
  * **node 로 바로 실행 가능하도록 설정**: package.json의 scripts에  "dev": "tsx watch src/index.ts" + index.ts 경로 추가
  * **Express 기반**: express 패키지 사용, 기본 Express 서버 구조 생성
  * **Express 라우터 파일 분석 규칙 (API 경로 인식)**:
    * 라우터 파일(src/routes/*.ts) 과 app 파일(src/index.ts) 을 모두 분석합니다.
    * 주석에 명시된 API 경로(GET /api/refund/:orderId 등)이 있으면 이를 최우선으로 사용합니다.
    * app.use() 마운트 경로와 router.get/post/put/delete 등 내부 경로를 결합해 최종 경로를 계산합니다.
        - 예: app.use('/api/refund', refundRouter) + router.get('/:id') → GET /api/refund/:id
    * 모든 HTTP 메서드(get, post, put, delete, patch)를 인식합니다.
    * 요청 파라미터 구분:
        - req.params: /api/users/:id
        - req.query: /api/users?page=1
        - req.body: POST/PUT JSON 데이터
    *동적 파라미터(:id 등)를 정확히 인식합니다.
    * 추측 금지 — 파일명이나 일부 경로만 보고 유추하지 않습니다.
    * **올바른 분석 방법**:
        - 모든 라우터 파일을 열어서 확인
        - Express 앱 파일을 열어서 모든 app.use() 확인
        - 주석, 마운트 경로, 라우터 경로를 모두 종합하여 정확한 API 경로 도출

  * **필수 파일**:
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
      * "strict": true, "esModuleInterop": true, "skipLibCheck": true, "forceConsistentCasingInFileNames": true 설정


**JSON 파일 주석 금지 **:
- **package.json, tsconfig.json, .eslintrc.json 등 모든 JSON 파일에는 주석을 절대 포함하지 마세요.**
- JSON 표준은 주석을 지원하지 않습니다. 주석이 포함되면 파싱 오류가 발생합니다.

**코드 작성 vs 쉘 스크립트 작업 구별 (절대 필수 - 최우선 규칙):**
- **code_work**: 소스 코드 파일(.js, .ts, .py, .java, .go, .rs 등) 생성/수정만 수행.
  - **절대로 쉘 스크립트(.sh, .bat, .ps1)를 생성하지 마세요.**
  - **절대로 터미널 명령어 코드 블록을 생성하지 마세요.**
  - **프로젝트 생성 작업**: pom.xml, package.json, build.gradle 등 프로젝트 구조 파일과 소스 코드 파일만 생성. 빌드/실행 명령은 생성하지 마세요.
  - **프로젝트 생성 시 필수 (절대 금지 사항)**:
    * "프로젝트 만들기", "프로젝트 생성", "react 프로젝트", "vite 프로젝트", "spring boot 프로젝트", "java 프로젝트", "maven 프로젝트" 등 프로젝트 생성 요청 시:
      - **경고: 프로젝트 생성 요청은 반드시 파일 생성만 수행해야 합니다. **
      - **반드시 "새 파일: [파일경로]" 형식으로 모든 필요한 파일을 생성하세요. 이것은 선택 사항이 아닌 필수입니다.**
      - **모든 프로젝트 파일(pom.xml, build.gradle, package.json, src/main/java/.../*.java, src/main/resources/application.yml 등)을 "새 파일:" 지시어로 생성하세요.**
      - **터미널 명령어 코드 블록(\`\`\`bash)은 절대 생성하지 마세요. 이것은 심각한 오류입니다.**
      - **cat <<'EOF' > file 같은 heredoc 명령어는 절대 사용하지 마세요. 이것은 심각한 오류입니다.**
      - **mkdir, cat, echo 같은 파일 생성 명령어는 절대 사용하지 마세요. 이것은 심각한 오류입니다.**
      - **if ! command -v brew 같은 조건문이나 도구 설치 명령어는 절대 포함하지 마세요.**
      - **brew install, apt install 같은 패키지 매니저 명령어도 절대 포함하지 마세요.**
    * **올바른 형식 (반드시 이 형식을 사용하세요)**: 
      - "새 파일: pom.xml" + 코드 블록 (xml)
      - "새 파일: src/main/java/com/example/App.java" + 코드 블록 (java)
      - "새 파일: src/main/resources/application.yml" + 코드 블록 (yaml)
    * **잘못된 형식 (절대 사용 금지)**: 
      - \`\`\`bash\ncat <<'EOF' > pom.xml ... EOF\n\`\`\`
      - \`\`\`bash\nmkdir -p src/main/java\n\`\`\`
      - \`\`\`bash\nif ! command -v brew; then ... fi\n\`\`\`
- **execution_work**: 설치/빌드/배포/실행 스크립트(.sh, .bat, .ps1) 생성 또는 터미널 명령 실행만 수행. 소스 코드 생성 금지.
- **사용자 의도 컨텍스트의 taskType을 반드시 확인하고 그에 맞게 작업하세요.**

쉘 스크립트 규칙:
- 빌드/실행/테스트/배포 관련 작업일 때만 생성
- 일반 작업(파일 정리, 문서화 등)에는 생성하지 않음
- 스크립트 내 프로그래밍 코드는 언어명 callout 명시 (\`\`\`python, \`\`\`javascript 등)
- **중요: 사용자가 직접 명령어를 요청한 경우 (예: "mvn spring-boot:run으로 실행해줘", "npm run dev 실행해줘")**:
  - 스크립트 파일(.sh, .bat, .ps1)을 생성하지 마세요.
  - chmod +x 같은 권한 설정 명령어를 포함하지 마세요.
  - 요청된 명령어를 직접 실행할 수 있는 코드 블록만 제공하세요.
  - 예시: 사용자가 "mvn spring-boot:run으로 실행해줘"라고 요청하면 \`\`\`bash\nmvn spring-boot:run\n\`\`\` 만 제공하세요.
  - 잘못된 예: \`\`\`bash\necho "mvn spring-boot:run" > run.sh\nchmod +x run.sh\n./run.sh\n\`\`\` (스크립트 생성 금지)

환경: ${this.userOS.toUpperCase()}`;
    }

    /**
     * 모델 타입에 따른 특화 시스템 프롬프트
     */
    private getModelSpecificSystemPrompt(): string {
        switch (this.modelType) {
            case AiModelType.GEMINI:
                return this.getGeminiSystemPrompt();

            case AiModelType.OLLAMA_GPT_OSS:
                return this.getGPTOSSSystemPrompt();

            case AiModelType.OLLAMA_DeepSeek:
                return this.getDeepSeekSystemPrompt();

            case AiModelType.OLLAMA_Gemma:
                return this.getGemmaSystemPrompt();

            case AiModelType.OLLAMA_CodeLlama:
                return this.getCodeLlamaSystemPrompt();

            default:
                return this.getDefaultSystemPrompt();
        }
    }

    /**
     * Gemini 모델용 특화 프롬프트
     */
    private getGeminiSystemPrompt(): string {
        return `**Gemini 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 파일 작업 시 명확한 구분자 사용
- 구조화된 응답 제공`;
    }

    /**
     * GPT-OSS 모델용 특화 프롬프트
     */
    private getGPTOSSSystemPrompt(): string {
        return `**GPT-OSS 모델 특화 지침:**
- 표준 마크다운 형식 준수
- 코드 블록: \`\`\`언어 형식으로 명시
- 파일 작업 시 명확한 구분자 사용
- GPT-OSS 출력 형식에 맞춰 응답
- 간결하고 명확한 응답 선호`;
    }

    /**
     * DeepSeek 모델용 특화 프롬프트
     */
    private getDeepSeekSystemPrompt(): string {
        return `**DeepSeek 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 파일 작업 시 명확한 구분자 사용
- 반드시 한국어로만 답변 (중국어, 영어, 일본어 사용 금지)
- 간결하고 실용적인 응답 제공`;
    }

    /**
     * Gemma 모델용 특화 프롬프트
     */
    private getGemmaSystemPrompt(): string {
        return `**Gemma 모델 특화 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 간결하고 명확한 응답
- 구조화된 형식 선호`;
    }

    /**
     * CodeLlama 모델용 특화 프롬프트
     */
    private getCodeLlamaSystemPrompt(): string {
        return `**CodeLlama 모델 특화 지침:**
- 코드 중심 응답 제공
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 코드 품질과 가독성 중시`;
    }

    /**
     * 기본 모델용 프롬프트 (기타 모델)
     */
    private getDefaultSystemPrompt(): string {
        return `**기본 지침:**
- 표준 마크다운 형식 사용
- 코드 블록: \`\`\`언어 형식
- 명확하고 구조화된 응답 제공`;
    }

    /**
     * OS별 특화 가이드라인을 반환합니다.
     */
    private getOSSpecificGuidelines(): string {
        switch (this.userOS.toLowerCase()) {
            case 'windows':
                return `**Windows 환경 특화 가이드라인:**
- PowerShell 또는 Command Prompt 명령어를 사용하세요.
- 파일 경로는 백슬래시(\\) 또는 슬래시(/) 모두 사용 가능합니다.
- 환경변수는 %VARIABLE_NAME% 형식을 사용하세요.
- 터미널 명령어는 \`\`\`cmd 또는 \`\`\`powershell 코드 블록을 사용하세요.
- 포트 해제: netstat -ano | findstr :포트번호, taskkill /PID 프로세스ID /F
- 프로세스 종료: taskkill /IM 프로세스명 /F
- 서비스 관리: net start/stop 서비스명
- 권한 문제 시 관리자 권한으로 실행하도록 안내하세요.`;

            case 'macos':
                return `**macOS 환경 특화 가이드라인:**
- Bash/Zsh 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9
- 프로세스 종료: pkill -f "프로세스명"
- Homebrew 패키지 관리자 사용을 권장하세요.
- 권한 문제 시 sudo 명령어 사용을 안내하세요.
- **중요: 쉘 스크립트 생성 조건 및 규칙:**
  - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
  - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
  - 쉘 스크립트 내에 프로그래밍 언어 코드(Python, Node.js, Java 등)가 필요한 경우:
    * 반드시 해당 언어명 callout을 사용하세요 (예: \`\`\`python, \`\`\`javascript)
    * "새 파일: [파일경로]" 형식으로 파일 생성 가이드를 따르세요
  - 복잡한 bash 스크립트(함수 정의, 여러 줄 변수, if/for/while 루프 포함)는 반드시 .sh 파일로 생성하고, 생성 후 \`chmod +x 스크립트.sh && ./스크립트.sh\` 형식으로 실행하세요.
  - 단순한 한 줄 명령어만 코드 블록에 직접 작성하세요 (예: \`mvn clean package\`, \`npm install\` 등).`;

            case 'linux':
                return `**Linux 환경 특화 가이드라인:**
- Bash 쉘 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제: lsof -ti:포트번호 | xargs kill -9 또는 fuser -k 포트번호/tcp
- 프로세스 종료: pkill -f "프로세스명" 또는 killall 프로세스명
- 패키지 관리자: apt (Ubuntu/Debian), yum/dnf (RHEL/CentOS), pacman (Arch)
- 권한 문제 시 sudo 명령어 사용을 안내하세요.
- **중요: 쉘 스크립트 생성 조건 및 규칙:**
  - 쉘 스크립트는 **프로젝트 빌드, 실행, 테스트, 배포**와 직접 관련된 작업일 때만 생성하세요.
  - 프로젝트 빌드/실행과 무관한 작업에는 절대 쉘 스크립트를 생성하지 마세요.
  - 쉘 스크립트 내에 프로그래밍 언어 코드(Python, Node.js, Java 등)가 필요한 경우:
    * 반드시 해당 언어명 callout을 사용하세요 (예: \`\`\`python, \`\`\`javascript)
    * "새 파일: [파일경로]" 형식으로 파일 생성 가이드를 따르세요
  - 복잡한 bash 스크립트(함수 정의, 여러 줄 변수, if/for/while 루프 포함)는 반드시 .sh 파일로 생성하고, 생성 후 \`chmod +x 스크립트.sh && ./스크립트.sh\` 형식으로 실행하세요.
  - 단순한 한 줄 명령어만 코드 블록에 직접 작성하세요 (예: \`mvn clean package\`, \`npm install\` 등).`;

            default:
                return `**일반 환경 가이드라인:**
- 플랫폼에 독립적인 명령어를 사용하세요.
- 파일 경로는 슬래시(/)를 사용하세요.
- 환경변수는 $VARIABLE_NAME 형식을 사용하세요.
- 터미널 명령어는 \`\`\`bash 코드 블록을 사용하세요.
- 포트 해제 및 프로세스 종료 명령어는 OS별로 다를 수 있으니 주의하세요.`;
        }
    }

    /**
     * 최종 시스템 프롬프트를 생성합니다.
     */
    public generateSystemPrompt(options: PromptBuilderOptions): string {
        const { promptType, codebaseContext, realTimeInfo, profileContext, intentContext, gitContext, languageInstruction } = options;

        if (promptType === PromptType.GENERAL_ASK) {
            return `당신은 전문적인 소프트웨어 개발자이자 기술 전문가입니다. 사용자의 질문에 대해 정확하고 유용한 답변을 제공합니다.

주요 지침:
1. 기술적 질문에 대해 명확하고 이해하기 쉬운 답변을 제공하세요.
2. 코드 예제가 필요한 경우 완전하고 실행 가능한 코드를 제공하세요.
3. 한글로 답변하되, 필요한 경우 영어 용어나 코드는 그대로 사용하세요.
4. 실시간 정보가 있는 경우 이를 활용하여 답변하세요.
5. 파일 생성, 수정, 삭제 또는 터미널 명령어 실행은 하지 마세요. 이는 단순 질의 응답 모드입니다.
6. 첨부된 파일이 있는 경우 해당 파일의 내용을 분석하여 답변하세요.

코드베이스 컨텍스트:
${codebaseContext || ''}

프로젝트 프로필:
${profileContext || ''}

사용자 의도:
${intentContext || ''}

실시간 정보:
${realTimeInfo || ''}

${gitContext || ''}

사용자의 질문에 대해 전문적이고 유용한 답변을 제공해주세요.${languageInstruction || ''}`;
        }

        // CODE_GENERATION 타입은 generateOSSpecificSystemPrompt 사용
        return this.generateOSSpecificSystemPrompt();
    }

    /**
     * 모델 타입을 업데이트합니다.
     */
    public setModelType(modelType: AiModelType): void {
        this.modelType = modelType;
    }

    /**
     * OS를 업데이트합니다.
     */
    public setUserOS(userOS: string): void {
        this.userOS = userOS;
    }
}

