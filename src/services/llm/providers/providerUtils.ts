/**
 * Provider 공통 유틸리티
 * URL 및 인증 헤더 빌드 로직 (OpenAI-compat + Gemini 공용)
 */

import { AdminModelConfig } from '../AdminModelTypes';

/**
 * URL + 인증 헤더 빌드 (authType, customHeaders 반영)
 */
export function buildRequest(
    config: AdminModelConfig,
    baseUrl: string
): { url: string; headers: Record<string, string> } {
    const authType = config.authType || 'bearer';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let url = baseUrl;

    if (authType === 'query_param' && config.apiKey) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}key=${config.apiKey}`;
    } else if (authType === 'custom_header' && config.apiKey) {
        const headerName = config.authHeaderName || 'x-goog-api-key';
        headers[headerName] = config.apiKey;
    } else if (authType !== 'none' && config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    if (config.customHeaders) {
        Object.assign(headers, config.customHeaders);
    }

    return { url, headers };
}
