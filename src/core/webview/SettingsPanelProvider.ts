import * as vscode from 'vscode';
import { StateManager } from '../state/StateManager';
import { GeminiApi, NotificationService, LicenseService, OllamaBlockerService, AiModelType, ExternalApiService } from '../../services';
import { SettingsManager } from '../state/SettingsManager';
import { createAndSetupWebviewPanel } from '../../utils';
import { TerminalManager } from '../terminal/TerminalManager';
import { TaskManager } from '../task/TaskManager';
import { ModelConnectionService } from '../model/ModelConnectionService';
import { SupportedModelService, LocaleService } from '../../webview/services';

// 전역 webview 배열 - 모든 활성 webview를 추적
const allWebviews: vscode.Webview[] = [];

/**
 * 웹뷰에 안전하게 메시지를 전송하는 헬퍼 함수
 */
function safePostMessage(panel: vscode.WebviewPanel, message: any): void {
    try {
        if (panel && !panel.webview) {
            // console.log('[PanelManager] Panel webview is not available, skipping message');
            return;
        }
        panel.webview.postMessage(message);
    } catch (error) {
        // console.log('[PanelManager] Failed to post message to webview:', error);
    }
}

/**
 * AIDEV-IDE 설정 패널을 엽니다.
 */
export function openSettingsPanel(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    viewColumn: vscode.ViewColumn,
    configurationService: SettingsManager,
    notificationService: NotificationService,
    geminiApi: GeminiApi, // GeminiApi 추가
    licenseService: LicenseService, // LicenseService 추가
    ollamaApi?: any, // OllamaApi 추가
    llmService?: any, // LlmService 추가
    ollamaBlockerService?: OllamaBlockerService, // OllamaBlockerService 추가
    terminalMonitorService?: any // TerminalMonitorService 추가
) {
    const settingsManager = SettingsManager.getInstance(context);
    const panel = createAndSetupWebviewPanel(extensionUri, context, 'settings', 'AIDEV-IDE Settings', 'settings', viewColumn,
        async (data, panel: vscode.WebviewPanel) => {
            // console.log('Settings panel received message:', data.command, data);
            const stateManager = StateManager.getInstance(context); // 모든 case에서 사용
            switch (data.command) {
                case 'getCurrentSettings': {
                    try {
                        // 현재 설정들을 가져와서 웹뷰에 전송
                        const apiKey = await stateManager.getApiKey();
                        const ollamaApiUrl = await stateManager.getOllamaApiUrl();
                        const ollamaEndpoint = await stateManager.getOllamaEndpoint();
                        const ollamaModel = await stateManager.getOllamaModel();
                        // console.log('[PanelManager] Loaded ollamaModel:', ollamaModel);
                        const ollamaServerType = await stateManager.getOllamaServerType();
                        const remoteOllamaApiUrl = await stateManager.getRemoteOllamaApiUrl();
                        const remoteOllamaEndpoint = await stateManager.getRemoteOllamaEndpoint();
                        const remoteOllamaModel = await stateManager.getRemoteOllamaModel();
                        const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
                        const outputLogEnabled = await stateManager.getOutputLogEnabled();
                        const errorRetryCount = await stateManager.getErrorRetryCount();
                        const weatherApiKey = await stateManager.getWeatherApiKey();
                        const newsApiKey = await stateManager.getNewsApiKey();
                        const banyaLicenseSerial = await stateManager.getBanyaLicenseSerial();
                        const isLicenseVerified = await stateManager.getIsLicenseVerified();
                        const aiModel = await stateManager.getAiModel();
                        const currentAiModel = await stateManager.getCurrentAiModel();
                        // currentAiModel이 있으면 우선 사용, 없으면 aiModel 사용
                        const modelToUse = currentAiModel || aiModel || 'gemini';
                        const planningModelValue = await stateManager.getPlanningModel();
                        const language = await stateManager.getLanguage();
                        const autoUpdateEnabled = await settingsManager.isAutoUpdateEnabled();
                        const autoExecuteCommandsEnabled = await settingsManager.isAutoExecuteCommandsEnabled();

                        // duplicate removed
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
                            autoUpdateEnabled: autoUpdateEnabled || false,
                            errorRetryCount: errorRetryCount || 3,
                            weatherApiKey: weatherApiKey || '',
                            newsApiKey: newsApiKey || '',
                            banyaLicenseSerial: banyaLicenseSerial || '',
                            isLicenseVerified: isLicenseVerified, // 라이선스 검증 상태 추가
                            aiModel: modelToUse, // AI 모델 정보 추가
                            planningModel: planningModelValue || '',
                            language: language || 'ko', // 언어 설정 추가
                            autoExecuteCommandsEnabled: autoExecuteCommandsEnabled // 명령어 자동 실행 설정 추가
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
                        const apiUrl = (await stateManager.getOllamaApiUrl()) || 'http://localhost:11434';
                        const models = await ModelConnectionService.getOllamaModels(apiUrl);

                        // console.log('[PanelManager] Successfully retrieved Ollama models:', models);
                        const reasoningCandidates = models.filter(name => {
                            const n = (name || '').toLowerCase();
                            return (
                                n.includes('deepseek') ||
                                n.includes('reason') ||
                                n.includes('qwen') ||
                                n.includes('llama') ||
                                n.includes('gemma') ||
                                n.includes('r1')
                            );
                        });
                        const planningModel = await stateManager.getPlanningModel();
                        safePostMessage(panel, { command: 'ollamaModels', models, reasoningModels: reasoningCandidates, planningModel: planningModel || '', apiUrl: apiUrl });
                    } catch (e: any) {
                        console.error('[PanelManager] Failed to get Ollama models:', e?.message || String(e));
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
                        await downloadOllamaModel(modelName, panel, context, notificationService);
                    } catch (error: any) {
                        console.error('[PanelManager] Failed to download Ollama model:', error);
                        safePostMessage(panel, { command: 'modelDownloadError', error: error.message });
                    }
                    break;
                }
                case 'getSupportedModels': {
                    try {
                        const supportedModels = SupportedModelService.loadSupportedModels();
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
                        const apiUrl = (await stateManager.getOllamaApiUrl()) || 'http://localhost:11434';
                        const models = await ModelConnectionService.getOllamaModels(apiUrl);

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
                            await stateManager.saveApiKey(apiKeyToSave);
                            const initialized = geminiApi.updateApiKey(apiKeyToSave);
                            if (initialized) {
                                safePostMessage(panel, { command: 'apiKeySaved' });
                                notificationService.showInfoMessage('AIDEV-IDE: Gemini API Key saved and initialized successfully.');
                            } else {
                                safePostMessage(panel, { command: 'apiKeySaveError', error: 'API key saved but initialization failed. Please check your API key.' });
                                notificationService.showWarningMessage('AIDEV-IDE: API key saved but initialization failed. Please verify your API key is correct.');
                            }
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
                            await stateManager.saveOllamaApiUrl(ollamaApiUrlToSave);
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
                            await stateManager.saveOllamaEndpoint(ollamaEndpointToSave);
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
                    const localOllamaApiUrlToSave = data.localOllamaApiUrl || data.apiUrl;
                    if (localOllamaApiUrlToSave && typeof localOllamaApiUrlToSave === 'string') {
                        try {
                            await stateManager.saveOllamaApiUrl(localOllamaApiUrlToSave);
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
                    const localOllamaEndpointToSave = data.localOllamaEndpoint || data.endpoint;
                    if (localOllamaEndpointToSave && typeof localOllamaEndpointToSave === 'string') {
                        try {
                            await stateManager.saveOllamaEndpoint(localOllamaEndpointToSave);
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
                            await stateManager.saveOllamaModel(ollamaModelToSave);
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
                            await stateManager.saveOllamaServerType(ollamaServerTypeToSave);
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
                            await stateManager.saveRemoteOllamaApiUrl(remoteOllamaApiUrlToSave);
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
                            await stateManager.saveRemoteOllamaEndpoint(remoteOllamaEndpointToSave);
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
                            await stateManager.saveRemoteOllamaModel(remoteOllamaModelToSave);
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
                            await stateManager.saveWeatherApiKey(weatherApiKeyToSave);
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
                            await stateManager.saveNewsApiKey(newsApiKeyToSave);
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
                            await stateManager.saveBanyaLicenseSerial(banyaLicenseSerialToSave);
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
                    const banyaLicenseSerialToVerify = (data.banyaLicenseSerial ?? data.licenseSerial);
                    if (banyaLicenseSerialToVerify && typeof banyaLicenseSerialToVerify === 'string') {
                        try {
                            const verificationResult = await licenseService.verifyLicense(banyaLicenseSerialToVerify);
                            if (verificationResult.success) {
                                await stateManager.saveIsLicenseVerified(true);
                                // 검증 성공 시 시리얼을 저장하여 CODE/ASK 탭에서 즉시 인식되도록 함
                                await stateManager.saveBanyaLicenseSerial(banyaLicenseSerialToVerify);
                                safePostMessage(panel, { command: 'banyaLicenseVerified', success: true, message: verificationResult.message });
                                notificationService.showInfoMessage(`AIDEV-IDE: License verified successfully. ${verificationResult.message}`);
                            } else {
                                await stateManager.saveIsLicenseVerified(false);
                                safePostMessage(panel, { command: 'banyaLicenseVerified', success: false, message: verificationResult.message });
                                notificationService.showErrorMessage(`AIDEV-IDE: License verification failed. ${verificationResult.message}`);
                            }
                        } catch (error: any) {
                            await stateManager.saveIsLicenseVerified(false);
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
                        await stateManager.deleteBanyaLicenseSerial();
                        await stateManager.saveIsLicenseVerified(false);
                        safePostMessage(panel, { command: 'banyaLicenseDeleted' });
                        notificationService.showInfoMessage('AIDEV-IDE: Banya License Serial deleted.');
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'banyaLicenseDeleteError', error: error.message });
                        notificationService.showErrorMessage(`Error deleting Banya License Serial: ${error.message}`);
                    }
                    break;
                case 'setAutoUpdate': // 자동 업데이트 설정 저장 케이스 (별칭)
                case 'saveAutoUpdateEnabled': // 자동 업데이트 설정 저장 케이스 추가
                    const autoUpdateEnabledToSave = data.autoUpdateEnabled;
                    if (typeof autoUpdateEnabledToSave === 'boolean') {
                        try {
                            // 설정 저장을 ConfigurationService로 일원화
                            await settingsManager.updateAutoUpdateEnabled(autoUpdateEnabledToSave);
                            // 과거 저장값과의 호환(필요 시 유지)
                            try { await stateManager.saveAutoUpdateEnabled(autoUpdateEnabledToSave); } catch { }
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
                            await stateManager.saveOutputLogEnabled(outputLogEnabledToSave);
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
                            await stateManager.saveErrorRetryCount(errorRetryCountToSave);
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
                            // StorageService에 저장 (설정 패널에서 사용하는 소스)
                            await stateManager.saveAutoCorrectionEnabled(autoCorrectionEnabledToSave);
                            // ConfigurationService에도 동기화 (다른 곳에서 읽을 수 있도록)
                            await settingsManager.updateAutoCorrectionEnabled(autoCorrectionEnabledToSave);
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
                            await stateManager.saveAutoCorrectionEnabled(autoCorrectionEnabledToSet);
                            await settingsManager.updateAutoCorrectionEnabled(autoCorrectionEnabledToSet);
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
                case 'setAutoExecuteCommandsEnabled': // 명령어 자동 실행 설정 저장 케이스 추가
                    const autoExecuteCommandsEnabledToSet = data.enabled;
                    if (typeof autoExecuteCommandsEnabledToSet === 'boolean') {
                        try {
                            await settingsManager.updateAutoExecuteCommandsEnabled(autoExecuteCommandsEnabledToSet);
                            safePostMessage(panel, { command: 'autoExecuteCommandsEnabledSet' });
                            console.log(`[PanelManager] Auto Execute Commands 설정 저장됨: ${autoExecuteCommandsEnabledToSet}`);
                        } catch (error: any) {
                            safePostMessage(panel, { command: 'autoExecuteCommandsEnabledSetError', error: error.message });
                            notificationService.showErrorMessage(`Error setting Auto Execute Commands: ${error.message}`);
                        }
                    } else {
                        safePostMessage(panel, { command: 'autoExecuteCommandsEnabledSetError', error: 'Invalid Auto Execute Commands setting' });
                        notificationService.showErrorMessage('Invalid Auto Execute Commands setting provided.');
                    }
                    break;
                case 'saveAiModel': // AI 모델 저장 케이스 추가
                    const aiModelToSave = data.aiModel || data.model;
                    if (aiModelToSave && typeof aiModelToSave === 'string') {
                        try {
                            // UI 표시에 쓰는 키와 런타임에서 사용하는 키를 모두 저장
                            await stateManager.saveAiModel(aiModelToSave);
                            // 'ollama' 일반 문자열이 들어오면 구체 타입으로 매핑하여 런타임 저장
                            let toRuntime = aiModelToSave;
                            if (aiModelToSave.toLowerCase() === 'ollama') {
                                try {
                                    const storedOllamaModel = await stateManager.getOllamaModel();
                                    const lowerModel = (storedOllamaModel || '').toLowerCase();
                                    if (lowerModel === 'deepseek-r1:70b' || lowerModel.includes('deepseek')) toRuntime = 'ollama-deepseek';
                                    else if (lowerModel.startsWith('codellama')) toRuntime = 'ollama-codellama';
                                    else if (lowerModel === 'gpt-oss:120b-cloud' || lowerModel === 'gpt-oss-120b:cloud' || lowerModel.startsWith('qwen') || lowerModel.includes('gpt-oss')) toRuntime = 'ollama-gpt-oss';
                                    else toRuntime = 'ollama-gemma';
                                } catch { toRuntime = 'ollama-gemma'; }
                            }
                            await stateManager.saveCurrentAiModel(toRuntime);

                            // 저장된 값 점검 로그
                            try {
                                const storedUi = await stateManager.getAiModel();
                                const storedRuntime = await stateManager.getCurrentAiModel();
                                // ModelManager에서 직접 가져오기
                                const { ModelManager } = await import('../model/ModelManager');
                                const modelManager = ModelManager.getInstance(context);
                                const currentModel = modelManager?.getCurrentModel();
                                console.log(`[PanelManager] AI model saved. ui='${storedUi}', runtime='${storedRuntime}', llmId='${currentModel?.id}'`);
                            } catch (e) {
                                console.warn('[PanelManager] Failed to read-back AI model after save:', e);
                            }
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
                    // console.log('[PanelManager] Saving language:', languageToSave);
                    if (languageToSave && typeof languageToSave === 'string') {
                        try {
                            await stateManager.saveLanguage(languageToSave);
                            // console.log('[PanelManager] Language saved successfully:', languageToSave);
                            safePostMessage(panel, { command: 'languageSaved', language: languageToSave });
                            notificationService.showInfoMessage('AIDEV-IDE: Language setting updated.');
                        } catch (error: any) {
                            console.error('[PanelManager] Failed to save language:', error);
                            safePostMessage(panel, { command: 'languageSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving language setting: ${error.message}`);
                        }
                    } else {
                        console.error('[PanelManager] Invalid language setting provided:', languageToSave);
                        safePostMessage(panel, { command: 'languageSaveError', error: 'Invalid language setting' });
                        notificationService.showErrorMessage('Invalid language setting provided.');
                    }
                    break;
                case 'testOllamaConnection': // Ollama 연결 테스트 케이스 추가
                    try {
                        const apiUrl = (await stateManager.getOllamaApiUrl()) || 'http://localhost:11434';
                        const result = await ModelConnectionService.testOllamaConnection(apiUrl);
                        safePostMessage(panel, { command: 'ollamaConnectionTestResult', success: result.success, data: result.data, error: result.error });
                        if (result.success) {
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama connection test successful.');
                        } else {
                            notificationService.showErrorMessage(`AIDEV-IDE: Ollama connection test failed: ${result.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'ollamaConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Ollama connection test failed: ${error.message}`);
                    }
                    break;
                case 'testGeminiConnection': // Gemini 연결 테스트 케이스 추가
                    try {
                        const apiKey = await stateManager.getApiKey();
                        if (!apiKey) {
                            safePostMessage(panel, { command: 'geminiConnectionTestResult', success: false, error: 'No API key found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No Gemini API key found.');
                            return;
                        }

                        const testResult = await ModelConnectionService.testGeminiConnection(apiKey, geminiApi);
                        safePostMessage(panel, { command: 'geminiConnectionTestResult', success: testResult.success, data: testResult.data, error: testResult.error });
                        if (testResult.success) {
                            notificationService.showInfoMessage('AIDEV-IDE: Gemini connection test successful.');
                        } else {
                            notificationService.showErrorMessage(`AIDEV-IDE: Gemini connection test failed: ${testResult.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'geminiConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Gemini connection test failed: ${error.message}`);
                    }
                    break;
                case 'testWeatherApiConnection': // 기상청 API 연결 테스트 케이스 추가
                    try {
                        const apiKey = await stateManager.getWeatherApiKey();
                        if (!apiKey) {
                            safePostMessage(panel, { command: 'weatherApiConnectionTestResult', success: false, error: 'No Weather API key found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No Weather API key found.');
                            return;
                        }

                        const testResult = await ExternalApiService.testWeatherApiConnection(apiKey);
                        safePostMessage(panel, { command: 'weatherApiConnectionTestResult', success: testResult.success, data: testResult.data, error: testResult.error });
                        if (testResult.success) {
                            notificationService.showInfoMessage('AIDEV-IDE: Weather API connection test successful.');
                        } else {
                            notificationService.showErrorMessage(`AIDEV-IDE: Weather API connection test failed: ${testResult.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'weatherApiConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: Weather API connection test failed: ${error.message}`);
                    }
                    break;
                case 'testNewsApiConnection': // 뉴스 API 연결 테스트 케이스 추가
                    try {
                        const apiKey = await stateManager.getNewsApiKey();
                        if (!apiKey) {
                            safePostMessage(panel, { command: 'newsApiConnectionTestResult', success: false, error: 'No News API key found' });
                            notificationService.showErrorMessage('AIDEV-IDE: No News API key found.');
                            return;
                        }

                        const testResult = await ExternalApiService.testNewsApiConnection(apiKey);
                        safePostMessage(panel, { command: 'newsApiConnectionTestResult', success: testResult.success, data: testResult.data, error: testResult.error });
                        if (testResult.success) {
                            notificationService.showInfoMessage('AIDEV-IDE: News API connection test successful.');
                        } else {
                            notificationService.showErrorMessage(`AIDEV-IDE: News API connection test failed: ${testResult.error}`);
                        }
                    } catch (error: any) {
                        safePostMessage(panel, { command: 'newsApiConnectionTestResult', success: false, error: error.message });
                        notificationService.showErrorMessage(`AIDEV-IDE: News API connection test failed: ${error.message}`);
                    }
                    break;
                case 'testBanyaLicenseConnection': // Banya 라이선스 연결 테스트 케이스 추가
                    try {
                        const licenseSerial = await stateManager.getBanyaLicenseSerial();
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
                        // 🆕 core TerminalManager 사용
                        const terminalManager = TerminalManager.getInstance(context);
                        const testResult = await terminalManager.testDaemonConnection();
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
                            const apiKey = await stateManager.getApiKey();
                            if (apiKey) {
                                const geminiTest = await ModelConnectionService.testGeminiConnection(apiKey, geminiApi);
                                results.gemini = geminiTest.success;
                            }
                        } catch (e) { /* 무시 */ }

                        // Ollama 연결 테스트
                        try {
                            const apiUrl = (await stateManager.getOllamaApiUrl()) || 'http://localhost:11434';
                            const ollamaTest = await ModelConnectionService.testOllamaConnection(apiUrl);
                            results.ollama = ollamaTest.success;
                        } catch (e) { /* 무시 */ }

                        // 기상청 API 연결 테스트
                        try {
                            const apiKey = await stateManager.getWeatherApiKey();
                            if (apiKey) {
                                const weatherTest = await ExternalApiService.testWeatherApiConnection(apiKey);
                                results.weather = weatherTest.success;
                            }
                        } catch (e) { /* 무시 */ }

                        // 뉴스 API 연결 테스트
                        try {
                            const apiKey = await stateManager.getNewsApiKey();
                            if (apiKey) {
                                const newsTest = await ExternalApiService.testNewsApiConnection(apiKey);
                                results.news = newsTest.success;
                            }
                        } catch (e) { /* 무시 */ }

                        // Banya 라이선스 연결 테스트
                        try {
                            const licenseSerial = await stateManager.getBanyaLicenseSerial();
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
                            // 🆕 core TerminalManager 사용
                            const terminalManager = TerminalManager.getInstance(context);
                            const daemonTest = await terminalManager.testDaemonConnection();
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
                        const apiKey = await stateManager.getApiKey();
                        const ollamaApiUrl = await stateManager.getOllamaApiUrl();
                        const ollamaEndpoint = await stateManager.getOllamaEndpoint();
                        const ollamaModel = await stateManager.getOllamaModel();
                        const ollamaServerType = await stateManager.getOllamaServerType();
                        const remoteOllamaApiUrl = await stateManager.getRemoteOllamaApiUrl();
                        const remoteOllamaEndpoint = await stateManager.getRemoteOllamaEndpoint();
                        const remoteOllamaModel = await stateManager.getRemoteOllamaModel();
                        const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
                        const outputLogEnabled = await stateManager.getOutputLogEnabled();
                        const errorRetryCount = await stateManager.getErrorRetryCount();
                        const weatherApiKey = await stateManager.getWeatherApiKey();
                        const newsApiKey = await stateManager.getNewsApiKey();
                        const banyaLicenseSerial = await stateManager.getBanyaLicenseSerial();
                        const isLicenseVerified = await stateManager.getIsLicenseVerified();
                        const aiModel = await stateManager.getAiModel();

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
                        const apiKey = await stateManager.getApiKey();
                        const ollamaApiUrl = await stateManager.getOllamaApiUrl();
                        const ollamaEndpoint = await stateManager.getOllamaEndpoint();
                        const ollamaModel = await stateManager.getOllamaModel();
                        const ollamaServerType = await stateManager.getOllamaServerType();
                        const remoteOllamaApiUrl = await stateManager.getRemoteOllamaApiUrl();
                        const remoteOllamaEndpoint = await stateManager.getRemoteOllamaEndpoint();
                        const remoteOllamaModel = await stateManager.getRemoteOllamaModel();
                        const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
                        const outputLogEnabled = await stateManager.getOutputLogEnabled();
                        const errorRetryCount = await stateManager.getErrorRetryCount();
                        const weatherApiKey = await stateManager.getWeatherApiKey();
                        const newsApiKey = await stateManager.getNewsApiKey();
                        const banyaLicenseSerial = await stateManager.getBanyaLicenseSerial();
                        const isLicenseVerified = await stateManager.getIsLicenseVerified();
                        const aiModel = await stateManager.getAiModel();
                        const currentAiModel = await stateManager.getCurrentAiModel();
                        // currentAiModel이 있으면 우선 사용, 없으면 aiModel 사용
                        const modelToUse = currentAiModel || aiModel || 'gemini';

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
                            weatherApiKey: weatherApiKey || '',
                            newsApiKey: newsApiKey || '',
                            banyaLicenseSerial: banyaLicenseSerial || '',
                            isLicenseVerified: isLicenseVerified,
                            aiModel: modelToUse
                        };
                        // console.log('[PanelManager] Sending currentSettings message:', messageToSend);
                        // console.log('[PanelManager] Message ollamaModel value:', messageToSend.ollamaModel);
                        safePostMessage(panel, messageToSend);
                    } catch (error: any) {
                        console.error('Error loading settings:', error);
                        safePostMessage(panel, { command: 'settingsLoadError', error: error.message });
                    }
                    break;
                case 'loadApiKeys': // API 키 로드
                    try {
                        const geminiApiKey = await stateManager.getApiKey();
                        safePostMessage(panel, { command: 'apiKeysLoaded', geminiApiKey });
                    } catch (error: any) {
                        console.error('Error loading API keys:', error);
                        safePostMessage(panel, { command: 'apiKeysLoadError', error: error.message });
                    }
                    break;
                case 'loadAiModel': // AI 모델 로드
                    try {
                        const aiModel = await stateManager.getAiModel();
                        const currentAiModel = await stateManager.getCurrentAiModel();
                        // currentAiModel이 있으면 우선 사용, 없으면 aiModel 사용
                        const modelToSend = currentAiModel || aiModel;
                        safePostMessage(panel, { command: 'currentAiModel', model: modelToSend });
                    } catch (error: any) {
                        console.error('Error loading AI model:', error);
                        safePostMessage(panel, { command: 'aiModelLoadError', error: error.message });
                    }
                    break;
                case 'loadOllamaModel': // Ollama 모델 로드
                    try {
                        const ollamaModel = await stateManager.getOllamaModel();
                        safePostMessage(panel, { command: 'ollamaModelLoaded', ollamaModel });
                    } catch (error: any) {
                        console.error('Error loading Ollama model:', error);
                        safePostMessage(panel, { command: 'ollamaModelLoadError', error: error.message });
                    }
                    break;
                case 'getLanguage': // 언어 설정 로드
                    try {
                        const language = await stateManager.getLanguage();
                        // console.log('[PanelManager] Loaded language from storage:', language);
                        safePostMessage(panel, { command: 'currentLanguage', language });
                        // console.log('[PanelManager] Sent currentLanguage message with language:', language);
                    } catch (error: any) {
                        console.error('Error getting language:', error);
                        safePostMessage(panel, { command: 'languageLoadError', error: error.message });
                    }
                    break;
                case 'getLanguageData': // 언어 데이터 로드
                    try {
                        const language = data.language || vscode.env.language;
                        const languageData = LocaleService.loadLanguageData(language);
                        safePostMessage(panel, { command: 'languageDataReceived', language, data: languageData });
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
 * Plan Queue 패널을 엽니다.
 */
export function openPlanPanel(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
) {
    // 🆕 core TaskManager 사용
    const taskManager = TaskManager.getInstance(context);
    const panel = createAndSetupWebviewPanel(extensionUri, context, 'plan', 'AIDEV-IDE Plan Queue', 'plan', vscode.ViewColumn.Two,
        async (data, panel: vscode.WebviewPanel) => {
            switch (data.command) {
                case 'planQueueLoad': {
                    try {
                        const items = taskManager.listPlanItems();
                        safePostMessage(panel, { command: 'planQueueData', items });
                    } catch (e: any) {
                        safePostMessage(panel, { command: 'planQueueError', error: e?.message || String(e) });
                    }
                    break;
                }
                case 'planQueueRun': {
                    try {
                        const id = String(data.id || '');
                        if (!id) throw new Error('Invalid id');
                        taskManager.updatePlanItemStatus(id, 'in_progress');
                        const items = taskManager.listPlanItems();
                        safePostMessage(panel, { command: 'planQueueData', items });
                    } catch (e: any) {
                        safePostMessage(panel, { command: 'planQueueError', error: e?.message || String(e) });
                    }
                    break;
                }
                case 'planQueueComplete': {
                    try {
                        const id = String(data.id || '');
                        if (!id) throw new Error('Invalid id');
                        taskManager.updatePlanItemStatus(id, 'done');
                        const items = taskManager.listPlanItems();
                        safePostMessage(panel, { command: 'planQueueData', items });
                    } catch (e: any) {
                        safePostMessage(panel, { command: 'planQueueError', error: e?.message || String(e) });
                    }
                    break;
                }
                case 'planQueueCancel': {
                    try {
                        const id = String(data.id || '');
                        if (!id) throw new Error('Invalid id');
                        taskManager.updatePlanItemStatus(id, 'skipped');
                        const items = taskManager.listPlanItems();
                        safePostMessage(panel, { command: 'planQueueData', items });
                    } catch (e: any) {
                        safePostMessage(panel, { command: 'planQueueError', error: e?.message || String(e) });
                    }
                    break;
                }
                case 'planQueueClear': {
                    taskManager.clearPlanQueue();
                    const items = taskManager.listPlanItems();
                    safePostMessage(panel, { command: 'planQueueData', items });
                    break;
                }
                default:
                    // console.log('[PlanPanel] Unknown command:', data.command);
                    break;
            }
        }
    );

    // 초기 로드
    safePostMessage(panel, { command: 'planQueueData', items: taskManager.listPlanItems() });

    return panel;
}

/**
 * Ollama 모델을 다운로드하고 진행 상황을 표시합니다.
 */
async function downloadOllamaModel(
    modelName: string,
    panel: vscode.WebviewPanel,
    extensionContext: vscode.ExtensionContext,
    notificationService: NotificationService
): Promise<void> {
    try {
        const stateManager = StateManager.getInstance(extensionContext);
        const apiUrl = (await stateManager.getOllamaApiUrl()) || 'http://localhost:11434';

        // VS Code 상태 바에 진행 상황 표시
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        statusBarItem.text = `$(download) Ollama 모델 다운로드: ${modelName}`;
        statusBarItem.show();

        // 다운로드 시작 메시지
        safePostMessage(panel, {
            command: 'modelDownloadStarted',
            modelName: modelName
        });

        // core ModelConnectionService로 다운로드 수행 (진행 상황 콜백 사용)
        await ModelConnectionService.downloadOllamaModel(
            modelName,
            apiUrl,
            (progress, status) => {
                statusBarItem.text = `$(download) ${modelName}: ${progress}%`;
                safePostMessage(panel, {
                    command: 'modelDownloadProgress',
                    modelName: modelName,
                    progress,
                    status
                });
            }
        );

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
// (삭제됨) loadSupportedModels → SupportedModelService.loadSupportedModels 사용

// 언어 데이터 로드 함수
// (삭제됨) loadLanguageData → LocaleService.loadLanguageData 사용