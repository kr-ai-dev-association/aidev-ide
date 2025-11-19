// --- START OF FILE src/storage/storage.ts ---

import * as vscode from 'vscode';
import { CryptoUtils } from '../utils/cryptoUtils';

const API_KEY_SECRET_KEY = 'aidev-ide.geminiApiKey';
const OLLAMA_API_URL_SECRET_KEY = 'aidev-ide.ollamaApiUrl';
const OLLAMA_ENDPOINT_SECRET_KEY = 'aidev-ide.ollamaEndpoint';
const OLLAMA_MODEL_SECRET_KEY = 'aidev-ide.ollamaModel';
const CURRENT_AI_MODEL_SECRET_KEY = 'aidev-ide.currentAiModel';
const BANYA_LICENSE_SERIAL_SECRET_KEY = 'aidev-ide.banyaLicenseSerial';
const OLLAMA_SERVER_TYPE_SECRET_KEY = 'aidev-ide.ollamaServerType';
const LOCAL_OLLAMA_API_URL_SECRET_KEY = 'aidev-ide.localOllamaApiUrl';
const LOCAL_OLLAMA_ENDPOINT_SECRET_KEY = 'aidev-ide.localOllamaEndpoint';
const REMOTE_OLLAMA_API_URL_SECRET_KEY = 'aidev-ide.remoteOllamaApiUrl';
const REMOTE_OLLAMA_ENDPOINT_SECRET_KEY = 'aidev-ide.remoteOllamaEndpoint';
const REMOTE_OLLAMA_MODEL_SECRET_KEY = 'aidev-ide.remoteOllamaModel';

export class StorageService {
    private secretStorage: vscode.SecretStorage;

    constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    /**
     * API Key를 VS Code SecretStorage에 안전하게 저장합니다.
     * @param apiKey 저장할 API Key
     */
    async saveApiKey(apiKey: string): Promise<void> {
        console.log('[StorageService] saveApiKey called', {
            apiKeyLength: apiKey?.length || 0,
            apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
            apiKeyTrimmed: apiKey ? apiKey.trim() : 'N/A'
        });
        await this.secretStorage.store(API_KEY_SECRET_KEY, apiKey);
        console.log('[StorageService] API Key saved to SecretStorage.');
        
        // 저장 후 확인
        const verifyKey = await this.secretStorage.get(API_KEY_SECRET_KEY);
        console.log('[StorageService] API Key verification after save:', {
            saved: !!verifyKey,
            length: verifyKey?.length || 0,
            matches: verifyKey === apiKey
        });
    }

    /**
     * SecretStorage에서 저장된 API Key를 불러옵니다.
     * @returns 저장된 API Key 또는 없을 경우 undefined
     */
    async getApiKey(): Promise<string | undefined> {
        console.log('[StorageService] getApiKey called');
        const apiKey = await this.secretStorage.get(API_KEY_SECRET_KEY);
        console.log('[StorageService] getApiKey result:', {
            hasApiKey: !!apiKey,
            apiKeyLength: apiKey?.length || 0,
            apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'N/A',
            apiKeyTrimmed: apiKey ? apiKey.trim() : 'N/A'
        });
        if (apiKey) {
            console.log('[StorageService] API Key loaded from SecretStorage.');
        } else {
            console.log('[StorageService] No API Key found in SecretStorage.');
        }
        return apiKey;
    }

    /**
     * SecretStorage에서 API Key를 삭제합니다.
     */
    async deleteApiKey(): Promise<void> {
        await this.secretStorage.delete(API_KEY_SECRET_KEY);
        console.log('API Key deleted from SecretStorage.');
    }

