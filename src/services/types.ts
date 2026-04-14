export enum AiModelType {
  OLLAMA = "ollama",
  ADMIN = "admin",
}

export enum PromptType {
  CODE_GENERATION = "code_generation",
}

/** LLM 메시지 파트 (텍스트 또는 인라인 데이터) */
export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}
