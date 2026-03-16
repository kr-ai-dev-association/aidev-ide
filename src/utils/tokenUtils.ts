// 순환 참조 방지: services/types에서 직접 import
import { AiModelType } from '../services/types';
import { AgentConfig } from '../core/config/AgentConfig';

// 모델별 토큰 제한
export const MODEL_TOKEN_LIMITS = {
    [AiModelType.OLLAMA]: {
        maxInputTokens: 128000,  // 일반 Ollama 모델의 보수적 기본값
        maxOutputTokens: 128000,
        maxTotalTokens: 128000
    },
    [AiModelType.ADMIN]: {
        maxInputTokens: 128000,  // 관리자 모델 기본값 (동적 업데이트 가능)
        maxOutputTokens: 128000,
        maxTotalTokens: 128000
    }
};

/**
 * 관리자 모델의 토큰 제한을 동적으로 업데이트합니다.
 * AdminModelConfig의 contextWindow, maxTokens 값을 반영합니다.
 */
export function updateAdminTokenLimits(contextWindow?: number, maxTokens?: number): void {
    const adminLimits = MODEL_TOKEN_LIMITS[AiModelType.ADMIN];
    if (contextWindow && contextWindow > 0) {
        adminLimits.maxInputTokens = contextWindow;
        adminLimits.maxTotalTokens = contextWindow;
    }
    if (maxTokens && maxTokens > 0) {
        adminLimits.maxOutputTokens = maxTokens;
    }
}

/**
 * 텍스트의 대략적인 토큰 수를 계산합니다.
 *
 * BPE 토크나이저 (cl100k_base / o200k_base) 기준 실측 근사값:
 *   - 영어 단어: ~1.3 토큰/단어 (평균 4 문자/토큰)
 *   - 한국어/CJK: ~1.0 토큰/글자 (한 글자가 2-3 바이트 → 보통 1 토큰)
 *   - 코드: 영어보다 토큰 밀도 높음 (~3 문자/토큰, 기호가 개별 토큰)
 *   - 공백/줄바꿈: 인접 공백이 합쳐지므로 ~2 공백/토큰
 *
 * tiktoken WASM은 VSCode 확장 환경에서 로딩 이슈가 있어
 * 문자 분류 기반 가중 추정을 사용합니다.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;

    let cjkCount = 0;
    let alphaNumCount = 0;
    let whitespaceCount = 0;
    let punctCount = 0;

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (
            (code >= 0xAC00 && code <= 0xD7AF) || // 한국어 완성형
            (code >= 0x3040 && code <= 0x30FF) || // 히라가나/가타카나
            (code >= 0x4E00 && code <= 0x9FFF) || // CJK 통합 한자
            (code >= 0x1100 && code <= 0x11FF) || // 한국어 자모
            (code >= 0x3130 && code <= 0x318F)    // 한국어 호환 자모
        ) {
            cjkCount++;
        } else if (
            (code >= 0x41 && code <= 0x5A) || // A-Z
            (code >= 0x61 && code <= 0x7A) || // a-z
            (code >= 0x30 && code <= 0x39)    // 0-9
        ) {
            alphaNumCount++;
        } else if (code === 0x20 || code === 0x09 || code === 0x0A || code === 0x0D) {
            whitespaceCount++;
        } else {
            punctCount++;
        }
    }

    // CJK: 1글자 ≈ 1토큰 (BPE에서 CJK 글자는 거의 항상 개별 토큰)
    // 영숫자: ~4문자/토큰 (BPE 영어 단어 기준)
    // 공백: ~2문자/토큰 (연속 공백 병합)
    // 구두점/기호: ~1.5문자/토큰 (대부분 개별 토큰이지만 일부 합쳐짐)
    const cjkTokens = cjkCount;
    const alphaNumTokens = Math.ceil(alphaNumCount / 4);
    const whitespaceTokens = Math.ceil(whitespaceCount / 2);
    const punctTokens = Math.ceil(punctCount / 1.5);

    return cjkTokens + alphaNumTokens + whitespaceTokens + punctTokens;
}

/**
 * 시스템 프롬프트와 사용자 메시지의 총 토큰 수를 계산합니다.
 */
export function calculateTotalTokens(systemPrompt: string, userParts: any[]): number {
    let totalTokens = estimateTokens(systemPrompt);

    for (const part of userParts) {
        if (part.text) {
            totalTokens += estimateTokens(part.text);
        }
        // 이미지 데이터는 토큰으로 계산하지 않음 (별도 처리)
    }

    return totalTokens;
}

/**
 * 모델의 토큰 제한을 초과하는지 확인합니다.
 */
export function checkTokenLimit(
    systemPrompt: string,
    userParts: any[],
    modelType: AiModelType,
    actualModelName?: string
): { isExceeded: boolean; currentTokens: number; maxTokens: number; message: string } {
    // 안전 가드: 알 수 없는 모델 타입 대비
    const limits = MODEL_TOKEN_LIMITS[modelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
    const currentTokens = calculateTotalTokens(systemPrompt, userParts);

    const isExceeded = currentTokens > limits.maxInputTokens;

    let message = '';
    if (isExceeded) {
        // 실제 모델명이 제공되면 사용, 아니면 기본 모델명 사용
        const modelName = actualModelName || getDefaultModelName(modelType);
        message = `토큰 제한 초과: ${modelName}의 입력 토큰 제한(${limits.maxInputTokens.toLocaleString()}개)을 초과했습니다. 현재: ${currentTokens.toLocaleString()}개`;
    }

    return {
        isExceeded,
        currentTokens,
        maxTokens: limits.maxInputTokens,
        message
    };
}

/**
 * 모델 타입에 따른 기본 모델명을 반환합니다.
 * @param modelType 모델 타입
 * @returns 기본 모델명
 */
function getDefaultModelName(modelType: AiModelType): string {
    switch (modelType) {
        case AiModelType.OLLAMA:
            return 'Ollama Local Model';
        case AiModelType.ADMIN:
            return 'Admin Model';
        default:
            return 'Unknown Model';
    }
}

/**
 * 토큰 사용량을 로그로 출력합니다.
 */
export function logTokenUsage(
    systemPrompt: string,
    userParts: any[],
    modelType: AiModelType,
    actualModelName?: string
): void {
    // 안전 가드: 알 수 없는 모델 타입 대비
    const limits = MODEL_TOKEN_LIMITS[modelType] || MODEL_TOKEN_LIMITS[AiModelType.OLLAMA];
    const currentTokens = calculateTotalTokens(systemPrompt, userParts);
    const usagePercentage = (currentTokens / limits.maxInputTokens) * 100;

    const label = actualModelName || modelType;
    // console.log(`[TokenUtils] ${label} 토큰 사용량:`);
    // console.log(`  - 현재 토큰: ${currentTokens.toLocaleString()}개`);
    // console.log(`  - 최대 토큰: ${limits.maxInputTokens.toLocaleString()}개`);
    // console.log(`  - 사용률: ${usagePercentage.toFixed(1)}%`);

    if (usagePercentage > AgentConfig.TOKEN_USAGE_WARNING_THRESHOLD) {
        console.warn(`[TokenUtils] 토큰 사용률이 높습니다: ${usagePercentage.toFixed(1)}%`);
    }

    if (currentTokens > limits.maxInputTokens) {
        console.error(`[TokenUtils] 토큰 제한 초과: ${currentTokens.toLocaleString()} > ${limits.maxInputTokens.toLocaleString()}`);
    }
}
