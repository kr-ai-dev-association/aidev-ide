import * as vscode from 'vscode';
import { StorageService } from '../services/storage';
import { GeminiApi } from '../ai/gemini';
import { ConfigurationService } from '../services/configurationService'; // 새로 추가
import { NotificationService } from '../services/notificationService'; // 새로 추가
import { LicenseService } from '../services/licenseService'; // 라이센스 서비스 추가
import { OllamaBlockerService } from '../services/ollamaBlockerService'; // Ollama Blocker 서비스 추가
import { createAndSetupWebviewPanel } from './panelUtils';
import { TerminalDaemonService } from '../services/terminalDaemonService';
import * as http from 'http';
import * as https from 'https';

// 전역 webview 배열 - 모든 활성 webview를 추적
const allWebviews: vscode.Webview[] = [];

/**
 * 웹뷰에 안전하게 메시지를 전송하는 헬퍼 함수
 */
function safePostMessage(panel: vscode.WebviewPanel, message: any): void {
    try {
        if (panel && !panel.webview) {
            console.log('[PanelManager] Panel webview is not available, skipping message');
            return;
        }
        panel.webview.postMessage(message);
    } catch (error) {
        console.log('[PanelManager] Failed to post message to webview:', error);
    }
}

/**
 * AIDEV-IDE 설정 패널을 엽니다.
 */
