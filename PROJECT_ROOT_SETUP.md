# 🔧 AIDEV-IDE 프로젝트 루트 설정 가이드

## 🚨 현재 문제
aidev-ide 확장 프로그램의 소스 디렉토리에서 파일을 수집하고 있습니다.
- **현재 경로**: `/Users/tony/Projects/aidev-ide`
- **문제**: 이는 aidev-ide 확장 프로그램 자체의 소스 코드입니다.

## ✅ 해결 방법

### 1. **올바른 프로젝트 루트 설정**

#### 방법 1: VS Code 설정에서 설정
1. `Ctrl+Shift+P` (또는 `Cmd+Shift+P`) → "Preferences: Open Settings (JSON)"
2. 다음 설정 추가:
```json
{
    "aidevIde.projectRoot": "/path/to/your/actual/project"
}
```

#### 방법 2: 빈 디렉토리에서 새 프로젝트 시작
```bash
# 1. 새 디렉토리 생성
mkdir ~/my-new-project
cd ~/my-new-project

# 2. VS Code에서 열기
code .

# 3. aidev-ide 확장 프로그램에서 프로젝트 루트 설정
# Settings → AIDEV-IDE → Project Root: /Users/tony/my-new-project
```

### 2. **프로젝트 루트 확인 방법**

#### 현재 설정 확인:
1. VS Code 설정 → AIDEV-IDE → Project Root
2. 또는 `Ctrl+Shift+P` → "AIDEV-IDE: Show Settings"

#### 올바른 경로 예시:
- ✅ `/Users/tony/my-spring-project`
- ✅ `/Users/tony/my-react-app`
- ✅ `/Users/tony/workspace/my-project`
- ❌ `/Users/tony/Projects/aidev-ide` (aidev-ide 소스)

### 3. **문제 해결 체크리스트**

- [ ] VS Code에서 aidev-ide 소스가 아닌 **실제 작업할 프로젝트**를 열었는가?
- [ ] AIDEV-IDE 설정에서 Project Root가 올바르게 설정되었는가?
- [ ] 프로젝트 루트가 aidev-ide 소스 디렉토리가 아닌가?

### 4. **권장 워크플로우**

1. **새 프로젝트 시작**:
   ```bash
   mkdir ~/my-project
   cd ~/my-project
   code .
   ```

2. **aidev-ide 설정**:
   - Settings → AIDEV-IDE → Project Root: `/Users/tony/my-project`

3. **프로젝트 생성 요청**:
   - "현재 디렉토리에 스프링 부트 프로젝트 생성해줘"

## 🔍 디버깅

### 로그에서 확인할 내용:
```
[CodebaseContextService] 설정된 프로젝트 루트 사용: /path/to/your/project
```

### 경고 메시지가 나타나면:
```
⚠️ 경고: 프로젝트 루트가 aidev-ide 소스 디렉토리로 설정되어 있습니다
```
→ 프로젝트 루트를 올바른 경로로 변경하세요.

## 📝 요약

**핵심**: aidev-ide 확장 프로그램의 소스 디렉토리(`/Users/tony/Projects/aidev-ide`)가 아닌, **실제 작업할 프로젝트 디렉토리**를 프로젝트 루트로 설정해야 합니다.
