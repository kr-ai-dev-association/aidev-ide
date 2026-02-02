# CodePilot v9.2 다국어 테스트 계획

## 개요
단일 언어(TypeScript/JavaScript)에 편중된 테스트를 벗어나, 지원하는 모든 프로젝트 타입에 대해 **코드 생성(플랜 → 실행)** 기능을 체계적으로 검증합니다.

---

## 1. 웹 프론트엔드

### 1-1. React + TypeScript (Next.js App Router)
- **프로젝트 생성**: `npx create-next-app@latest --ts`
- **테스트 요청 예시**:
  - "TODO 앱 만들어줘. 추가/삭제/완료 토글 기능"
  - "다크모드 토글 버튼 추가해줘"
  - "API Route에서 JSON 데이터 반환하는 엔드포인트 만들어줘"
- **검증 포인트**:
  - [ ] `create_file` / `update_file` 정상 동작
  - [ ] TSX 문법 올바르게 생성
  - [ ] `tsc --noEmit` 검증 통과
  - [ ] App Router 구조 (`app/` 디렉토리) 인식
  - [ ] Tailwind CSS 클래스 올바르게 사용

### 1-2. Vue 3 + TypeScript (Vite)
- **프로젝트 생성**: `npm create vue@latest`
- **테스트 요청 예시**:
  - "카운터 컴포넌트 만들어줘 (Composition API)"
  - "Pinia 스토어로 장바구니 상태 관리 추가해줘"
- **검증 포인트**:
  - [ ] `.vue` SFC 파일 올바르게 생성
  - [ ] `<script setup lang="ts">` 문법
  - [ ] Composition API 패턴 사용
  - [ ] Vue 프로젝트 타입 감지

### 1-3. Angular
- **프로젝트 생성**: `ng new test-app`
- **테스트 요청 예시**:
  - "사용자 목록 컴포넌트 만들어줘 (서비스 + 컴포넌트)"
  - "리액티브 폼으로 회원가입 폼 만들어줘"
- **검증 포인트**:
  - [ ] Component, Service, Module 파일 분리 생성
  - [ ] Angular 데코레이터 올바른 사용
  - [ ] `@angular/core` 감지

---

## 2. 백엔드 - Python

### 2-1. Django
- **프로젝트 생성**: `django-admin startproject myproject`
- **테스트 요청 예시**:
  - "게시판 앱 만들어줘 (Model, View, URL, Template)"
  - "REST API 엔드포인트 추가해줘 (DRF 사용)"
  - "사용자 인증 기능 추가해줘"
- **검증 포인트**:
  - [ ] Django 프로젝트 타입 감지 (`manage.py`)
  - [ ] Model/View/URL/Template 파일 올바르게 생성
  - [ ] `python -m compileall` 또는 `ruff check` 검증
  - [ ] Django ORM 문법 올바르게 사용

### 2-2. FastAPI
- **프로젝트 생성**: `pip install fastapi uvicorn` + `main.py`
- **테스트 요청 예시**:
  - "유저 CRUD API 만들어줘 (Pydantic 모델 포함)"
  - "JWT 인증 미들웨어 추가해줘"
  - "SQLAlchemy로 DB 연동해줘"
- **검증 포인트**:
  - [ ] FastAPI 프로젝트 감지
  - [ ] Pydantic 모델 올바르게 생성
  - [ ] async/await 패턴 사용
  - [ ] 타입 힌트 올바르게 적용

### 2-3. Flask
- **프로젝트 생성**: `pip install flask` + `app.py`
- **테스트 요청 예시**:
  - "블로그 앱 만들어줘 (게시글 CRUD)"
  - "Blueprint로 모듈화해줘"
- **검증 포인트**:
  - [ ] Flask 프로젝트 감지
  - [ ] Blueprint 구조 올바르게 생성
  - [ ] Jinja2 템플릿 문법

---

## 3. 백엔드 - Java/Kotlin

### 3-1. Spring Boot (Java + Gradle)
- **프로젝트 생성**: Spring Initializr (start.spring.io)
- **테스트 요청 예시**:
  - "상품 관리 REST API 만들어줘 (Controller, Service, Repository, Entity)"
  - "Spring Security로 JWT 인증 추가해줘"
  - "JPA Entity에 연관관계 매핑 추가해줘"
