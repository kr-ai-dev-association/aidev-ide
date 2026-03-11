# Changelog

## v1.0.7

### Skills 우선순위 강화
- 관리자 등록 Skills(dev_rules)를 시스템 프롬프트 최상단으로 이동
- 모든 Skills 라벨을 `[필수]`로 통일 (enforcement 설정과 무관하게 강제 적용)
- 프롬프트 하단에 Skills 준수 리마인더 추가
- LLM이 코드 생성 시 디자인 시스템·아키텍처·코딩 컨벤션을 반드시 따르도록 개선

### 디버그 로그 제거
- `SettingsPanelProvider.ts`: waitForSync 관련 console.log 제거
- `webview/settings.js`: renderOrgSettings 내 console.log 제거

### 설정 패널 개선
- `currentSettings`에 `hasOrganization` 플래그 추가

### 코드 정리
- `GitRepositoryService` 제거
