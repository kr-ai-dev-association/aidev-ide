export enum AiModelType {
  OLLAMA = "ollama",
  ADMIN = "admin",
}

export enum PromptType {
  CODE_GENERATION = "code_generation",
  /** ASK 모드: 읽기 전용 (파일 쓰기/삭제/명령 실행 차단, 조사·질의응답 전용) */
  GENERAL_ASK = "general_ask",
}

/** webview 채팅 모드 문자열("ASK"/그 외)을 PromptType으로 매핑 */
export function chatModeToPromptType(mode?: string): PromptType {
  switch (mode) {
    case "ASK":
      return PromptType.GENERAL_ASK;
    default:
      return PromptType.CODE_GENERATION;
  }
}

/** LLM 메시지 파트 (텍스트 또는 인라인 데이터) */
export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}
