# CodePilot IDE — Claude 작업 가이드

## 빌드 & 타입 체크

```bash
# 웹뷰 번들 빌드 (필수 — 항상 빌드 후 검증)
npx webpack --mode production

# TypeScript 타입 체크 (반드시 npx 사용)
npx tsc --noEmit
```

> **주의:** `tsc --noEmit` (전역)은 사용 금지.
> 전역 tsc = 4.8.4, 프로젝트 로컬 tsc = 5.9.3 — 버전 불일치로 잘못된 결과가 나옴.
> 항상 `npx tsc --noEmit`으로 프로젝트 로컬 TypeScript를 사용할 것.

## 코드 수정 후 검증 순서

1. `npx tsc --noEmit` — src/ 에러 없는지 확인
2. `npx webpack --mode production` — 빌드 성공 확인

## 프로젝트 구조

- `src/` — TypeScript 소스 (VS Code 확장)
- `webview/` — 웹뷰 UI (HTML/CSS/JS, webpack 번들)
- `docs/` — 제품 문서, 아키텍처 계획