export function openSettingsPanel(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    viewColumn: vscode.ViewColumn,
    configurationService: ConfigurationService,
    notificationService: NotificationService,
    storageService: StorageService, // StorageService 추가
    geminiApi: GeminiApi, // GeminiApi 추가
    licenseService: LicenseService, // LicenseService 추가
    ollamaApi?: any, // OllamaApi 추가
    llmService?: any, // LlmService 추가
    ollamaBlockerService?: OllamaBlockerService // OllamaBlockerService 추가
) {
    const panel = createAndSetupWebviewPanel(extensionUri, context, 'settings', 'AIDEV-IDE Settings', 'settings', viewColumn,
        async (data, panel: vscode.WebviewPanel) => {
            // console.log('Settings panel received message:', data.command, data);
            switch (data.command) {
                case 'getCurrentSettings': {
                    try {
                        // 현재 설정들을 가져와서 웹뷰에 전송
                        const apiKey = await storageService.getApiKey();
                        const ollamaApiUrl = await storageService.getOllamaApiUrl();
                        const ollamaEndpoint = await storageService.getOllamaEndpoint();
                        const ollamaModel = await storageService.getOllamaModel();
                        const ollamaServerType = await storageService.getOllamaServerType();
                        const remoteOllamaApiUrl = await storageService.getRemoteOllamaApiUrl();
                        const remoteOllamaEndpoint = await storageService.getRemoteOllamaEndpoint();
                        const remoteOllamaModel = await storageService.getRemoteOllamaModel();
                        const autoCorrectionEnabled = await storageService.getAutoCorrectionEnabled();
                        const outputLogEnabled = await storageService.getOutputLogEnabled();
                        const errorRetryCount = await storageService.getErrorRetryCount();
                        const projectRootPath = await storageService.getProjectRootPath();
                        const weatherApiKey = await storageService.getWeatherApiKey();
                        const newsApiKey = await storageService.getNewsApiKey();
                        const banyaLicenseSerial = await storageService.getBanyaLicenseSerial();
                        const isLicenseVerified = await storageService.getIsLicenseVerified();
                        const aiModel = await storageService.getAiModel();

                        const messageToSend = {
                            command: 'currentSettings',
                            apiKey: apiKey || '',
                            ollamaApiUrl: ollamaApiUrl || 'http://localhost:11434',
                            ollamaEndpoint: ollamaEndpoint || '/api/generate',
                            ollamaModel: ollamaModel || 'gemma3:27b',
                            ollamaServerType: ollamaServerType || 'local',
                            localOllamaApiUrl: ollamaApiUrl || 'http://localhost:11434',
                            localOllamaEndpoint: ollamaEndpoint || '/api/generate',
                            remoteOllamaApiUrl: remoteOllamaApiUrl || '',
                            remoteOllamaEndpoint: remoteOllamaEndpoint || '/api/generate',
                            remoteOllamaModel: remoteOllamaModel || '',
                            autoCorrectionEnabled: autoCorrectionEnabled || false,
                            outputLogEnabled: outputLogEnabled || false,
                            errorRetryCount: errorRetryCount || 3,
                            projectRootPath: projectRootPath || '',
                            weatherApiKey: weatherApiKey || '',
                            newsApiKey: newsApiKey || '',
                            banyaLicenseSerial: banyaLicenseSerial || '',
                            isLicenseVerified: isLicenseVerified, // 라이선스 검증 상태 추가
                            aiModel: aiModel || 'gemini' // AI 모델 정보 추가
                        };
                        // console.log('Sending currentApiKeys message:', messageToSend);
                        safePostMessage(panel, messageToSend);
                    } catch (error: any) {
                        console.error('Error getting current settings:', error);
                        safePostMessage(panel, { command: 'currentSettings', error: error.message });
                    }
                    break;
                }
                case 'getOllamaModels': {
                    try {
                        const apiUrl = (await storageService.getOllamaApiUrl()) || 'http://localhost:11434';
                        const url = new URL('/api/tags', apiUrl);

                        const models = await new Promise<string[]>((resolve, reject) => {
                            const isHttps = url.protocol === 'https:';
                            const client = isHttps ? https : http;
                            const req = client.request({
                                hostname: url.hostname,
                                port: url.port || (isHttps ? 443 : 80),
                                path: url.pathname + url.search,
                                method: 'GET',
                                headers: { 'Content-Type': 'application/json' }
                            }, (res) => {
                                let data = '';
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => {
                                    try {
                                        const parsed = JSON.parse(data);
                                        const list: string[] = Array.isArray(parsed?.models)
                                            ? parsed.models.map((m: any) => m?.name).filter((n: any) => typeof n === 'string')
                                            : [];
                                        resolve(list);
                                    } catch (e) { reject(e); }
                                });
                            });
                            req.on('error', reject);
                            req.end();
                        });

                        safePostMessage(panel, { command: 'ollamaModels', models, apiUrl: apiUrl });
                    } catch (e: any) {
                        safePostMessage(panel, { command: 'ollamaModels', models: [], error: e?.message || String(e) });
                    }
                    break;
                }
                case 'downloadOllamaModel': {
                    try {
                        const modelName = data.modelName;
                        if (!modelName) {
                            safePostMessage(panel, { command: 'modelDownloadError', error: 'Model name is required' });
                            return;
                        }

                        // Ollama 모델 다운로드 시작
                        await downloadOllamaModel(modelName, panel, storageService, notificationService);
                    } catch (error: any) {
                        console.error('[PanelManager] Failed to download Ollama model:', error);
                        safePostMessage(panel, { command: 'modelDownloadError', error: error.message });
                    }
                    break;
                }
                case 'getSupportedModels': {
                    try {
                        const supportedModels = await loadSupportedModels();
                        safePostMessage(panel, { command: 'supportedModels', models: supportedModels });
                    } catch (error: any) {
                        console.error('[PanelManager] Failed to load supported models:', error);
                        safePostMessage(panel, { command: 'supportedModelsError', error: error.message });
                    }
                    break;
                }
                case 'refreshOllamaModels': {
                    // Ollama 모델 목록 새로고침
                    try {
                        const apiUrl = (await storageService.getOllamaApiUrl()) || 'http://localhost:11434';
                        const url = new URL('/api/tags', apiUrl);
                            const isHttps = url.protocol === 'https:';
                            const client = isHttps ? https : http;

                        const models = await new Promise<string[]>((resolve, reject) => {
                            const req = client.request({
                                hostname: url.hostname,
                                port: url.port || (isHttps ? 443 : 80),
                                path: url.pathname + url.search,
                                method: 'GET'
                            }, (res) => {
                                let data = '';
                                res.on('data', chunk => { data += chunk; });
                                res.on('end', () => {
                                    try {
                                        const parsed = JSON.parse(data);
                                        const list: string[] = Array.isArray(parsed?.models)
                                            ? parsed.models.map((m: any) => m?.name).filter((n: any) => typeof n === 'string')
                                            : [];
                                        resolve(list);
                                    } catch (e) { reject(e); }
                                });
                            });
                            req.on('error', reject);
                            req.end();
                        });

                        safePostMessage(panel, { command: 'ollamaModels', models, apiUrl: apiUrl });
                    } catch (e: any) {
                        safePostMessage(panel, { command: 'ollamaModels', models: [], error: e?.message || String(e) });
                    }
                    break;
                }
                case 'saveApiKey': // Gemini API 키 저장 케이스 추가
                    const apiKeyToSave = data.apiKey;
                    if (apiKeyToSave && typeof apiKeyToSave === 'string') {
                        try {
                            await storageService.saveApiKey(apiKeyToSave);
                            geminiApi.updateApiKey(apiKeyToSave);
                            safePostMessage(panel, { command: 'apiKeySaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Gemini API Key saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'apiKeySaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Gemini API Key: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'apiKeySaveError', error: 'Invalid API key' });
                        notificationService.showErrorMessage('Invalid API key provided.');
                    }
                    break;
                case 'saveOllamaApiUrl': // Ollama API URL 저장 케이스 추가
                    const ollamaApiUrlToSave = data.ollamaApiUrl;
                    if (ollamaApiUrlToSave && typeof ollamaApiUrlToSave === 'string') {
                        try {
                            await storageService.saveOllamaApiUrl(ollamaApiUrlToSave);
                            safePostMessage(panel, { command: 'ollamaApiUrlSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama API URL saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'ollamaApiUrlSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama API URL: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'ollamaApiUrlSaveError', error: 'Invalid Ollama API URL' });
                        notificationService.showErrorMessage('Invalid Ollama API URL provided.');
                    }
                    break;
                case 'saveOllamaEndpoint': // Ollama 엔드포인트 저장 케이스 추가
                    const ollamaEndpointToSave = data.ollamaEndpoint;
                    if (ollamaEndpointToSave && typeof ollamaEndpointToSave === 'string') {
                        try {
                            await storageService.saveOllamaEndpoint(ollamaEndpointToSave);
                            safePostMessage(panel, { command: 'ollamaEndpointSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama Endpoint saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'ollamaEndpointSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama Endpoint: ${error.message}`);
                        }
                            } else {
                        safePostMessage(panel, { command: 'ollamaEndpointSaveError', error: 'Invalid Ollama Endpoint' });
                        notificationService.showErrorMessage('Invalid Ollama Endpoint provided.');
                    }
                    break;
                case 'saveLocalOllamaApiUrl': // 로컬 Ollama API URL 저장 케이스 추가
                    const localOllamaApiUrlToSave = data.localOllamaApiUrl;
                    if (localOllamaApiUrlToSave && typeof localOllamaApiUrlToSave === 'string') {
                        try {
                            await storageService.saveOllamaApiUrl(localOllamaApiUrlToSave);
                            safePostMessage(panel, { command: 'localOllamaApiUrlSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Local Ollama API URL saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'localOllamaApiUrlError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Local Ollama API URL: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'localOllamaApiUrlError', error: 'Invalid Local Ollama API URL' });
                        notificationService.showErrorMessage('Invalid Local Ollama API URL provided.');
                    }
                    break;
                case 'saveLocalOllamaEndpoint': // 로컬 Ollama 엔드포인트 저장 케이스 추가
                    const localOllamaEndpointToSave = data.localOllamaEndpoint;
                    if (localOllamaEndpointToSave && typeof localOllamaEndpointToSave === 'string') {
                        try {
                            await storageService.saveOllamaEndpoint(localOllamaEndpointToSave);
                            safePostMessage(panel, { command: 'localOllamaEndpointSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Local Ollama Endpoint saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'localOllamaEndpointError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Local Ollama Endpoint: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'localOllamaEndpointError', error: 'Invalid Local Ollama Endpoint' });
                        notificationService.showErrorMessage('Invalid Local Ollama Endpoint provided.');
                    }
                    break;
                case 'saveOllamaModel': // Ollama 모델 저장 케이스 추가
                    const ollamaModelToSave = data.ollamaModel || data.model;
                    if (ollamaModelToSave && typeof ollamaModelToSave === 'string') {
                        try {
                            await storageService.saveOllamaModel(ollamaModelToSave);
                            safePostMessage(panel, { command: 'ollamaModelSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama Model saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'ollamaModelSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama Model: ${error.message}`);
                        }
                                    } else {
                        safePostMessage(panel, { command: 'ollamaModelSaveError', error: 'Invalid Ollama Model' });
                        notificationService.showErrorMessage('Invalid Ollama Model provided.');
                    }
                    break;
                case 'saveOllamaServerType': // Ollama 서버 타입 저장 케이스 추가
                    const ollamaServerTypeToSave = data.ollamaServerType;
                    // console.log('[PanelManager] Saving Ollama server type:', ollamaServerTypeToSave);
                    if (ollamaServerTypeToSave && typeof ollamaServerTypeToSave === 'string') {
                        try {
                            await storageService.saveOllamaServerType(ollamaServerTypeToSave);
                            safePostMessage(panel, { command: 'ollamaServerTypeSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama Server Type saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'ollamaServerTypeSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama Server Type: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'ollamaServerTypeSaveError', error: 'Invalid Ollama Server Type' });
                        notificationService.showErrorMessage('Invalid Ollama Server Type provided.');
                    }
                    break;
                case 'saveRemoteOllamaApiUrl': // 원격 Ollama API URL 저장 케이스 추가
                    const remoteOllamaApiUrlToSave = data.remoteOllamaApiUrl;
                    if (remoteOllamaApiUrlToSave && typeof remoteOllamaApiUrlToSave === 'string') {
                        try {
                            await storageService.saveRemoteOllamaApiUrl(remoteOllamaApiUrlToSave);
                            safePostMessage(panel, { command: 'remoteOllamaApiUrlSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Remote Ollama API URL saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'remoteOllamaApiUrlSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Remote Ollama API URL: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'remoteOllamaApiUrlSaveError', error: 'Invalid Remote Ollama API URL' });
                        notificationService.showErrorMessage('Invalid Remote Ollama API URL provided.');
                    }
                    break;
                case 'saveRemoteOllamaEndpoint': // 원격 Ollama 엔드포인트 저장 케이스 추가
                    const remoteOllamaEndpointToSave = data.remoteOllamaEndpoint;
                    if (remoteOllamaEndpointToSave && typeof remoteOllamaEndpointToSave === 'string') {
                        try {
                            await storageService.saveRemoteOllamaEndpoint(remoteOllamaEndpointToSave);
                            safePostMessage(panel, { command: 'remoteOllamaEndpointSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Remote Ollama Endpoint saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'remoteOllamaEndpointSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Remote Ollama Endpoint: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'remoteOllamaEndpointSaveError', error: 'Invalid Remote Ollama Endpoint' });
                        notificationService.showErrorMessage('Invalid Remote Ollama Endpoint provided.');
                    }
                    break;
                case 'saveRemoteOllamaModel': // 원격 Ollama 모델 저장 케이스 추가
                    const remoteOllamaModelToSave = data.remoteOllamaModel;
                    if (remoteOllamaModelToSave && typeof remoteOllamaModelToSave === 'string') {
                        try {
                            await storageService.saveRemoteOllamaModel(remoteOllamaModelToSave);
                            safePostMessage(panel, { command: 'remoteOllamaModelSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Remote Ollama Model saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'remoteOllamaModelSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Remote Ollama Model: ${error.message}`);
                        }
                                        } else {
                        safePostMessage(panel, { command: 'remoteOllamaModelSaveError', error: 'Invalid Remote Ollama Model' });
                        notificationService.showErrorMessage('Invalid Remote Ollama Model provided.');
                    }
                    break;
                case 'saveWeatherApiKey': // 기상청 API 키 저장 케이스 추가
                    const weatherApiKeyToSave = data.weatherApiKey;
                    if (weatherApiKeyToSave && typeof weatherApiKeyToSave === 'string') {
                        try {
                            await storageService.saveWeatherApiKey(weatherApiKeyToSave);
                            safePostMessage(panel, { command: 'weatherApiKeySaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Weather API Key saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'weatherApiKeySaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Weather API Key: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'weatherApiKeySaveError', error: 'Invalid Weather API Key' });
                        notificationService.showErrorMessage('Invalid Weather API Key provided.');
                    }
                    break;
                case 'saveNewsApiKey': // 뉴스 API 키 저장 케이스 추가
                    const newsApiKeyToSave = data.newsApiKey;
                    if (newsApiKeyToSave && typeof newsApiKeyToSave === 'string') {
                        try {
                            await storageService.saveNewsApiKey(newsApiKeyToSave);
                            safePostMessage(panel, { command: 'newsApiKeySaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: News API Key saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'newsApiKeySaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving News API Key: ${error.message}`);
                                }
                            } else {
                        safePostMessage(panel, { command: 'newsApiKeySaveError', error: 'Invalid News API Key' });
                        notificationService.showErrorMessage('Invalid News API Key provided.');
                    }
                    break;
                case 'saveBanyaLicenseSerial': // Banya 라이선스 시리얼 저장 케이스 추가
                    const banyaLicenseSerialToSave = data.banyaLicenseSerial;
                    if (banyaLicenseSerialToSave && typeof banyaLicenseSerialToSave === 'string') {
                        try {
                            await storageService.saveBanyaLicenseSerial(banyaLicenseSerialToSave);
                            safePostMessage(panel, { command: 'banyaLicenseSerialSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Banya License Serial saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'banyaLicenseSerialSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Banya License Serial: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'banyaLicenseSerialSaveError', error: 'Invalid Banya License Serial' });
                        notificationService.showErrorMessage('Invalid Banya License Serial provided.');
                    }
                    break;
                case 'verifyBanyaLicense': // Banya 라이선스 검증 케이스 추가
                    const banyaLicenseSerialToVerify = data.banyaLicenseSerial;
                    if (banyaLicenseSerialToVerify && typeof banyaLicenseSerialToVerify === 'string') {
                        try {
                            const verificationResult = await licenseService.verifyLicense(banyaLicenseSerialToVerify);
                            if (verificationResult.success) {
                                await storageService.saveIsLicenseVerified(true);
                                safePostMessage(panel, { command: 'banyaLicenseVerified', success: true, message: verificationResult.message });
                                notificationService.showInfoMessage(`AIDEV-IDE: License verified successfully. ${verificationResult.message}`);
                            } else {
                                await storageService.saveIsLicenseVerified(false);
                                safePostMessage(panel, { command: 'banyaLicenseVerified', success: false, message: verificationResult.message });
                                notificationService.showErrorMessage(`AIDEV-IDE: License verification failed. ${verificationResult.message}`);
                            }
                        } catch (error: any) {
                            await storageService.saveIsLicenseVerified(false);
                            safePostMessage(panel, { command: 'banyaLicenseVerified', success: false, message: error.message });
                            notificationService.showErrorMessage(`AIDEV-IDE: License verification error. ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'banyaLicenseVerified', success: false, message: 'Invalid license serial provided.' });
                        notificationService.showErrorMessage('Invalid license serial provided.');
                    }
                    break;
                case 'deleteBanyaLicense': // Banya 라이선스 삭제 케이스 추가
                    try {
                        await storageService.deleteBanyaLicenseSerial();
                        await storageService.saveIsLicenseVerified(false);
                        safePostMessage(panel, { command: 'banyaLicenseDeleted' });
                        notificationService.showInfoMessage('AIDEV-IDE: Banya License Serial deleted.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'banyaLicenseDeleteError', error: error.message });
                        notificationService.showErrorMessage(`Error deleting Banya License Serial: ${error.message}`);
                    }
                    break;
                case 'saveProjectRootPath': // 프로젝트 루트 경로 저장 케이스 추가
                    const projectRootPathToSave = data.projectRootPath;
                    if (projectRootPathToSave && typeof projectRootPathToSave === 'string') {
                        try {
                            await storageService.saveProjectRootPath(projectRootPathToSave);
                            safePostMessage(panel, { command: 'projectRootPathSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Project Root Path saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'projectRootPathSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Project Root Path: ${error.message}`);
                        }
                                } else {
                        safePostMessage(panel, { command: 'projectRootPathSaveError', error: 'Invalid Project Root Path' });
                        notificationService.showErrorMessage('Invalid Project Root Path provided.');
                    }
                    break;
                case 'clearProjectRootPath': // 프로젝트 루트 경로 삭제 케이스 추가
                    try {
                        await storageService.clearProjectRootPath();
                        safePostMessage(panel, { command: 'projectRootPathCleared' });
                        notificationService.showInfoMessage('AIDEV-IDE: Project Root Path cleared.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'projectRootPathClearError', error: error.message });
                        notificationService.showErrorMessage(`Error clearing Project Root Path: ${error.message}`);
                    }
                    break;
                case 'setAutoUpdate': // 자동 업데이트 설정 저장 케이스 (별칭)
                case 'saveAutoUpdateEnabled': // 자동 업데이트 설정 저장 케이스 추가
                    const autoUpdateEnabledToSave = data.autoUpdateEnabled;
                    if (typeof autoUpdateEnabledToSave === 'boolean') {
                        try {
                            await storageService.saveAutoUpdateEnabled(autoUpdateEnabledToSave);
                            safePostMessage(panel, { command: 'autoUpdateEnabledSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Auto Update setting saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'autoUpdateEnabledSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Auto Update setting: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'autoUpdateEnabledSaveError', error: 'Invalid Auto Update setting' });
                        notificationService.showErrorMessage('Invalid Auto Update setting provided.');
                    }
                    break;
                case 'setOutputLog': // 출력 로그 설정 저장 케이스 (별칭)
                case 'saveOutputLogEnabled': // 출력 로그 설정 저장 케이스 추가
                    const outputLogEnabledToSave = data.outputLogEnabled;
                    if (typeof outputLogEnabledToSave === 'boolean') {
                    try {
                            await storageService.saveOutputLogEnabled(outputLogEnabledToSave);
                            safePostMessage(panel, { command: 'outputLogEnabledSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Output Log setting saved.');
                    } catch (error: any) {
                            safePostMessage(panel, { command: 'outputLogEnabledSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Output Log setting: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'outputLogEnabledSaveError', error: 'Invalid Output Log setting' });
                        notificationService.showErrorMessage('Invalid Output Log setting provided.');
                    }
                    break;
                case 'saveErrorRetryCount': // 오류 재시도 횟수 저장 케이스 추가
                    const errorRetryCountToSave = data.errorRetryCount;
                    if (typeof errorRetryCountToSave === 'number' && errorRetryCountToSave >= 0 && errorRetryCountToSave <= 10) {
                        try {
                            await storageService.saveErrorRetryCount(errorRetryCountToSave);
                            safePostMessage(panel, { command: 'errorRetryCountSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Error Retry Count setting saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'errorRetryCountSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Error Retry Count setting: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'errorRetryCountSaveError', error: 'Invalid Error Retry Count setting' });
                        notificationService.showErrorMessage('Invalid Error Retry Count setting provided.');
                    }
                    break;
                case 'saveAutoCorrectionEnabled': // 자동 오류 수정 설정 저장 케이스 추가
                    const autoCorrectionEnabledToSave = data.autoCorrectionEnabled;
                    if (typeof autoCorrectionEnabledToSave === 'boolean') {
                        try {
                            await storageService.saveAutoCorrectionEnabled(autoCorrectionEnabledToSave);
                            safePostMessage(panel, { command: 'autoCorrectionEnabledSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Auto Correction setting saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'autoCorrectionEnabledSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Auto Correction setting: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'autoCorrectionEnabledSaveError', error: 'Invalid Auto Correction setting' });
                        notificationService.showErrorMessage('Invalid Auto Correction setting provided.');
                    }
                    break;
                case 'setAutoCorrectionEnabled': // 자동 오류 수정 설정 저장 케이스 추가 (토글에서 직접 호출)
                    const autoCorrectionEnabledToSet = data.enabled;
                    if (typeof autoCorrectionEnabledToSet === 'boolean') {
                        try {
                            await storageService.saveAutoCorrectionEnabled(autoCorrectionEnabledToSet);
                            safePostMessage(panel, { command: 'autoCorrectionEnabledSet' });
                            // 토글에서는 알림을 표시하지 않음 (사용자 경험을 위해)
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'autoCorrectionEnabledSetError', error: error.message });
                            notificationService.showErrorMessage(`Error setting Auto Correction: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'autoCorrectionEnabledSetError', error: 'Invalid Auto Correction setting' });
                        notificationService.showErrorMessage('Invalid Auto Correction setting provided.');
                    }
                    break;
                case 'saveAiModel': // AI 모델 저장 케이스 추가
                    const aiModelToSave = data.aiModel || data.model;
                    if (aiModelToSave && typeof aiModelToSave === 'string') {
                        try {
                            await storageService.saveAiModel(aiModelToSave);
                            safePostMessage(panel, { command: 'aiModelSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: AI Model saved.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'aiModelSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving AI Model: ${error.message}`);
                        }
                            } else {
                        safePostMessage(panel, { command: 'aiModelSaveError', error: 'Invalid AI Model' });
                        notificationService.showErrorMessage('Invalid AI Model provided.');
                    }
                    break;
                case 'saveLanguage': // 언어 설정 저장 케이스 추가
                    const languageToSave = data.language;
                    if (languageToSave && typeof languageToSave === 'string') {
                        try {
                            // 언어 설정은 VS Code의 기본 설정을 사용하므로 별도 저장 로직은 필요 없음
                            // 단순히 성공 메시지만 전송
                            safePostMessage(panel, { command: 'languageSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Language setting updated.');
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'languageSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving language setting: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'languageSaveError', error: 'Invalid language setting' });
                        notificationService.showErrorMessage('Invalid language setting provided.');
                    }
                    break;
                case 'testOllamaConnection': // Ollama 연결 테스트 케이스 추가
                    try {
                        const apiUrl = (await storageService.getOllamaApiUrl()) || 'http://localhost:11434';
                        const url = new URL('/api/tags', apiUrl);

                        const response = await new Promise<any>((resolve, reject) => {
                            const isHttps = url.protocol === 'https:';
                            const client = isHttps ? https : http;
                            const req = client.request({
                                hostname: url.hostname,
                                port: url.port || (isHttps ? 443 : 80),
                                path: url.pathname + url.search,
                                method: 'GET',
                                headers: { 'Content-Type': 'application/json' }
                            }, (res) => {
                                let data = '';
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => {
                                    try {
                                        const parsed = JSON.parse(data);
                                        resolve(parsed);
                                    } catch (e) { reject(e); }
                                });
                            });
                            req.on('error', reject);
                            req.end();
                        });

                        safePostMessage(panel, { command: 'ollamaConnectionTestResult', success: true, data: response });
                        notificationService.showInfoMessage('AIDEV-IDE: Ollama connection test successful.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'ollamaConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Ollama connection test failed: ${error.message}`);
                    }
                    break;
                case 'testGeminiConnection': // Gemini 연결 테스트 케이스 추가
                    try {
                        const apiKey = await storageService.getApiKey();
                        if (!apiKey) {
                            safePostMessage(panel, { command: 'geminiConnectionTestResult', success: false, error: 'No API key found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No Gemini API key found.');
                            return;
                        }

                        const testResult = await geminiApi.testConnection();
                        if (testResult.success) {
                            safePostMessage(panel, { command: 'geminiConnectionTestResult', success: true, data: testResult.data });
                            notificationService.showInfoMessage('AIDEV-IDE: Gemini connection test successful.');
                        } else {
                            safePostMessage(panel, { command: 'geminiConnectionTestResult', success: false, error: testResult.error });
                            notificationService.showErrorMessage(`AIDEV-IDE: Gemini connection test failed: ${testResult.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'geminiConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Gemini connection test failed: ${error.message}`);
                    }
                    break;
                case 'testWeatherApiConnection': // 기상청 API 연결 테스트 케이스 추가
                    try {
                        const apiKey = await storageService.getWeatherApiKey();
                        if (!apiKey) {
                            safePostMessage(panel, { command: 'weatherApiConnectionTestResult', success: false, error: 'No Weather API key found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No Weather API key found.');
                            return;
                        }

                        const testResult = await new Promise<any>((resolve, reject) => {
                            const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${apiKey}&numOfRows=10&pageNo=1&base_date=20240101&base_time=0600&nx=55&ny=127&dataType=JSON`;
                            const req = https.request(url, { method: 'GET' }, (res) => {
                                let data = '';
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => {
                                    try {
                                        const parsed = JSON.parse(data);
                                        resolve({ success: true, data: parsed });
                                    } catch (e) { reject(e); }
                                });
                            });
                            req.on('error', reject);
                            req.end();
                        });

                        safePostMessage(panel, { command: 'weatherApiConnectionTestResult', success: true, data: testResult });
                        notificationService.showInfoMessage('AIDEV-IDE: Weather API connection test successful.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'weatherApiConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Weather API connection test failed: ${error.message}`);
                    }
                    break;
                case 'testNewsApiConnection': // 뉴스 API 연결 테스트 케이스 추가
                    try {
                        const apiKey = await storageService.getNewsApiKey();
                        if (!apiKey) {
                            safePostMessage(panel, { command: 'newsApiConnectionTestResult', success: false, error: 'No News API key found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No News API key found.');
                            return;
                        }

                        const testResult = await new Promise<any>((resolve, reject) => {
                            const url = `https://newsapi.org/v2/top-headlines?country=kr&apiKey=${apiKey}`;
                            const req = https.request(url, { method: 'GET' }, (res) => {
                                let data = '';
                                res.on('data', chunk => data += chunk);
                                res.on('end', () => {
                                    try {
                                        const parsed = JSON.parse(data);
                                        resolve({ success: true, data: parsed });
                                    } catch (e) { reject(e); }
                                });
                            });
                            req.on('error', reject);
                            req.end();
                        });

                        safePostMessage(panel, { command: 'newsApiConnectionTestResult', success: true, data: testResult });
                        notificationService.showInfoMessage('AIDEV-IDE: News API connection test successful.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'newsApiConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: News API connection test failed: ${error.message}`);
                    }
                    break;
                case 'testBanyaLicenseConnection': // Banya 라이선스 연결 테스트 케이스 추가
                    try {
                        const licenseSerial = await storageService.getBanyaLicenseSerial();
                        if (!licenseSerial) {
                            safePostMessage(panel, { command: 'banyaLicenseConnectionTestResult', success: false, error: 'No Banya License Serial found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No Banya License Serial found.');
                            return;
                        }

                        const testResult = await licenseService.verifyLicense(licenseSerial);
                        if (testResult.success) {
                            safePostMessage(panel, { command: 'banyaLicenseConnectionTestResult', success: true, data: testResult });
                            notificationService.showInfoMessage('AIDEV-IDE: Banya License connection test successful.');
                        } else {
                            safePostMessage(panel, { command: 'banyaLicenseConnectionTestResult', success: false, error: testResult.message });
                            notificationService.showErrorMessage(`AIDEV-IDE: Banya License connection test failed: ${testResult.message}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'banyaLicenseConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Banya License connection test failed: ${error.message}`);
                    }
                    break;
                case 'testOllamaBlockerConnection': // Ollama Blocker 연결 테스트 케이스 추가
                    try {
                        if (!ollamaBlockerService) {
                            safePostMessage(panel, { command: 'ollamaBlockerConnectionTestResult', success: false, error: 'Ollama Blocker service not available' });
                            notificationService.showErrorMessage('AIDEV-IDE: Ollama Blocker service not available.');
                            return;
                        }

                        const testResult = await ollamaBlockerService.testConnection();
                        if (testResult.success) {
                            safePostMessage(panel, { command: 'ollamaBlockerConnectionTestResult', success: true, data: testResult.data });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama Blocker connection test successful.');
                        } else {
                            safePostMessage(panel, { command: 'ollamaBlockerConnectionTestResult', success: false, error: testResult.error });
                            notificationService.showErrorMessage(`AIDEV-IDE: Ollama Blocker connection test failed: ${testResult.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'ollamaBlockerConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Ollama Blocker connection test failed: ${error.message}`);
                    }
                    break;
                case 'testTerminalDaemonConnection': // Terminal Daemon 연결 테스트 케이스 추가
                    try {
                        const terminalDaemonService = TerminalDaemonService.getInstance(context);
                        const testResult = await terminalDaemonService.testConnection();
                        if (testResult.success) {
                            safePostMessage(panel, { command: 'terminalDaemonConnectionTestResult', success: true, data: testResult.data });
                            notificationService.showInfoMessage('AIDEV-IDE: Terminal Daemon connection test successful.');
                        } else {
                            safePostMessage(panel, { command: 'terminalDaemonConnectionTestResult', success: false, error: testResult.error });
                            notificationService.showErrorMessage(`AIDEV-IDE: Terminal Daemon connection test failed: ${testResult.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'terminalDaemonConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Terminal Daemon connection test failed: ${error.message}`);
                    }
                    break;
                case 'testAllConnections': // 모든 연결 테스트 케이스 추가
                    try {
                        const results = {
                            gemini: false,
                            ollama: false,
                            weather: false,
                            news: false,
                            banyaLicense: false,
                            ollamaBlocker: false,
                            terminalDaemon: false
                        };

                        // Gemini 연결 테스트
                        try {
                            const apiKey = await storageService.getApiKey();
                            if (apiKey) {
                                const geminiTest = await geminiApi.testConnection();
                                results.gemini = geminiTest.success;
                            }
                        } catch (e) { /* 무시 */ }

                        // Ollama 연결 테스트
                        try {
                            const apiUrl = (await storageService.getOllamaApiUrl()) || 'http://localhost:11434';
                            const url = new URL('/api/tags', apiUrl);
                            const isHttps = url.protocol === 'https:';
                            const client = isHttps ? https : http;
                            await new Promise<void>((resolve, reject) => {
                                const req = client.request({
                                    hostname: url.hostname,
                                    port: url.port || (isHttps ? 443 : 80),
                                    path: url.pathname + url.search,
                                    method: 'GET',
                                    headers: { 'Content-Type': 'application/json' }
                                }, (res) => {
                                    let data = '';
                                    res.on('data', chunk => data += chunk);
                                    res.on('end', () => {
                                        try {
                                            JSON.parse(data);
                                            resolve();
                                        } catch (e) { reject(e); }
                                    });
                                });
                                req.on('error', reject);
                                req.end();
                            });
                            results.ollama = true;
                        } catch (e) { /* 무시 */ }

                        // 기상청 API 연결 테스트
                        try {
                            const apiKey = await storageService.getWeatherApiKey();
                            if (apiKey) {
                                const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${apiKey}&numOfRows=10&pageNo=1&base_date=20240101&base_time=0600&nx=55&ny=127&dataType=JSON`;
                                await new Promise<void>((resolve, reject) => {
                                    const req = https.request(url, { method: 'GET' }, (res) => {
                                        let data = '';
                                        res.on('data', chunk => data += chunk);
                                        res.on('end', () => {
                                            try {
                                                JSON.parse(data);
                                                resolve();
                                            } catch (e) { reject(e); }
                                        });
                                    });
                                    req.on('error', reject);
                                    req.end();
                                });
                                results.weather = true;
                            }
                        } catch (e) { /* 무시 */ }

                        // 뉴스 API 연결 테스트
                        try {
                            const apiKey = await storageService.getNewsApiKey();
                            if (apiKey) {
                                const url = `https://newsapi.org/v2/top-headlines?country=kr&apiKey=${apiKey}`;
                                await new Promise<void>((resolve, reject) => {
                                    const req = https.request(url, { method: 'GET' }, (res) => {
                                        let data = '';
                                        res.on('data', chunk => data += chunk);
                                        res.on('end', () => {
                                            try {
                                                JSON.parse(data);
                                                resolve();
                                            } catch (e) { reject(e); }
                                        });
                                    });
                                    req.on('error', reject);
                                    req.end();
                                });
                                results.news = true;
                            }
                        } catch (e) { /* 무시 */ }

                        // Banya 라이선스 연결 테스트
                        try {
                            const licenseSerial = await storageService.getBanyaLicenseSerial();
                            if (licenseSerial) {
                                const licenseTest = await licenseService.verifyLicense(licenseSerial);
                                results.banyaLicense = licenseTest.success;
                            }
                        } catch (e) { /* 무시 */ }

                        // Ollama Blocker 연결 테스트
                        try {
                            if (ollamaBlockerService) {
                                const blockerTest = await ollamaBlockerService.testConnection();
                                results.ollamaBlocker = blockerTest.success;
                            }
                        } catch (e) { /* 무시 */ }

                        // Terminal Daemon 연결 테스트
                        try {
                            const terminalDaemonService = TerminalDaemonService.getInstance(context);
                            const daemonTest = await terminalDaemonService.testConnection();
                            results.terminalDaemon = daemonTest.success;
                        } catch (e) { /* 무시 */ }

                        safePostMessage(panel, { command: 'allConnectionsTestResult', results });
                        notificationService.showInfoMessage('AIDEV-IDE: All connections test completed.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'allConnectionsTestResult', error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: All connections test failed: ${error.message}`);
                    }
                    break;
                case 'initializePanel': {
                    // 패널이 열릴 때 현재 설정들을 로드하여 웹뷰에 전송
                    try {
                        const apiKey = await storageService.getApiKey();
                        const ollamaApiUrl = await storageService.getOllamaApiUrl();
                        const ollamaEndpoint = await storageService.getOllamaEndpoint();
                        const ollamaModel = await storageService.getOllamaModel();
                        const ollamaServerType = await storageService.getOllamaServerType();
                        const remoteOllamaApiUrl = await storageService.getRemoteOllamaApiUrl();
                        const remoteOllamaEndpoint = await storageService.getRemoteOllamaEndpoint();
                        const remoteOllamaModel = await storageService.getRemoteOllamaModel();
                        const autoCorrectionEnabled = await storageService.getAutoCorrectionEnabled();
                        const outputLogEnabled = await storageService.getOutputLogEnabled();
                        const errorRetryCount = await storageService.getErrorRetryCount();
                        const projectRootPath = await storageService.getProjectRootPath();
                        const weatherApiKey = await storageService.getWeatherApiKey();
                        const newsApiKey = await storageService.getNewsApiKey();
                        const banyaLicenseSerial = await storageService.getBanyaLicenseSerial();
                        const isLicenseVerified = await storageService.getIsLicenseVerified();
                        const aiModel = await storageService.getAiModel();

                        const messageToSend = {
                            command: 'currentSettings',
                            apiKey: apiKey || '',
                            ollamaApiUrl: ollamaApiUrl || 'http://localhost:11434',
                            ollamaEndpoint: ollamaEndpoint || '/api/generate',
                            ollamaModel: ollamaModel || 'gemma3:27b',
                            ollamaServerType: ollamaServerType || 'local',
                            localOllamaApiUrl: ollamaApiUrl || 'http://localhost:11434',
                            localOllamaEndpoint: ollamaEndpoint || '/api/generate',
                            remoteOllamaApiUrl: remoteOllamaApiUrl || '',
                            remoteOllamaEndpoint: remoteOllamaEndpoint || '/api/generate',
                            remoteOllamaModel: remoteOllamaModel || '',
                            autoCorrectionEnabled: autoCorrectionEnabled || false,
                            outputLogEnabled: outputLogEnabled || false,
                            errorRetryCount: errorRetryCount || 3,
                            projectRootPath: projectRootPath || '',
                            weatherApiKey: weatherApiKey || '',
                            newsApiKey: newsApiKey || '',
                            banyaLicenseSerial: banyaLicenseSerial || '',
                            isLicenseVerified: isLicenseVerified, // 라이선스 검증 상태 추가
                            aiModel: aiModel || 'gemini' // AI 모델 정보 추가
                        };
                        // console.log('Sending currentApiKeys message:', messageToSend);
                        safePostMessage(panel, messageToSend);
                        } catch (error: any) {
                        console.error('Error getting current settings:', error);
                        safePostMessage(panel, { command: 'currentSettings', error: error.message });
                    }
                    break;
                }
                case 'initSettings': // 설정 초기화 (별칭)
                case 'loadSettings': // 설정 로드
                    try {
                        // initializePanel 케이스와 동일한 로직 사용
                        const apiKey = await storageService.getApiKey();
                        const ollamaApiUrl = await storageService.getOllamaApiUrl();
                        const ollamaEndpoint = await storageService.getOllamaEndpoint();
                        const ollamaModel = await storageService.getOllamaModel();
                        const ollamaServerType = await storageService.getOllamaServerType();
                        const remoteOllamaApiUrl = await storageService.getRemoteOllamaApiUrl();
                        const remoteOllamaEndpoint = await storageService.getRemoteOllamaEndpoint();
                        const remoteOllamaModel = await storageService.getRemoteOllamaModel();
                        const autoCorrectionEnabled = await storageService.getAutoCorrectionEnabled();
                        const outputLogEnabled = await storageService.getOutputLogEnabled();
                        const errorRetryCount = await storageService.getErrorRetryCount();
                        const projectRootPath = await storageService.getProjectRootPath();
                        const weatherApiKey = await storageService.getWeatherApiKey();
                        const newsApiKey = await storageService.getNewsApiKey();
                        const banyaLicenseSerial = await storageService.getBanyaLicenseSerial();
                        const isLicenseVerified = await storageService.getIsLicenseVerified();
                        const aiModel = await storageService.getAiModel();

                        const messageToSend = {
                            command: 'currentSettings',
                            apiKey: apiKey || '',
                            ollamaApiUrl: ollamaApiUrl || 'http://localhost:11434',
                            ollamaEndpoint: ollamaEndpoint || '/api/generate',
                            ollamaModel: ollamaModel || 'gemma3:27b',
                            ollamaServerType: ollamaServerType || 'local',
                            localOllamaApiUrl: ollamaApiUrl || 'http://localhost:11434',
                            localOllamaEndpoint: ollamaEndpoint || '/api/generate',
                            remoteOllamaApiUrl: remoteOllamaApiUrl || '',
                            remoteOllamaEndpoint: remoteOllamaEndpoint || '/api/generate',
                            remoteOllamaModel: remoteOllamaModel || '',
                            autoCorrectionEnabled: autoCorrectionEnabled || false,
                            outputLogEnabled: outputLogEnabled || false,
                            errorRetryCount: errorRetryCount || 3,
                            projectRootPath: projectRootPath || '',
                            weatherApiKey: weatherApiKey || '',
                            newsApiKey: newsApiKey || '',
                            banyaLicenseSerial: banyaLicenseSerial || '',
                            isLicenseVerified: isLicenseVerified,
                            aiModel: aiModel || 'gemini'
                        };
                        safePostMessage(panel, messageToSend);
                    } catch (error: any) {
                        console.error('Error loading settings:', error);
                        safePostMessage(panel, { command: 'settingsLoadError', error: error.message });
                    }
                    break;
                case 'loadApiKeys': // API 키 로드
                        try {
                        const geminiApiKey = await storageService.getApiKey();
                        safePostMessage(panel, { command: 'apiKeysLoaded', geminiApiKey });
                        } catch (error: any) {
                        console.error('Error loading API keys:', error);
                        safePostMessage(panel, { command: 'apiKeysLoadError', error: error.message });
                    }
                    break;
                case 'loadAiModel': // AI 모델 로드
                        try {
                        const aiModel = await storageService.getAiModel();
                        safePostMessage(panel, { command: 'aiModelLoaded', aiModel });
                        } catch (error: any) {
                        console.error('Error loading AI model:', error);
                        safePostMessage(panel, { command: 'aiModelLoadError', error: error.message });
                    }
                    break;
                case 'loadOllamaModel': // Ollama 모델 로드
                        try {
                        const ollamaModel = await storageService.getOllamaModel();
                        safePostMessage(panel, { command: 'ollamaModelLoaded', ollamaModel });
                        } catch (error: any) {
                        console.error('Error loading Ollama model:', error);
                        safePostMessage(panel, { command: 'ollamaModelLoadError', error: error.message });
                    }
                    break;
                case 'getLanguage': // 언어 설정 로드
                        try {
                        const language = vscode.env.language;
                        safePostMessage(panel, { command: 'languageLoaded', language });
                        } catch (error: any) {
                        console.error('Error getting language:', error);
                        safePostMessage(panel, { command: 'languageLoadError', error: error.message });
                    }
                    break;
                case 'getLanguageData': // 언어 데이터 로드
                    try {
                        const language = vscode.env.language;
                        const languageData = await loadLanguageData(language);
                        safePostMessage(panel, { command: 'languageDataLoaded', languageData });
                        } catch (error: any) {
                        console.error('Error loading language data:', error);
                        safePostMessage(panel, { command: 'languageDataLoadError', error: error.message });
                    }
                    break;
                default:
                    console.log('Unknown command:', data.command);
            }
        }
    );

    // webview를 전역 배열에 등록
    allWebviews.push(panel.webview);

    // 패널이 dispose될 때 배열에서 제거
    panel.onDidDispose(() => {
        try {
            const idx = allWebviews.indexOf(panel.webview);
            if (idx !== -1) {
                allWebviews.splice(idx, 1);
            }
        } catch (error) {
            // Panel이 이미 dispose된 경우 무시 (콘솔 스팸 방지를 위해 주석 처리)
            // console.log('[PanelManager] Panel already disposed, ignoring error:', error);
        }
    }, undefined, context.subscriptions);

    return panel;
}

/**
 * Ollama 모델을 다운로드하고 진행 상황을 표시합니다.
 */
async function downloadOllamaModel(
    modelName: string,
    panel: vscode.WebviewPanel,
    storageService: StorageService,
    notificationService: NotificationService
): Promise<void> {
    try {
        const apiUrl = (await storageService.getOllamaApiUrl()) || 'http://localhost:11434';
        const url = new URL('/api/pull', apiUrl);

        // VS Code 상태 바에 진행 상황 표시
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        statusBarItem.text = `$(download) Ollama 모델 다운로드: ${modelName}`;
        statusBarItem.show();

        // 다운로드 시작 메시지
        safePostMessage(panel, {
            command: 'modelDownloadStarted',
            modelName: modelName
        });

        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const requestData = JSON.stringify({ name: modelName });

        const response = await new Promise<any>((resolve, reject) => {
            const req = client.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestData)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                    try {
                        // 스트리밍 응답에서 진행 상황 파싱
                        const lines = data.split('\n');
                        for (const line of lines) {
                            if (line.trim()) {
                                try {
                                    const parsed = JSON.parse(line);
                                    if (parsed.status) {
                                        const progress = parsed.completed && parsed.total
                                            ? Math.round((parsed.completed / parsed.total) * 100)
                                            : 0;

                                        statusBarItem.text = `$(download) ${modelName}: ${progress}%`;

                                        // 웹뷰에 진행 상황 전송
                            safePostMessage(panel, {
                                            command: 'modelDownloadProgress',
                                            modelName: modelName,
                                            progress: progress,
                                            status: parsed.status
                                        });
                                    }
                                } catch (e) {
                                    // JSON 파싱 실패는 무시
                                }
                            }
                        }
                    } catch (e) {
                        // 진행 상황 파싱 실패는 무시
                    }
                });
                res.on('end', () => {
                    resolve({ success: true });
                });
                res.on('error', reject);
            });

            req.on('error', reject);
            req.write(requestData);
            req.end();
        });

        // 다운로드 완료
        statusBarItem.text = `$(check) ${modelName} 다운로드 완료`;
        setTimeout(() => statusBarItem.dispose(), 3000);

        safePostMessage(panel, {
            command: 'modelDownloadCompleted',
            modelName: modelName
        });

        // 모델 목록 새로고침
        safePostMessage(panel, { command: 'refreshOllamaModels' });

        notificationService.showInfoMessage(`Ollama 모델 '${modelName}' 다운로드가 완료되었습니다.`);

                    } catch (error: any) {
        console.error('[PanelManager] Failed to download Ollama model:', error);

                            safePostMessage(panel, {
            command: 'modelDownloadError',
            modelName: modelName,
            error: error.message
        });

        notificationService.showErrorMessage(`Ollama 모델 '${modelName}' 다운로드 실패: ${error.message}`);
    }
}

/**
 * 지원되는 Ollama 모델 목록을 로드합니다.
 */
async function loadSupportedModels(): Promise<any[]> {
    try {
        const fs = require('fs');
        const path = require('path');

        // console.log('[PanelManager] Starting to load supported models...');
        // console.log('[PanelManager] Current working directory:', process.cwd());
        // console.log('[PanelManager] __dirname:', __dirname);

        // VS Code 확장의 루트 디렉토리에서 파일 찾기
        let modelFilePath: string;

        // 먼저 aidev-ide 프로젝트 디렉토리에서 찾기
        const currentDir = process.cwd();
        let projectRootPath: string;

        // aidev-ide 디렉토리가 현재 경로에 포함되어 있는지 확인
        if (currentDir.includes('aidev-ide')) {
            projectRootPath = path.join(currentDir, 'supported_ollama_model.json');
        } else {
            // aidev-ide 디렉토리를 찾아서 경로 구성
            projectRootPath = path.join(currentDir, 'aidev-ide', 'supported_ollama_model.json');
        }

        // console.log('[PanelManager] Checking project root path:', projectRootPath);
        // console.log('[PanelManager] Project root exists:', fs.existsSync(projectRootPath));

        if (fs.existsSync(projectRootPath)) {
            modelFilePath = projectRootPath;
            // console.log('[PanelManager] Using project root path');
        } else {
            // __dirname 기준으로 찾기 (컴파일된 파일 기준)
            modelFilePath = path.join(__dirname, '..', '..', 'supported_ollama_model.json');
            // console.log('[PanelManager] Using __dirname path:', modelFilePath);
        }

        // console.log('[PanelManager] Final model file path:', modelFilePath);
        // console.log('[PanelManager] File exists:', fs.existsSync(modelFilePath));

        // 파일 존재 확인
        if (!fs.existsSync(modelFilePath)) {
            // 추가 경로들 시도
            const alternativePaths = [
                path.join(process.cwd(), 'supported_ollama_model.json'),
                path.join(process.cwd(), 'aidev-ide', 'supported_ollama_model.json'),
                path.join(__dirname, 'supported_ollama_model.json'),
                path.join(__dirname, '..', 'supported_ollama_model.json'),
                path.join(__dirname, '..', '..', 'supported_ollama_model.json'),
                path.join(__dirname, '..', '..', '..', 'supported_ollama_model.json'),
                '/Users/tony/Projects/aidev-ide/supported_ollama_model.json' // 절대 경로
            ];

            // console.log('[PanelManager] Trying alternative paths...');
            for (const altPath of alternativePaths) {
                // console.log('[PanelManager] Checking:', altPath, 'exists:', fs.existsSync(altPath));
                if (fs.existsSync(altPath)) {
                    modelFilePath = altPath;
                    // console.log('[PanelManager] Found file at:', altPath);
                    break;
                }
            }

            if (!fs.existsSync(modelFilePath)) {
                throw new Error(`Model file not found. Tried paths: ${alternativePaths.join(', ')}`);
            }
        }

        // 파일 읽기
        // console.log('[PanelManager] Reading file:', modelFilePath);
        const fileContent = fs.readFileSync(modelFilePath, 'utf8');
        // console.log('[PanelManager] File content length:', fileContent.length);

        const modelData = JSON.parse(fileContent);
        // console.log('[PanelManager] Parsed model data:', modelData);
        // console.log('[PanelManager] Models count:', modelData.models?.length || 0);

        return modelData.models || [];
    } catch (error: any) {
        console.error('[PanelManager] Failed to load supported models file:', error);
        console.error('[PanelManager] Error details:', error.message);
        console.error('[PanelManager] Error stack:', error.stack);
        throw error;
    }
}

// 언어 데이터 로드 함수
async function loadLanguageData(language: string): Promise<any> {
    try {
        const fs = require('fs');
        const path = require('path');

        // 언어 파일 경로 구성
        const languageFilePath = path.join(__dirname, '..', '..', 'webview', 'locales', `lang_${language}.json`);

        if (fs.existsSync(languageFilePath)) {
            const fileContent = fs.readFileSync(languageFilePath, 'utf8');
            return JSON.parse(fileContent);
        } else {
            // 기본 언어 파일 (영어) 사용
            const defaultLanguageFilePath = path.join(__dirname, '..', '..', 'webview', 'locales', 'lang_en.json');
            if (fs.existsSync(defaultLanguageFilePath)) {
                const fileContent = fs.readFileSync(defaultLanguageFilePath, 'utf8');
                return JSON.parse(fileContent);
            } else {
                return {};
            }
        }
    } catch (error: any) {
        console.error('[PanelManager] Failed to load language data:', error);
        return {};
    }
}