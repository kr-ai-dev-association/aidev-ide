"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_TOKEN_LIMITS = void 0;
exports.estimateTokenCount = estimateTokenCount;
exports.calculateTotalTokens = calculateTotalTokens;
exports.checkTokenLimit = checkTokenLimit;
exports.logTokenUsage = logTokenUsage;
exports.estimateTokens = estimateTokens;
// 순환 참조 방지: services/types에서 직접 import
const types_1 = require("../services/types");
const AgentConfig_1 = require("../core/config/AgentConfig");
// 모델별 토큰 제한
exports.MODEL_TOKEN_LIMITS = {
    [types_1.AiModelType.GEMINI]: {
        maxInputTokens: 1000000, // Gemini 3.0 Flash/Pro의 입력 토큰 제한
        maxOutputTokens: 500000, // 현재 설정된 출력 토큰 제한
        maxTotalTokens: 1500000 // 총 토큰 제한
    },
    [types_1.AiModelType.OLLAMA]: {
        maxInputTokens: 128000, // 일반 Ollama 모델의 보수적 기본값
        maxOutputTokens: 128000,
        maxTotalTokens: 128000
    }
};
/**
 * 텍스트의 대략적인 토큰 수를 계산합니다.
 * 영어: 약 4자 = 1토큰
 * 한국어: 약 3자 = 1토큰
 * 코드: 약 4자 = 1토큰
 */
function estimateTokenCount(text) {
    if (!text)
        return 0;
    // 영어, 한국어, 코드 문자를 구분하여 계산
    const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
    const koreanChars = (text.match(/[가-힣]/g) || []).length;
    const codeChars = (text.match(/[{}()\[\]<>;:,./\\|`~!@#$%^&*+=?-]/g) || []).length;
    const otherChars = text.length - englishChars - koreanChars - codeChars;
    // 토큰 계산 (대략적인 추정)
    const englishTokens = Math.ceil(englishChars / 4);
    const koreanTokens = Math.ceil(koreanChars / 3);
    const codeTokens = Math.ceil(codeChars / 4);
    const otherTokens = Math.ceil(otherChars / 4);
    return englishTokens + koreanTokens + codeTokens + otherTokens;
}
/**
 * 시스템 프롬프트와 사용자 메시지의 총 토큰 수를 계산합니다.
 */
function calculateTotalTokens(systemPrompt, userParts) {
    let totalTokens = estimateTokenCount(systemPrompt);
    for (const part of userParts) {
        if (part.text) {
            totalTokens += estimateTokenCount(part.text);
        }
        // 이미지 데이터는 토큰으로 계산하지 않음 (별도 처리)
    }
    return totalTokens;
}
/**
 * 모델의 토큰 제한을 초과하는지 확인합니다.
 */
function checkTokenLimit(systemPrompt, userParts, modelType, actualModelName) {
    // 안전 가드: 알 수 없는 모델 타입 대비
    const limits = exports.MODEL_TOKEN_LIMITS[modelType] || exports.MODEL_TOKEN_LIMITS[types_1.AiModelType.OLLAMA] || exports.MODEL_TOKEN_LIMITS[types_1.AiModelType.GEMINI];
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
function getDefaultModelName(modelType) {
    switch (modelType) {
        case types_1.AiModelType.GEMINI:
            return 'Gemini 3.0 Pro';
        case types_1.AiModelType.OLLAMA:
            return 'Ollama Local Model';
        default:
            return 'Unknown Model';
    }
}
/**
 * 토큰 사용량을 로그로 출력합니다.
 */
function logTokenUsage(systemPrompt, userParts, modelType, actualModelName) {
    // 안전 가드: 알 수 없는 모델 타입 대비
    const limits = exports.MODEL_TOKEN_LIMITS[modelType] || exports.MODEL_TOKEN_LIMITS[types_1.AiModelType.OLLAMA] || exports.MODEL_TOKEN_LIMITS[types_1.AiModelType.GEMINI];
    const currentTokens = calculateTotalTokens(systemPrompt, userParts);
    const usagePercentage = (currentTokens / limits.maxInputTokens) * 100;
    const label = actualModelName || modelType;
    // console.log(`[TokenUtils] ${label} 토큰 사용량:`);
    // console.log(`  - 현재 토큰: ${currentTokens.toLocaleString()}개`);
    // console.log(`  - 최대 토큰: ${limits.maxInputTokens.toLocaleString()}개`);
    // console.log(`  - 사용률: ${usagePercentage.toFixed(1)}%`);
    if (usagePercentage > AgentConfig_1.AgentConfig.TOKEN_USAGE_WARNING_THRESHOLD) {
        console.warn(`[TokenUtils] 토큰 사용률이 높습니다: ${usagePercentage.toFixed(1)}%`);
    }
    if (currentTokens > limits.maxInputTokens) {
        console.error(`[TokenUtils] 토큰 제한 초과: ${currentTokens.toLocaleString()} > ${limits.maxInputTokens.toLocaleString()}`);
    }
}
/**
 * 텍스트의 대략적인 토큰 수를 계산합니다.
 * 대부분의 토큰화 모델에서 1 토큰 ≈ 4 문자 (영어 기준) 또는 1-2 문자 (한국어 기준)
 * @param text 토큰 수를 계산할 텍스트
 * @returns 대략적인 토큰 수
 */
function estimateTokens(text) {
    if (!text)
        return 0;
    // 한국어와 영어를 구분하여 계산
    const koreanChars = (text.match(/[가-힣]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    const otherChars = text.length - koreanChars - englishChars;
    // 한국어: 1-2 문자당 1 토큰, 영어: 4 문자당 1 토큰, 기타: 3 문자당 1 토큰
    const koreanTokens = Math.ceil(koreanChars / 1.5);
    const englishTokens = Math.ceil(englishChars / 4);
    const otherTokens = Math.ceil(otherChars / 3);
    return koreanTokens + englishTokens + otherTokens;
}
//# sourceMappingURL=tokenUtils.js.map