- **검증 포인트**:
  - [ ] Spring Boot 프로젝트 감지 (`build.gradle`)
  - [ ] Java 파일 생성 (패키지 구조 올바르게)
  - [ ] `gradlew compileJava` 검증 통과
  - [ ] 어노테이션 올바르게 사용 (`@RestController`, `@Service`, `@Entity`)
  - [ ] Lombok 사용 여부 감지

### 3-2. Spring Boot (Kotlin + Gradle KTS)
- **프로젝트 생성**: Spring Initializr (Kotlin 선택)
- **테스트 요청 예시**:
  - "데이터 클래스와 Repository 만들어줘"
  - "코루틴 기반 비동기 서비스 만들어줘"
- **검증 포인트**:
  - [ ] Kotlin 문법 올바르게 생성
  - [ ] `build.gradle.kts` 인식
  - [ ] data class 사용

---

## 4. 모바일

### 4-1. Android (Kotlin + Jetpack Compose)
- **프로젝트 생성**: Android Studio 프로젝트
- **테스트 요청 예시**:
  - "로그인 화면 만들어줘 (Compose UI)"
  - "Room DB로 메모 저장 기능 추가해줘"
  - "Retrofit으로 API 호출 기능 추가해줘"
  - "Navigation Compose로 화면 전환 추가해줘"
- **검증 포인트**:
  - [ ] Android 프로젝트 감지 (`AndroidManifest.xml`, `build.gradle.kts`)
  - [ ] Compose UI 코드 올바르게 생성
  - [ ] `gradlew assembleDebug` 검증
  - [ ] Hilt/Room/Retrofit 패턴 인식
  - [ ] KSP vs KAPT 올바르게 적용

### 4-2. Flutter (Dart)
- **프로젝트 생성**: `flutter create test_app`
- **테스트 요청 예시**:
  - "할일 목록 앱 만들어줘 (Riverpod 상태관리)"
  - "HTTP API 연동해줘 (Dio 사용)"
  - "go_router로 라우팅 설정해줘"
- **검증 포인트**:
  - [ ] Flutter 프로젝트 감지 (`pubspec.yaml`)
  - [ ] Dart 문법 올바르게 생성
  - [ ] `flutter analyze` 검증
  - [ ] Riverpod/BLoC 패턴 인식
  - [ ] Widget 트리 구조 올바르게 구성

### 4-3. iOS (Swift)
- **프로젝트 생성**: Xcode 프로젝트 또는 Swift Package
- **테스트 요청 예시**:
  - "SwiftUI로 리스트 화면 만들어줘"
  - "URLSession으로 API 호출 기능 추가해줘"
- **검증 포인트**:
  - [ ] Swift 프로젝트 감지 (`Package.swift`, `.xcodeproj`)
  - [ ] SwiftUI 문법 올바르게 생성
  - [ ] `swift build` 검증 (macOS에서만)

---

## 5. 시스템 프로그래밍

### 5-1. Go
- **프로젝트 생성**: `go mod init myproject`
- **테스트 요청 예시**:
  - "HTTP 서버 만들어줘 (net/http)"
  - "Gin 프레임워크로 REST API 만들어줘"
  - "고루틴으로 동시성 처리하는 워커 풀 만들어줘"
  - "gRPC 서버 만들어줘"
- **검증 포인트**:
  - [ ] Go 프로젝트 감지 (`go.mod`)
  - [ ] Go 문법 올바르게 생성 (에러 핸들링 패턴 등)
  - [ ] `go vet` / `golangci-lint` 검증
  - [ ] 패키지 구조 올바르게 구성

### 5-2. Rust
- **프로젝트 생성**: `cargo new myproject`
- **테스트 요청 예시**:
  - "CLI 도구 만들어줘 (clap 사용)"
  - "Actix-web으로 REST API 만들어줘"
  - "파일 읽기/쓰기 유틸리티 만들어줘"