    /**
     * Ollama API URL을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param apiUrl 저장할 Ollama API URL
     */
    async saveOllamaApiUrl(apiUrl: string): Promise<void> {
        await this.secretStorage.store(OLLAMA_API_URL_SECRET_KEY, apiUrl);
        // console.log('Ollama API URL saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 Ollama API URL을 불러옵니다.
     * @returns 저장된 Ollama API URL 또는 없을 경우 undefined
     */
    async getOllamaApiUrl(): Promise<string | undefined> {
        const apiUrl = await this.secretStorage.get(OLLAMA_API_URL_SECRET_KEY);
        if (apiUrl) {
            // console.log('Ollama API URL loaded from SecretStorage.');
        } else {
            console.log('No Ollama API URL found in SecretStorage.');
        }
        return apiUrl;
    }

    /**
     * SecretStorage에서 Ollama API URL을 삭제합니다.
     */
    async deleteOllamaApiUrl(): Promise<void> {
        await this.secretStorage.delete(OLLAMA_API_URL_SECRET_KEY);
        console.log('Ollama API URL deleted from SecretStorage.');
    }

    /**
     * Ollama API 엔드포인트를 VS Code SecretStorage에 안전하게 저장합니다.
     * @param endpoint 저장할 Ollama API 엔드포인트
     */
    async saveOllamaEndpoint(endpoint: string): Promise<void> {
        await this.secretStorage.store(OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
        // console.log('Ollama API endpoint saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 Ollama API 엔드포인트를 불러옵니다.
     * @returns 저장된 Ollama API 엔드포인트 또는 없을 경우 기본값 '/api/generate'
     */
    async getOllamaEndpoint(): Promise<string> {
        const endpoint = await this.secretStorage.get(OLLAMA_ENDPOINT_SECRET_KEY);
        if (endpoint) {
            // console.log('Ollama API endpoint loaded from SecretStorage.');
            return endpoint;
        } else {
            console.log('No Ollama API endpoint found in SecretStorage, using default.');
            return '/api/generate';
        }
    }

    /**
     * SecretStorage에서 Ollama API 엔드포인트를 삭제합니다.
     */
    async deleteOllamaEndpoint(): Promise<void> {
        await this.secretStorage.delete(OLLAMA_ENDPOINT_SECRET_KEY);
        console.log('Ollama API endpoint deleted from SecretStorage.');
    }

    /**
     * Ollama 모델을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param model 저장할 Ollama 모델명
     */
    async saveOllamaModel(model: string): Promise<void> {
        await this.secretStorage.store(OLLAMA_MODEL_SECRET_KEY, model);
        // console.log('Ollama model saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 Ollama 모델을 불러옵니다.
     * @returns 저장된 Ollama 모델명 또는 없을 경우 기본값 'gemma3:27b'
     */
    async getOllamaModel(): Promise<string> {
        const model = await this.secretStorage.get(OLLAMA_MODEL_SECRET_KEY);
        if (model) {
            // console.log('Ollama model loaded from SecretStorage.');
            return model;
        } else {
            console.log('No Ollama model found in SecretStorage, using default.');
            return 'gemma3:27b';
        }
    }

    /**
     * SecretStorage에서 Ollama 모델을 삭제합니다.
     */
    async deleteOllamaModel(): Promise<void> {
        await this.secretStorage.delete(OLLAMA_MODEL_SECRET_KEY);
        console.log('Ollama model deleted from SecretStorage.');
    }

    /**
     * 현재 AI 모델을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param model 저장할 AI 모델 타입
     */
    async saveCurrentAiModel(model: string): Promise<void> {
        await this.secretStorage.store(CURRENT_AI_MODEL_SECRET_KEY, model);
        // console.log('Current AI model saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 현재 AI 모델을 불러옵니다.
     * @returns 저장된 AI 모델 타입 또는 없을 경우 undefined
     */
    async getCurrentAiModel(): Promise<string | undefined> {
        const model = await this.secretStorage.get(CURRENT_AI_MODEL_SECRET_KEY);
        if (model) {
            // console.log('Current AI model loaded from SecretStorage.');
        } else {
            console.log('No current AI model found in SecretStorage.');
        }
        return model;
    }

    /**
     * SecretStorage에서 현재 AI 모델을 삭제합니다.
     */
    async deleteCurrentAiModel(): Promise<void> {
        await this.secretStorage.delete(CURRENT_AI_MODEL_SECRET_KEY);
        console.log('Current AI model deleted from SecretStorage.');
    }

    /**
     * Banya 라이센스 시리얼을 암호화하여 VS Code SecretStorage에 안전하게 저장합니다.
     * @param licenseSerial 저장할 라이센스 시리얼
     */
    async saveBanyaLicenseSerial(licenseSerial: string): Promise<void> {
        const encryptedSerial = CryptoUtils.encrypt(licenseSerial);
        await this.secretStorage.store(BANYA_LICENSE_SERIAL_SECRET_KEY, encryptedSerial);
        console.log('Banya license serial encrypted and saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 Banya 라이센스 시리얼을 복호화하여 불러옵니다.
     * @returns 저장된 라이센스 시리얼 또는 없을 경우 undefined
     */
    async getBanyaLicenseSerial(): Promise<string | undefined> {
        const encryptedSerial = await this.secretStorage.get(BANYA_LICENSE_SERIAL_SECRET_KEY);
        if (encryptedSerial) {
            try {
                // 암호화된 형식인지 확인
                if (CryptoUtils.isEncrypted(encryptedSerial)) {
                    const decryptedSerial = CryptoUtils.decrypt(encryptedSerial);
                    // console.log('Banya license serial decrypted and loaded from SecretStorage.');
                    return decryptedSerial;
                } else {
                    // 기존 암호화되지 않은 형식인 경우 그대로 반환 (하위 호환성)
                    console.log('Banya license serial loaded from SecretStorage (legacy format).');
                    return encryptedSerial;
                }
            } catch (error) {
                console.error('라이센스 시리얼 복호화 중 오류 발생:', error);
                return undefined;
            }
        } else {
            console.log('No Banya license serial found in SecretStorage.');
            return undefined;
        }
    }

    /**
     * SecretStorage에서 Banya 라이센스 시리얼을 삭제합니다.
     */
    async deleteBanyaLicenseSerial(): Promise<void> {
        await this.secretStorage.delete(BANYA_LICENSE_SERIAL_SECRET_KEY);
        console.log('Banya license serial deleted from SecretStorage.');
    }

    // === 새로운 Ollama 서버 타입 및 로컬/원격 설정 메서드들 ===

    /**
     * Ollama 서버 타입을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param serverType 저장할 서버 타입 ('local' 또는 'remote')
     */
    async saveOllamaServerType(serverType: string): Promise<void> {
        await this.secretStorage.store(OLLAMA_SERVER_TYPE_SECRET_KEY, serverType);
        console.log('Ollama server type saved to SecretStorage:', serverType);
    }

    /**
     * SecretStorage에서 저장된 Ollama 서버 타입을 불러옵니다.
     * @returns 저장된 서버 타입 또는 없을 경우 기본값 'local'
     */
    async getOllamaServerType(): Promise<string> {
        const serverType = await this.secretStorage.get(OLLAMA_SERVER_TYPE_SECRET_KEY);
        return serverType || 'local';
    }

    /**
     * 로컬 Ollama API URL을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param apiUrl 저장할 로컬 Ollama API URL
     */
    async saveLocalOllamaApiUrl(apiUrl: string): Promise<void> {
        await this.secretStorage.store(LOCAL_OLLAMA_API_URL_SECRET_KEY, apiUrl);
        console.log('Local Ollama API URL saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 로컬 Ollama API URL을 불러옵니다.
     * @returns 저장된 로컬 Ollama API URL 또는 없을 경우 기본값 'http://localhost:11434'
     */
    async getLocalOllamaApiUrl(): Promise<string> {
        const apiUrl = await this.secretStorage.get(LOCAL_OLLAMA_API_URL_SECRET_KEY);
        return apiUrl || 'http://localhost:11434';
    }

    /**
     * 로컬 Ollama API 엔드포인트를 VS Code SecretStorage에 안전하게 저장합니다.
     * @param endpoint 저장할 로컬 Ollama API 엔드포인트
     */
    async saveLocalOllamaEndpoint(endpoint: string): Promise<void> {
        await this.secretStorage.store(LOCAL_OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
        console.log('Local Ollama API endpoint saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 로컬 Ollama API 엔드포인트를 불러옵니다.
     * @returns 저장된 로컬 Ollama API 엔드포인트 또는 없을 경우 기본값 '/api/generate'
     */
    async getLocalOllamaEndpoint(): Promise<string> {
        const endpoint = await this.secretStorage.get(LOCAL_OLLAMA_ENDPOINT_SECRET_KEY);
        return endpoint || '/api/generate';
    }

    /**
     * 원격 서버 Ollama API URL을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param apiUrl 저장할 원격 서버 Ollama API URL
     */
    async saveRemoteOllamaApiUrl(apiUrl: string): Promise<void> {
        await this.secretStorage.store(REMOTE_OLLAMA_API_URL_SECRET_KEY, apiUrl);
        console.log('Remote Ollama API URL saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 원격 서버 Ollama API URL을 불러옵니다.
     * @returns 저장된 원격 서버 Ollama API URL 또는 없을 경우 null
     */
    async getRemoteOllamaApiUrl(): Promise<string | null> {
        const apiUrl = await this.secretStorage.get(REMOTE_OLLAMA_API_URL_SECRET_KEY);
        return apiUrl || null;
    }

    /**
     * 원격 서버 Ollama API 엔드포인트를 VS Code SecretStorage에 안전하게 저장합니다.
     * @param endpoint 저장할 원격 서버 Ollama API 엔드포인트
     */
    async saveRemoteOllamaEndpoint(endpoint: string): Promise<void> {
        await this.secretStorage.store(REMOTE_OLLAMA_ENDPOINT_SECRET_KEY, endpoint);
        console.log('Remote Ollama API endpoint saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 원격 서버 Ollama API 엔드포인트를 불러옵니다.
     * @returns 저장된 원격 서버 Ollama API 엔드포인트 또는 없을 경우 기본값 '/api/generate'
     */
    async getRemoteOllamaEndpoint(): Promise<string> {
        const endpoint = await this.secretStorage.get(REMOTE_OLLAMA_ENDPOINT_SECRET_KEY);
        return endpoint || '/api/generate';
    }

    /**
     * 원격 서버 Ollama 모델명을 VS Code SecretStorage에 안전하게 저장합니다.
     * @param model 저장할 원격 서버 Ollama 모델명
     */
    async saveRemoteOllamaModel(model: string): Promise<void> {
        await this.secretStorage.store(REMOTE_OLLAMA_MODEL_SECRET_KEY, model);
        console.log('Remote Ollama model saved to SecretStorage.');
    }

    /**
     * SecretStorage에서 저장된 원격 서버 Ollama 모델명을 불러옵니다.
     * @returns 저장된 원격 서버 Ollama 모델명 또는 없을 경우 null
     */
    async getRemoteOllamaModel(): Promise<string | null> {
        const model = await this.secretStorage.get(REMOTE_OLLAMA_MODEL_SECRET_KEY);
        return model || null;
    }

    /**
     * 동적 오류 패턴을 저장합니다.
     */
    async saveDynamicErrorPatterns(patterns: Array<{ pattern: string, severity: string, description: string }>): Promise<void> {
        await this.secretStorage.store('dynamicErrorPatterns', JSON.stringify(patterns));
    }

    /**
     * 동적 오류 패턴을 불러옵니다.
     */
    async getDynamicErrorPatterns(): Promise<Array<{ pattern: string, severity: string, description: string }>> {
        const patterns = await this.secretStorage.get('dynamicErrorPatterns');
        return patterns ? JSON.parse(patterns) : [];
    }

    /**
     * 새로운 오류 패턴을 추가합니다.
     */
    async addErrorPattern(pattern: string, severity: string, description: string): Promise<void> {
        const existingPatterns = await this.getDynamicErrorPatterns();
        const newPattern = { pattern, severity, description };

        // 중복 체크
        const isDuplicate = existingPatterns.some(p => p.pattern === pattern);
        if (!isDuplicate) {
            existingPatterns.push(newPattern);
            await this.saveDynamicErrorPatterns(existingPatterns);
        }
    }

    // 추가된 메서드들
    async getAutoCorrectionEnabled(): Promise<boolean> {
        const enabled = await this.secretStorage.get('aidev-ide.autoCorrectionEnabled');
        // 값이 없으면 기본값 false 반환 (설정에서 OFF가 기본값)
        if (enabled === undefined || enabled === null) {
            return false;
        }
        return enabled === 'true';
    }

    async saveAutoCorrectionEnabled(enabled: boolean): Promise<void> {
        await this.secretStorage.store('aidev-ide.autoCorrectionEnabled', enabled.toString());
    }

    async getOutputLogEnabled(): Promise<boolean> {
        const enabled = await this.secretStorage.get('aidev-ide.outputLogEnabled');
        return enabled === 'true';
    }

    async saveOutputLogEnabled(enabled: boolean): Promise<void> {
        await this.secretStorage.store('aidev-ide.outputLogEnabled', enabled.toString());
    }

    async getErrorRetryCount(): Promise<number> {
        const count = await this.secretStorage.get('aidev-ide.errorRetryCount');
        return count ? parseInt(count) : 3;
    }

    async saveErrorRetryCount(count: number): Promise<void> {
        await this.secretStorage.store('aidev-ide.errorRetryCount', count.toString());
    }

    async getProjectRootPath(): Promise<string | undefined> {
        return await this.secretStorage.get('aidev-ide.projectRootPath');
    }

    async saveProjectRootPath(path: string): Promise<void> {
        await this.secretStorage.store('aidev-ide.projectRootPath', path);
    }

    async clearProjectRootPath(): Promise<void> {
        await this.secretStorage.delete('aidev-ide.projectRootPath');
    }

    async getWeatherApiKey(): Promise<string | undefined> {
        return await this.secretStorage.get('aidev-ide.weatherApiKey');
    }

    async saveWeatherApiKey(apiKey: string): Promise<void> {
        await this.secretStorage.store('aidev-ide.weatherApiKey', apiKey);
    }

    async getNewsApiKey(): Promise<string | undefined> {
        return await this.secretStorage.get('aidev-ide.newsApiKey');
    }

    async saveNewsApiKey(apiKey: string): Promise<void> {
        await this.secretStorage.store('aidev-ide.newsApiKey', apiKey);
    }

    async getIsLicenseVerified(): Promise<boolean> {
        const verified = await this.secretStorage.get('aidev-ide.isLicenseVerified');
        return verified === 'true';
    }

    async saveIsLicenseVerified(verified: boolean): Promise<void> {
        await this.secretStorage.store('aidev-ide.isLicenseVerified', verified.toString());
    }

    async saveAutoUpdateEnabled(enabled: boolean): Promise<void> {
        await this.secretStorage.store('aidev-ide.autoUpdateEnabled', enabled.toString());
    }

    async getAutoUpdateEnabled(): Promise<boolean> {
        const enabled = await this.secretStorage.get('aidev-ide.autoUpdateEnabled');
        return enabled === 'true';
    }

    async saveAiModel(model: string): Promise<void> {
        await this.secretStorage.store('aidev-ide.aiModel', model);
    }

    async getAiModel(): Promise<string> {
        const model = await this.secretStorage.get('aidev-ide.aiModel');
        return model || 'gemini';
    }

    async saveLanguage(language: string): Promise<void> {
        await this.secretStorage.store('aidev-ide.language', language);
    }

    async getLanguage(): Promise<string> {
        const language = await this.secretStorage.get('aidev-ide.language');
        return language || 'ko';
    }

    /**
     * Planning(Reasoning)용 모델을 저장/조회합니다.
     */
    async savePlanningModel(model: string): Promise<void> {
        await this.secretStorage.store('aidev-ide.planningModel', model);
    }

    async getPlanningModel(): Promise<string | undefined> {
        const model = await this.secretStorage.get('aidev-ide.planningModel');
        return model || undefined;
    }
}

// --- END OF FILE src/storage/storage.ts ---