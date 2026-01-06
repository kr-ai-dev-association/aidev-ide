/**
 * Code Generation 프롬프트 컴포넌트
 * 코드 생성/수정 지침
 */

export function getCodeGenerationGuide(): string {
  return `코드 생성/수정 지침:
- **프로젝트 구조 파악 우선**: 기능 추가나 수정 요청 시 먼저 list_files tool을 사용하여 프로젝트 디렉토리 구조를 파악하세요.
- **파일 분할 원칙**: 모든 코드를 하나의 파일(App.tsx 등)에 넣지 마세요. 기능별, 역할별로 적절히 파일을 분할하세요.
  - 컴포넌트는 src/components/ 디렉토리에 분리
  - 유틸리티 함수는 src/utils/ 디렉토리에 분리
  - 훅은 src/hooks/ 디렉토리에 분리
  - 서비스/API는 src/services/ 디렉토리에 분리
  - 타입 정의는 src/types/ 디렉토리에 분리
- **디렉토리 자동 생성**: create_file tool을 사용하면 필요한 디렉토리가 자동으로 생성되므로, 적절한 경로를 사용하세요 (예: src/components/Button.tsx).
- **기존 구조 파악**: 프로젝트에 이미 존재하는 디렉토리 구조를 확인하고, 그 패턴을 따르세요.
- 항상 전체 파일 내용을 제공합니다 (부분 코드 금지)
- 파일 작업 지시어를 명확히 사용: "새 파일:", "수정 파일:", "삭제 파일:"
- 생성/수정/삭제한 파일 목록을 요약에 포함
- 변경 이유와 테스트 방법을 함께 제공합니다
- TypeScript/Vite/React 등에서 **경로 별칭(@/ 등)을 임의로 만들지 마세요.**
  - tsconfig.json / vite.config.ts에서 baseUrl·paths·alias가 실제로 정의되어 있는 경우에만 해당 별칭을 사용합니다.
  - 별칭 설정이 보이지 않으면 항상 ./components/..., ../pages/... 같은 **상대 경로 import**만 사용하세요.
  - 특히 \`@/pages/RefundLookup\` 와 같이 실제 설정에 없는 별칭 경로는 절대 사용하지 않습니다.
- **파일/패키지 import 규칙 (매우 중요)**:
  - **모든 import 문을 추가하기 전에 반드시 해당 파일이나 패키지가 실제로 존재하는지 확인하세요.**
  - **파일 import 규칙**:
    - \`import Home from './pages/Home'\` 같은 상대 경로 import를 추가할 때는, 해당 파일(예: \`src/pages/Home.tsx\` 또는 \`src/pages/Home.ts\`)이 실제로 존재하는지 먼저 확인합니다.
    - 파일이 존재하지 않으면 import를 추가하지 마세요. 또는 파일을 먼저 생성한 후에 import를 추가하세요.
    - "있다고 가정"하거나 "있다고 가정하고" 같은 표현을 사용하지 마세요. 실제로 존재하는 파일만 import하세요.
  - **CSS/스타일 파일 import 규칙 (매우 중요)**:
    - \`import './App.css'\` 처럼 CSS 파일을 import 하려면, **반드시 해당 CSS 파일을 생성해야 합니다.**
    - CSS 파일 import가 있으면 항상 해당 CSS 파일을 생성하세요. 예: \`import './RefundSearchPage.css'\` → "새 파일: src/pages/RefundSearchPage.css" 생성
    - tsx/tsx 파일을 생성할 때 CSS import가 포함되어 있으면, 같은 이름의 CSS 파일도 함께 생성하세요.
    - 예: "새 파일: src/pages/RefundSearchPage.tsx"에 \`import './RefundSearchPage.css'\`가 있으면 → "새 파일: src/pages/RefundSearchPage.css"도 함께 생성
    - 이미 존재하지 않는 CSS 파일을 import만 추가하는 코드는 작성하지 마세요.
    - CSS 파일을 만들 계획이 없다면, 존재하지 않는 경로를 import하는 구문도 추가하지 마세요.
  - **패키지 import 규칙**:
    - \`import axios from 'axios'\` 같은 외부 패키지 import를 추가할 때는, package.json의 dependencies 또는 devDependencies에 해당 패키지가 실제로 포함되어 있는지 먼저 확인합니다.
    - 패키지가 설치되지 않았다면 import를 추가하지 마세요. 또는 package.json에 패키지를 추가한 후에 import를 추가하세요.
    - "있다고 가정"하거나 "설치되어 있다고 가정" 같은 표현을 사용하지 마세요. 실제로 설치된 패키지만 import하세요.
  - **필수 라이브러리 (React 프로젝트)**:
    - **react-router-dom은 React 프로젝트에서 라우팅을 위해 필수 라이브러리입니다.**
    - 코드에서 react-router-dom을 import하는 경우(예: import { BrowserRouter, Routes, Route } from 'react-router-dom'),
      반드시 package.json의 dependencies에 "react-router-dom"을 추가해야 합니다.
    - react-router-dom을 사용하는 모든 React 프로젝트는 package.json에 이 의존성이 포함되어 있어야 합니다.
    - **중요: react-router-dom v6 이상은 타입이 내장되어 있습니다. @types/react-router-dom을 추가하지 마세요.**
  - **라우터 사용 규칙 (매우 중요)**:
    - **BrowserRouter는 App.tsx에만 사용하세요. main.tsx에는 절대 사용하지 마세요.**
    - main.tsx는 ReactDOM.render 또는 createRoot만 사용하고, BrowserRouter를 import하거나 사용하지 마세요.
    - App.tsx에서 BrowserRouter로 Routes와 Route를 감싸서 라우팅을 구현하세요.
    - 예시 (올바른 구조):
      - main.tsx: import App from './App'; ReactDOM.createRoot(...).render(<App />);
      - App.tsx: import { BrowserRouter, Routes, Route } from 'react-router-dom'; ... <BrowserRouter><Routes>...</Routes></BrowserRouter>
    - **절대 하지 말 것**: main.tsx에 BrowserRouter를 추가하거나, App.tsx와 main.tsx 둘 다에 BrowserRouter를 추가하지 마세요.
  - **라이브러리 사용 시 package.json 자동 업데이트 규칙**:
    - 코드에서 외부 라이브러리를 import할 때는 반드시 package.json에 해당 패키지를 추가해야 합니다.
    - 예: import _ from 'lodash' → package.json의 dependencies에 "lodash" 추가
    - 예: import axios from 'axios' → package.json의 dependencies에 "axios" 추가
    - 예: import { BrowserRouter } from 'react-router-dom' → package.json의 dependencies에 "react-router-dom" 추가
    - TypeScript 프로젝트의 경우 @types/* 패키지도 함께 추가해야 합니다 (예: @types/lodash).
    - **예외: react-router-dom v6 이상은 타입이 내장되어 있으므로 @types/react-router-dom을 추가하지 마세요.**
  - **package.json 버전 명시 규칙 (매우 중요)**:
    - package.json에 패키지를 추가할 때는 **반드시 실제로 존재하는 버전을 사용**해야 합니다.
    - 존재하지 않는 버전을 사용하면 "npm error code ETARGET" 또는 "No matching version found" 오류가 발생합니다.
    - **"latest" 버전은 절대 사용하지 마세요.** 항상 특정 버전을 명시해야 합니다.
    - 버전을 명시할 때는 다음 형식을 사용하세요:
      * 특정 버전: "^1.2.3" 또는 "~1.2.3" 또는 "1.2.3" (실제로 존재하는 버전만 사용)
    - 예시: eslint-config-airbnb@19.2.0은 존재하지 않는 버전입니다. 실제로 존재하는 버전(예: "^19.0.4")을 사용해야 합니다.
    - **절대 사용하지 말 것**: "latest", "*", "x" 같은 범용 버전 지정자는 절대 사용하지 마세요.
    - **절대 가정하지 마세요**: "19.2.0이 있을 것 같다" 같은 추측으로 버전을 명시하지 마세요. 반드시 실제로 존재하는 버전만 사용하세요.`;
}
