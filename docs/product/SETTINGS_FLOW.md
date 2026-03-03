# Admin → IDE 설정 연동 흐름

> 관리자가 Admin 대시보드에서 설정하면, 팀원의 IDE에 어떻게 반영되는지를 설명합니다.

---

## 전체 흐름

```
[Admin 대시보드]                [CodePilot Backend]              [IDE (팀원)]
─────────────────               ──────────────────               ──────────────
관리자 설정 저장                  AdminSetting 테이블 저장
                                  (category, key, value,
                                   enforcement, org_id)
                                                        ←── IDE 로그인
                                                        ←── syncServerSettings()
                                 /settings/effective/all/
                                  ├ org_id 기반 조직 설정 반환
                                  └ preset 시스템 기본 설정 포함
                                                        ──→ 5분 TTL 캐시 저장
                                                        ──→ globalState 오프라인 캐시
                                                        ──→ required 설정 즉시 강제 적용
                                                        ──→ IDE UI에 설정 반영
```

---

## 동기화 시점

| 시점 | 내용 |
|------|------|
| **로그인 시** | 자동으로 전체 설정 동기화 |
| **5분 주기** | 온라인 상태에서 자동 갱신 |
| **수동 동기화** | 계정 탭의 동기화 버튼 클릭 |
| **API 키 입력 시** | 조직 가입 직후 즉시 동기화 |
| **오프라인 시** | globalState 캐시 사용 (마지막 동기화 데이터 유지) |

---

## 적용 수준 (Enforcement)

```
required  ──→ IDE 설정 잠금 (사용자 변경 불가, "required" 배지 표시)
recommended ──→ 기본 적용 + 사용자 비활성화 가능 (토글 제공)
preset ──→ 시스템 기본 제공 (조직 설정 없는 사용자에게도 표시)
```

### 우선순위
```
required (관리자 강제) > personal (사용자 개인) > recommended (관리자 권장)
```

---

## 카테고리별 연동 상세

### AI 모델 (`ai_model`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| 모델 등록 (required) | AI 모델 탭에 표시 + 사용자 변경 불가 |
| 모델 등록 (recommended) | AI 모델 탭에 기본 선택 + 사용자 다른 모델로 전환 가능 |
| 모델 비활성화 | IDE에서 해당 모델 옵션 제거 |

---

### MCP 서버 (`mcp_server`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| 서버 등록 (required) | **관리자 설정** 섹션에 표시, 사용자 비활성화 불가 |
| 서버 등록 (recommended) | **관리자 설정** 섹션에 표시, 사용자 토글 비활성화 가능 |
| preset (시스템 기본) | **기본 설정** 섹션에 표시 |
| 서버 삭제 | 다음 동기화 시 IDE에서 제거 |

> **중요**: 조직 가입 전에는 preset(기본 설정)만 표시됩니다. 조직 가입 후에는 조직 등록 MCP가 **관리자 설정**으로 추가 표시됩니다.

---

### 빌드/테스트 (`build_test`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| 명령 등록 (required) | 자동 테스트 시 반드시 실행 + 개인 설정보다 우선 |
| 명령 등록 (recommended) | 자동 테스트 시 기본 실행 + 사용자 비활성화 가능 |
| 설정 없음 | 프로젝트 타입 자동 감지 후 기본 명령 실행 |

---

### Hot Load (`hotload`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| Hot Load 등록 (required) | 키워드 감지 시 반드시 실행 |
| Hot Load 등록 (recommended) | 키워드 감지 시 기본 실행 + 사용자 비활성화 가능 |

Hot Load는 **모든 LLM 지시보다 높은 우선순위**를 가집니다.

---

### Skills / 개발 규칙 (`dev_rules`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| 마크다운 업로드 (required) | 코드 생성 시 항상 참조 (비활성화 불가) |
| 마크다운 업로드 (recommended) | 코드 생성 시 기본 참조 + 사용자 비활성화 가능 |

파일은 `./.agent/rules/{category}/` 디렉토리에 자동 저장됩니다.

---

### 보안 규칙 (`security_rules`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| 명령 차단 (required) | 해당 명령 실행 시 PreToolUseValidator가 차단 |
| 파일 보호 (required) | 해당 파일 수정/삭제 시도 차단 |
| 숨김 파일 (required) | 해당 파일이 LLM 컨텍스트에 포함되지 않음 |
| recommended 규칙 | 기본 적용 + 사용자 비활성화 가능 |

---

### 제외 패턴 (`exclude_patterns`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| 패턴 등록 (required) | 해당 경로는 인덱싱·검색에서 항상 제외 |
| 패턴 등록 (recommended) | 기본 제외 + 사용자 개별 비활성화 가능 |

---

### RAG (`rag`)

| Admin 설정 | IDE 동작 |
|-----------|----------|
| RAG 소스 생성 | IDE RAG 탭에 조직 소스로 표시 |
| 문서 업로드 | 질문 시 LLM 컨텍스트에 검색 결과 주입 |

---

## 사용자 조직 가입 흐름

```
1. 관리자: Admin에서 팀원용 API 키 발급 (cpk_xxxx...)
2. 팀원: IDE 설정 → 계정 탭 → API 키 입력
3. IDE: /license/join/ API 호출 → 조직 연결 확인
4. IDE: userInfo.organization / organization_id 업데이트
5. IDE: syncServerSettings() 즉시 호출
6. IDE: required 설정 강제 적용 + MCP/모델/규칙 로드
7. 팀원: 관리자가 설정한 모델·도구·보안 규칙이 즉시 적용됨
```

---

## 설정 비활성화 메커니즘

recommended 설정을 사용자가 비활성화하면:
- 비활성화 목록이 `globalState('codepilot.disabledSettings')`에 저장
- 형식: `["mcp_server:server-key", "build_test:ts-check", ...]`
- 비활성화된 설정은 기능 실행 시 건너뜀
- required 설정은 비활성화 불가 (서버 측 `enforcement === 'required'` 확인)

---

## 카테고리 요약 표

| 카테고리 | Admin 기능 | IDE 표시 | 사용자 제어 |
|----------|-----------|----------|------------|
| `ai_model` | 모델 등록/관리 | AI 모델 탭 드롭다운 | required 시 변경 불가 |
| `mcp_server` | 서버 등록/관리 | MCP 탭 관리자 설정 섹션 | required 시 비활성화 불가 |
| `build_test` | 검증 명령 등록 | 자동 테스트 시 실행 | recommended 비활성화 가능 |
| `hotload` | 키워드 트리거 등록 | 키워드 감지 시 자동 실행 | recommended 비활성화 가능 |
| `dev_rules` | 마크다운 규칙 업로드 | 코드 생성 시 참조 | recommended 비활성화 가능 |
| `security_rules` | 차단/보호 패턴 등록 | 도구 실행 전 검증 | required 시 비활성화 불가 |
| `exclude_patterns` | 제외 경로 등록 | 인덱싱/검색 제외 | recommended 비활성화 가능 |
| `rag` | 문서 소스 관리 | 질문 시 컨텍스트 주입 | 표시만 (개인 추가 가능) |