- **검증 포인트**:
  - [ ] Rust 프로젝트 감지 (`Cargo.toml`)
  - [ ] Rust 문법 올바르게 생성 (소유권, 라이프타임)
  - [ ] `cargo clippy` / `cargo check` 검증
  - [ ] `Result<T, E>` 에러 처리 패턴

### 5-3. C/C++ (CMake)
- **프로젝트 생성**: `CMakeLists.txt` + `src/main.cpp`
- **테스트 요청 예시**:
  - "간단한 계산기 프로그램 만들어줘"
  - "파일 I/O 유틸리티 클래스 만들어줘"
- **검증 포인트**:
  - [ ] C/C++ 프로젝트 감지 (`CMakeLists.txt`)
  - [ ] 헤더/소스 파일 분리 생성
  - [ ] `cmake --build` 검증

---

## 6. 기타 언어

### 6-1. PHP (Laravel)
- **프로젝트 생성**: `composer create-project laravel/laravel`
- **테스트 요청 예시**:
  - "게시판 CRUD 만들어줘 (Controller, Model, Migration, Route)"
  - "미들웨어 추가해줘"
- **검증 포인트**:
  - [ ] PHP/Laravel 프로젝트 감지 (`composer.json`)
  - [ ] Artisan 명령어 인식
  - [ ] `php artisan route:list` 검증

### 6-2. Ruby (Rails)
- **프로젝트 생성**: `rails new test_app`
- **테스트 요청 예시**:
  - "scaffold로 게시글 모델 만들어줘"
  - "ActiveRecord 마이그레이션 추가해줘"
- **검증 포인트**:
  - [ ] Ruby 프로젝트 감지 (`Gemfile`)
  - [ ] Ruby 문법 올바르게 생성
  - [ ] `bundle exec rubocop` 검증

### 6-3. C# (.NET)
- **프로젝트 생성**: `dotnet new webapi`
- **테스트 요청 예시**:
  - "Controller와 Service 추가해줘"
  - "Entity Framework Core로 DB 연동해줘"
- **검증 포인트**:
  - [ ] .NET 프로젝트 감지 (`.csproj`)
  - [ ] C# 문법 올바르게 생성
  - [ ] `dotnet build` 검증

---

## 7. 공통 기능 테스트 (모든 언어에서)

### 7-1. 도구(Tool) 동작 검증
| 도구 | 테스트 내용 | 체크 |
|------|------------|------|
| `create_file` | 새 파일 생성 (디렉토리 자동 생성 포함) | [ ] |
| `update_file` | SEARCH/REPLACE 블록으로 기존 파일 수정 | [ ] |
| `remove_file` | 파일 삭제 | [ ] |
| `read_file` | 파일 읽기 (라인 범위 지정) | [ ] |
| `list_files` | 디렉토리 목록 조회 | [ ] |
| `search_files` | 파일 내용 검색 | [ ] |
| `run_command` | 터미널 명령 실행 | [ ] |
| `git_diff` | Git 변경사항 확인 | [ ] |

### 7-2. 플랜(Plan) → 실행(Execution) 파이프라인
| 단계 | 테스트 내용 | 체크 |
|------|------------|------|
| 의도 분석 | 사용자 요청을 올바르게 파악하는지 | [ ] |
| 조사(Investigation) | 관련 파일을 올바르게 탐색하는지 | [ ] |
| 계획(Plan) 수립 | 작업 단계를 올바르게 나누는지 | [ ] |
| 실행(Execution) | 도구 호출이 올바르게 이루어지는지 | [ ] |
| 검증(Validation) | 빌드/린트 검증이 통과하는지 | [ ] |
| 자동 재시도 | 검증 실패 시 자동 수정하는지 | [ ] |

