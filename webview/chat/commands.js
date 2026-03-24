/**
 * Chat Commands Configuration
 * 슬래시 명령어 및 @ 메뉴 설정
 */

/**
 * 슬래시 명령어 카테고리 정의
 */
export const slashCategories = [
  { id: "git", label: "Git", description: "Git 리포지토리 관련 명령어" },
  { id: "session", label: "Session", description: "대화 세션 관리" },
  { id: "cache", label: "Cache", description: "캐시 관리" },
  { id: "mcp", label: "MCP", description: "MCP 서버 관리" },
];

/**
 * 카테고리별 슬래시 명령어
 */
export const slashCommandsByCategory = {
  git: [
    {
      command: "/git status",
      label: "상태 보기",
      description: "현재 Git 리포지토리 상태 표시",
      action: "gitStatus",
    },
    {
      command: "/git diff",
      label: "변경사항",
      description: "스테이징 안된 변경사항 보기",
      action: "gitDiff",
    },
    {
      command: "/git log",
      label: "히스토리",
      description: "최근 커밋 히스토리 보기",
      action: "gitLog",
    },
    {
      command: "/git branch",
      label: "브랜치 목록",
      description: "로컬/원격 브랜치 목록 보기",
      action: "gitBranch",
    },
    {
      command: "/git info",
      label: "리포지토리 정보",
      description: "GitHub 리포지토리 정보 표시",
      action: "gitInfo",
    },
    {
      command: "/git staged",
      label: "스테이징 변경사항",
      description: "스테이징된 변경사항 보기",
      action: "gitStaged",
    },
    {
      command: "/git stash",
      label: "Stash 목록",
      description: "저장된 stash 목록 보기",
      action: "gitStash",
    },
  ],
  session: [
    {
      command: "/sessions",
      label: "세션 목록",
      description: "저장된 대화 세션 목록 보기",
      action: "listSavedSessions",
    },
    {
      command: "/restore-session",
      label: "세션 복원",
      description: "저장된 세션 복원하기",
      action: "restoreSavedSession",
    },
    {
      command: "/delete-session",
      label: "세션 삭제",
      description: "저장된 세션 삭제하기",
      action: "deleteSession",
    },
  ],
  cache: [
    {
      command: "/cache",
      label: "캐시 통계",
      description: "프로젝트 컨텍스트 캐시 통계 표시",
      action: "viewCacheStats",
    },
    {
      command: "/clear-cache",
      label: "캐시 초기화",
      description: "모든 컨텍스트 캐시 삭제",
      action: "clearCache",
    },
    {
      command: "/compact",
      label: "대화 압축",
      description: "현재 대화를 요약하여 토큰 절약",
      action: "compactConversation",
    },
  ],
  mcp: [
    {
      command: "/mcp",
      label: "MCP 서버 목록",
      description: "연결된 MCP 서버와 도구 목록 표시",
      action: "viewMcpServers",
    },
    {
      command: "/mcp connect",
      label: "서버 연결",
      description: "MCP 서버에 연결",
      action: "connectMcpServer",
    },
    {
      command: "/mcp disconnect",
      label: "서버 연결 해제",
      description: "MCP 서버 연결 해제",
      action: "disconnectMcpServer",
    },
  ],
};

/**
 * 모든 슬래시 명령어 목록 (하위 호환성)
 */
export const slashCommands = Object.values(slashCommandsByCategory).flat();

/**
 * '@' 메뉴 카테고리 정의
 */
export const atMenuCategories = [
  { id: "files", label: "Files", description: "프로젝트 파일 목록" },
  { id: "terminal", label: "Terminal", description: "터미널 히스토리 및 출력" },
  { id: "diagnostics", label: "Diagnostics", description: "에러 및 경고" },
];
