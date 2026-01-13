/**
 * Model Manager 타입 정의
 * LLM 모델 선택 및 관리를 담당하는 매니저의 타입들
 */

/**
 * 모델 제공자
 */
export enum ModelProvider {
    GEMINI = 'gemini',
    GPT = 'gpt',
    OLLAMA = 'ollama',
    ANTHROPIC = 'anthropic',
    CUSTOM = 'custom'
}

/**
 * 모델 정보
 */
export interface Model {
    id: string;
    name: string;
    provider: ModelProvider;
    displayName: string;
    description?: string;
    capabilities: ModelCapabilities;
    pricing?: ModelPricing;
    limits: ModelLimits;
    metadata?: ModelMetadata;
}

/**
 * 모델 기능
 */
export interface ModelCapabilities {
    chat: boolean;
    codeGeneration: boolean;
    codeAnalysis: boolean;
    imageInput: boolean;
    audioInput: boolean;
    functionCalling: boolean;
    streaming: boolean;
    embeddings: boolean;
}

/**
 * 모델 가격
 */
export interface ModelPricing {
    inputTokenPrice: number;  // per 1M tokens
    outputTokenPrice: number; // per 1M tokens
    currency: string;
}

/**
 * 모델 제한
 */
export interface ModelLimits {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxContextWindow: number;
    rateLimit?: RateLimit;
}

/**
 * 속도 제한
 */
export interface RateLimit {
    requestsPerMinute: number;
    tokensPerMinute: number;
}

/**
 * 모델 메타데이터
 */
export interface ModelMetadata {
    version?: string;
    releaseDate?: string;
    trainingCutoff?: string;
    languages?: string[];
    specialties?: string[];
    deprecated?: boolean;
}

/**
 * 모델 설정
 */
export interface ModelConfig {
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    systemPrompt?: string;
    timeout?: number;
    retries?: number;
}

/**
 * API 키 정보
 */
export interface ApiKeyInfo {
    provider: ModelProvider;
    key: string;
    isValid?: boolean;
    lastValidated?: number;
    expiresAt?: number;
    remainingQuota?: number;
}

/**
 * 모델 사용 통계
 */
export interface ModelUsageStats {
    modelId: string;
    totalRequests: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    averageResponseTime: number;
    successRate: number;
    lastUsedAt: number;
}

/**
 * 모델 선택 기준
 */
export interface ModelSelectionCriteria {
    task: 'chat' | 'code_generation' | 'code_analysis' | 'general';
    complexity: 'simple' | 'medium' | 'complex';
    speed: 'fast' | 'balanced' | 'quality';
    cost: 'free' | 'cheap' | 'premium';
    contextSize?: 'small' | 'medium' | 'large';
}

/**
 * 모델 추천 결과
 */
export interface ModelRecommendation {
    models: Model[];
    reasoning: string;
    confidence: number;
}

/**
 * 모델 응답 메타데이터
 */
export interface ResponseMetadata {
    model: string;
    provider: ModelProvider;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
    duration: number;
    finishReason?: 'stop' | 'length' | 'content_filter' | 'error';
}

/**
 * 모델 에러
 */
export interface ModelError {
    code: string;
    message: string;
    provider: ModelProvider;
    retryable: boolean;
    suggestion?: string;
}

/**
 * Ollama 특화 모델 정보
 */
export interface OllamaModelInfo extends Model {
    size: number;  // bytes
    format: string;
    family: string;
    parameterSize: string;
    quantizationLevel: string;
}

/**
 * 모델 그룹
 */
export interface ModelGroup {
    id: string;
    name: string;
    description: string;
    models: string[];  // model IDs
}

/**
 * 프롬프트 템플릿
 */
export interface PromptTemplate {
    id: string;
    name: string;
    description: string;
    template: string;
    variables: string[];
    model?: string;  // 추천 모델
}

