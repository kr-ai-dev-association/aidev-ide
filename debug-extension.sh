#!/bin/bash

echo "🔧 VS Code Extension 디버그 모드 문제 해결 스크립트"
echo "================================================"

# 1. Extension Host 프로세스 정리
echo "1. Extension Host 프로세스 정리 중..."
pkill -f "Code Helper" 2>/dev/null || true
pkill -f "extensionHost" 2>/dev/null || true
sleep 2

# 2. VS Code 캐시 정리
echo "2. VS Code 캐시 정리 중..."
rm -rf ~/Library/Application\ Support/Code/logs/* 2>/dev/null || true
rm -rf ~/Library/Application\ Support/Code/CachedData/* 2>/dev/null || true
rm -rf ~/Library/Application\ Support/Code/User/workspaceStorage/* 2>/dev/null || true

# 3. 프로젝트 컴파일
echo "3. 프로젝트 컴파일 중..."
npm run compile

# 4. dist 파일 확인
echo "4. dist 파일 확인 중..."
if [ -f "dist/extension.js" ]; then
    echo "✅ dist/extension.js 파일 존재"
    ls -la dist/extension.js
else
    echo "❌ dist/extension.js 파일이 없습니다!"
    exit 1
fi

# 5. VS Code 재시작 안내
echo ""
echo "5. VS Code 재시작 안내"
echo "====================="
echo "다음 단계를 수행하세요:"
echo "1. VS Code를 완전히 종료"
echo "2. VS Code를 다시 시작"
echo "3. F5 키를 눌러 'Run Extension' 실행"
echo "4. 또는 Ctrl+Shift+P → 'Debug: Start Debugging' 선택"
echo ""
echo "만약 여전히 문제가 있다면:"
echo "- 'Run Extension (Clean)' 설정을 사용해보세요"
echo "- VS Code를 관리자 권한으로 실행해보세요"