### 7-3. 자동 테스트/검증 명령어 매핑
| 프로젝트 타입 | 기대 검증 명령어 | 체크 |
|--------------|-----------------|------|
| React/Next.js | `tsc --noEmit` 또는 `eslint .` | [ ] |
| Vue | `tsc --noEmit` 또는 `eslint .` | [ ] |
| Angular | `ng build` 또는 `tsc --noEmit` | [ ] |
| Django | `python -m compileall` 또는 `ruff check` | [ ] |
| FastAPI | `python -m compileall` 또는 `mypy` | [ ] |
| Spring Boot (Java) | `gradlew compileJava` | [ ] |
| Spring Boot (Kotlin) | `gradlew compileKotlin` | [ ] |
| Android | `gradlew assembleDebug` | [ ] |
| Flutter | `flutter analyze` | [ ] |
| Go | `go vet` 또는 `golangci-lint run` | [ ] |
| Rust | `cargo clippy` 또는 `cargo check` | [ ] |
| C/C++ | `cmake --build build` | [ ] |
| PHP/Laravel | `php artisan route:list` | [ ] |
| Ruby/Rails | `bundle exec rubocop` | [ ] |
| C#/.NET | `dotnet build` | [ ] |
| Swift | `swift build` | [ ] |

---

## 8. 에러 시나리오 테스트

### 8-1. 의도적 에러 유발 후 자동 수정
| 시나리오 | 테스트 방법 | 체크 |
|---------|------------|------|
| 타입 에러 | "타입이 안 맞는 코드 수정해줘" | [ ] |
| 임포트 누락 | "이 모듈 사용하는 코드 만들어줘" (의존성 미설치) | [ ] |
| 문법 에러 | 에러 포함된 파일 수정 요청 | [ ] |
| 빌드 실패 | 빌드 깨진 상태에서 수정 요청 | [ ] |

### 8-2. 멀티 파일 수정
| 시나리오 | 테스트 방법 | 체크 |
|---------|------------|------|
| 3개 이상 파일 동시 생성 | "MVC 패턴으로 전체 구조 만들어줘" | [ ] |
| 연쇄 수정 | "인터페이스 변경하고 구현체도 맞춰줘" | [ ] |
| 설정 + 코드 동시 변경 | "새 의존성 추가하고 사용하는 코드도 만들어줘" | [ ] |

---

## 9. OS별 테스트

| OS | 셸 | 고유 테스트 | 체크 |
|----|----|-----------|------|
| macOS | zsh | Swift/iOS 빌드, Homebrew 경로 | [ ] |
| Linux | bash | 파일 권한, 경로 구분자 | [ ] |
| Windows | PowerShell | 경로 구분자(`\`), `.exe` 확장자 | [ ] |

---

## 10. 테스트 우선순위

### P0 (필수 - 즉시 테스트)
1. **React + TypeScript** (가장 많이 사용)
2. **Spring Boot Java** (Java 생태계)
3. **Python FastAPI** (Python 생태계)
4. **Flutter** (모바일)
5. **Go** (시스템)

### P1 (중요 - 1주차 내)
6. **Android Kotlin + Compose**
7. **Django**
8. **Vue 3**
9. **Rust**
10. **Next.js App Router**

### P2 (보통 - 2주차 내)
11. **Angular**
12. **Spring Boot Kotlin**
13. **Flask**
14. **PHP Laravel**
15. **C# .NET**

### P3 (낮음 - 추후)
16. **Ruby Rails**
17. **C/C++**
18. **Swift/iOS**

---

## 11. 테스트 실행 체크리스트

각 언어/프레임워크별로 아래 순서로 테스트:

```
1. 해당 프로젝트 생성 (빈 프로젝트)
2. VSCode에서 해당 프로젝트 열기
3. CodePilot이 프로젝트 타입을 올바르게 감지하는지 확인
4. 간단한 기능 요청 (예: "TODO 앱 만들어줘")
5. 플랜 생성 확인 → 단계가 올바른지 검토
6. 실행 결과 확인 → 파일 생성/수정이 올바른지
7. 자동 검증 통과 확인
8. 검증 실패 시 자동 재시도 확인
9. 최종 결과물이 실행 가능한지 확인
```

---

## 12. 결과 기록 양식

| # | 날짜 | 언어/프레임워크 | 테스트 요청 | 프로젝트 감지 | 플랜 품질 | 코드 생성 | 검증 통과 | 실행 가능 | 비고 |
|---|------|---------------|-----------|-------------|----------|----------|----------|----------|------|
| 1 | | | | ✅/❌ | ⭐1-5 | ✅/❌ | ✅/❌ | ✅/❌ | |
| 2 | | | | | | | | | |
