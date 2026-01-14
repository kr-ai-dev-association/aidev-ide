"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.openSettingsPanel = openSettingsPanel;
exports.openPlanPanel = openPlanPanel;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const StateManager_1 = require("../managers/state/StateManager");
const SettingsManager_1 = require("../managers/state/SettingsManager");
const utils_1 = require("../../utils");
const TerminalManager_1 = require("../managers/terminal/TerminalManager");
const TaskManager_1 = require("../managers/task/TaskManager");
const ModelConnectionService_1 = require("../managers/model/ModelConnectionService");
const services_1 = require("../../webview/services");
// 전역 webview 배열 - 모든 활성 webview를 추적
const allWebviews = [];
/**
 * 웹뷰에 안전하게 메시지를 전송하는 헬퍼 함수
 */
function safePostMessage(panel, message) {
    try {
        if (panel && !panel.webview) {
            // console.log('[PanelManager] Panel webview is not available, skipping message');
            return;
        }
        panel.webview.postMessage(message);
    }
    catch (error) {
        // console.log('[PanelManager] Failed to post message to webview:', error);
    }
}
/**
 * CODEPILOT 설정 패널을 엽니다.
 */
function openSettingsPanel(extensionUri, context, viewColumn, configurationService, notificationService, geminiApi, // GeminiApi 추가
licenseService, // LicenseService 추가
ollamaApi, // OllamaApi 추가
llmService, // LlmService 추가
ollamaBlockerService, // OllamaBlockerService 추가
terminalMonitorService) {
    const settingsManager = SettingsManager_1.SettingsManager.getInstance(context);
    const panel = (0, utils_1.createAndSetupWebviewPanel)(extensionUri, context, "settings", "CODEPILOT Settings", "settings", viewColumn, async (data, panel) => {
        // console.log('Settings panel received message:', data.command, data);
        const stateManager = StateManager_1.StateManager.getInstance(context); // 모든 case에서 사용
        switch (data.command) {
            case "getCurrentSettings": {
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
                    const autoTestRetryEnabled = await settingsManager.isAutoTestRetryEnabled();
                    const testRetryCount = await settingsManager.getTestRetryCount();
                    const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
                    const outputLogEnabled = await stateManager.getOutputLogEnabled();
                    const errorRetryCount = await stateManager.getErrorRetryCount();
                    const banyaLicenseSerial = await stateManager.getBanyaLicenseSerial();
                    const isLicenseVerified = await stateManager.getIsLicenseVerified();
                    const aiModel = await stateManager.getAiModel();
                    const geminiModel = await stateManager.getGeminiModel();
                    const currentAiModel = await stateManager.getCurrentAiModel();
                    // currentAiModel이 있으면 우선 사용, 없으면 aiModel 사용
                    const modelToUse = currentAiModel || aiModel || "ollama";
                    const language = await stateManager.getLanguage();
                    const autoUpdateEnabled = await settingsManager.isAutoUpdateEnabled();
                    const autoExecuteCommandsEnabled = await settingsManager.isAutoExecuteCommandsEnabled();
                    // duplicate removed
                    const messageToSend = {
                        command: "currentSettings",
                        apiKey: apiKey || "",
                        geminiModel: geminiModel || "gemini-3-pro-preview",
                        ollamaApiUrl: ollamaApiUrl || "http://localhost:11434",
                        ollamaEndpoint: ollamaEndpoint || "/api/generate",
                        ollamaModel: ollamaModel || "gemma3:27b",
                        ollamaServerType: ollamaServerType || "local",
                        localOllamaApiUrl: ollamaApiUrl || "http://localhost:11434",
                        localOllamaEndpoint: ollamaEndpoint || "/api/generate",
                        remoteOllamaApiUrl: remoteOllamaApiUrl || "",
                        remoteOllamaEndpoint: remoteOllamaEndpoint || "/api/generate",
                        remoteOllamaModel: remoteOllamaModel || "",
                        autoTestRetryEnabled: autoTestRetryEnabled || false,
                        testRetryCount: testRetryCount || 2,
                        autoCorrectionEnabled: autoCorrectionEnabled || false,
                        outputLogEnabled: outputLogEnabled || false,
                        autoUpdateEnabled: autoUpdateEnabled || false,
                        errorRetryCount: errorRetryCount || 2,
                        banyaLicenseSerial: banyaLicenseSerial || "",
                        isLicenseVerified: isLicenseVerified, // 라이선스 검증 상태 추가
                        aiModel: modelToUse, // AI 모델 정보 추가
                        language: language || "ko", // 언어 설정 추가
                        autoExecuteCommandsEnabled: autoExecuteCommandsEnabled, // 명령어 자동 실행 설정 추가
                    };
                    // console.log('Sending currentApiKeys message:', messageToSend);
                    safePostMessage(panel, messageToSend);
                }
                catch (error) {
                    console.error("Error getting current settings:", error);
                    safePostMessage(panel, {
                        command: "currentSettings",
                        error: error.message,
                    });
                }
                break;
            }
            case "getOllamaModels": {
                try {
                    const apiUrl = (await stateManager.getOllamaApiUrl()) ||
                        "http://localhost:11434";
                    const models = await ModelConnectionService_1.ModelConnectionService.getOllamaModels(apiUrl);
                    // console.log('[PanelManager] Successfully retrieved Ollama models:', models);
                    safePostMessage(panel, {
                        command: "ollamaModels",
                        models,
                        apiUrl: apiUrl,
                    });
                }
                catch (e) {
                    console.error("[PanelManager] Failed to get Ollama models:", e?.message || String(e));
                    safePostMessage(panel, {
                        command: "ollamaModels",
                        models: [],
                        error: e?.message || String(e),
                    });
                }
                break;
            }
            case "refreshOllamaModels": {
                // Ollama 모델 목록 새로고침
                try {
                    const apiUrl = (await stateManager.getOllamaApiUrl()) ||
                        "http://localhost:11434";
                    const models = await ModelConnectionService_1.ModelConnectionService.getOllamaModels(apiUrl);
                    safePostMessage(panel, {
                        command: "ollamaModels",
                        models,
                        apiUrl: apiUrl,
                    });
                }
                catch (e) {
                    safePostMessage(panel, {
                        command: "ollamaModels",
                        models: [],
                        error: e?.message || String(e),
                    });
                }
                break;
            }
            case "saveApiKey": // Gemini API 키 저장 케이스 추가
                const apiKeyToSave = data.apiKey;
                if (apiKeyToSave && typeof apiKeyToSave === "string") {
                    try {
                        await stateManager.saveApiKey(apiKeyToSave);
                        const initialized = geminiApi.updateApiKey(apiKeyToSave);
                        if (initialized) {
                            safePostMessage(panel, { command: "apiKeySaved" });
                            notificationService.showInfoMessage("CODEPILOT: Gemini API Key saved and initialized successfully.");
                        }
                        else {
                            safePostMessage(panel, {
                                command: "apiKeySaveError",
                                error: "API key saved but initialization failed. Please check your API key.",
                            });
                            notificationService.showWarningMessage("CODEPILOT: API key saved but initialization failed. Please verify your API key is correct.");
                        }
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "apiKeySaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Gemini API Key: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "apiKeySaveError",
                        error: "Invalid API key",
                    });
                    notificationService.showErrorMessage("Invalid API key provided.");
                }
                break;
            case "saveGeminiModel": // Gemini 모델 저장 케이스 추가
                const geminiModelToSave = data.model;
                if (geminiModelToSave && typeof geminiModelToSave === "string") {
                    try {
                        await stateManager.saveGeminiModel(geminiModelToSave);
                        // GeminiApi 인스턴스 업데이트
                        if (geminiApi) {
                            geminiApi.updateModelName(geminiModelToSave);
                        }
                        safePostMessage(panel, { command: "geminiModelSaved" });
                        notificationService.showInfoMessage(`CODEPILOT: Gemini Model saved as ${geminiModelToSave}.`);
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "geminiModelSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Gemini Model: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "geminiModelSaveError",
                        error: "Invalid Gemini Model",
                    });
                    notificationService.showErrorMessage("Invalid Gemini Model provided.");
                }
                break;
            case "saveOllamaApiUrl": // Ollama API URL 저장 케이스 추가
                const ollamaApiUrlToSave = data.ollamaApiUrl;
                if (ollamaApiUrlToSave && typeof ollamaApiUrlToSave === "string") {
                    try {
                        await stateManager.saveOllamaApiUrl(ollamaApiUrlToSave);
                        safePostMessage(panel, { command: "ollamaApiUrlSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Ollama API URL saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "ollamaApiUrlSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Ollama API URL: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "ollamaApiUrlSaveError",
                        error: "Invalid Ollama API URL",
                    });
                    notificationService.showErrorMessage("Invalid Ollama API URL provided.");
                }
                break;
            case "saveOllamaEndpoint": // Ollama 엔드포인트 저장 케이스 추가
                const ollamaEndpointToSave = data.ollamaEndpoint;
                if (ollamaEndpointToSave &&
                    typeof ollamaEndpointToSave === "string") {
                    try {
                        await stateManager.saveOllamaEndpoint(ollamaEndpointToSave);
                        safePostMessage(panel, { command: "ollamaEndpointSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Ollama Endpoint saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "ollamaEndpointSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Ollama Endpoint: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "ollamaEndpointSaveError",
                        error: "Invalid Ollama Endpoint",
                    });
                    notificationService.showErrorMessage("Invalid Ollama Endpoint provided.");
                }
                break;
            case "saveLocalOllamaApiUrl": // 로컬 Ollama API URL 저장 케이스 추가
                const localOllamaApiUrlToSave = data.localOllamaApiUrl || data.apiUrl;
                if (localOllamaApiUrlToSave &&
                    typeof localOllamaApiUrlToSave === "string") {
                    try {
                        await stateManager.saveOllamaApiUrl(localOllamaApiUrlToSave);
                        safePostMessage(panel, { command: "localOllamaApiUrlSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Local Ollama API URL saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "localOllamaApiUrlError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Local Ollama API URL: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "localOllamaApiUrlError",
                        error: "Invalid Local Ollama API URL",
                    });
                    notificationService.showErrorMessage("Invalid Local Ollama API URL provided.");
                }
                break;
            case "saveLocalOllamaEndpoint": // 로컬 Ollama 엔드포인트 저장 케이스 추가
                const localOllamaEndpointToSave = data.localOllamaEndpoint || data.endpoint;
                if (localOllamaEndpointToSave &&
                    typeof localOllamaEndpointToSave === "string") {
                    try {
                        await stateManager.saveOllamaEndpoint(localOllamaEndpointToSave);
                        safePostMessage(panel, { command: "localOllamaEndpointSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Local Ollama Endpoint saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "localOllamaEndpointError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Local Ollama Endpoint: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "localOllamaEndpointError",
                        error: "Invalid Local Ollama Endpoint",
                    });
                    notificationService.showErrorMessage("Invalid Local Ollama Endpoint provided.");
                }
                break;
            case "saveOllamaModel": // Ollama 모델 저장 케이스 추가
                const ollamaModelToSave = data.ollamaModel || data.model;
                if (ollamaModelToSave && typeof ollamaModelToSave === "string") {
                    try {
                        await stateManager.saveOllamaModel(ollamaModelToSave);
                        safePostMessage(panel, { command: "ollamaModelSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Ollama Model saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "ollamaModelSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Ollama Model: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "ollamaModelSaveError",
                        error: "Invalid Ollama Model",
                    });
                    notificationService.showErrorMessage("Invalid Ollama Model provided.");
                }
                break;
            case "saveOllamaServerType": // Ollama 서버 타입 저장 케이스 추가
                const ollamaServerTypeToSave = data.ollamaServerType;
                // console.log('[PanelManager] Saving Ollama server type:', ollamaServerTypeToSave);
                if (ollamaServerTypeToSave &&
                    typeof ollamaServerTypeToSave === "string") {
                    try {
                        await stateManager.saveOllamaServerType(ollamaServerTypeToSave);
                        safePostMessage(panel, { command: "ollamaServerTypeSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Ollama Server Type saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "ollamaServerTypeSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Ollama Server Type: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "ollamaServerTypeSaveError",
                        error: "Invalid Ollama Server Type",
                    });
                    notificationService.showErrorMessage("Invalid Ollama Server Type provided.");
                }
                break;
            case "saveRemoteOllamaApiUrl": // 원격 Ollama API URL 저장 케이스 추가
                const remoteOllamaApiUrlToSave = data.remoteOllamaApiUrl;
                if (remoteOllamaApiUrlToSave &&
                    typeof remoteOllamaApiUrlToSave === "string") {
                    try {
                        await stateManager.saveRemoteOllamaApiUrl(remoteOllamaApiUrlToSave);
                        safePostMessage(panel, { command: "remoteOllamaApiUrlSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Remote Ollama API URL saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "remoteOllamaApiUrlSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Remote Ollama API URL: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "remoteOllamaApiUrlSaveError",
                        error: "Invalid Remote Ollama API URL",
                    });
                    notificationService.showErrorMessage("Invalid Remote Ollama API URL provided.");
                }
                break;
            case "saveRemoteOllamaEndpoint": // 원격 Ollama 엔드포인트 저장 케이스 추가
                const remoteOllamaEndpointToSave = data.remoteOllamaEndpoint;
                if (remoteOllamaEndpointToSave &&
                    typeof remoteOllamaEndpointToSave === "string") {
                    try {
                        await stateManager.saveRemoteOllamaEndpoint(remoteOllamaEndpointToSave);
                        safePostMessage(panel, { command: "remoteOllamaEndpointSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Remote Ollama Endpoint saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "remoteOllamaEndpointSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Remote Ollama Endpoint: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "remoteOllamaEndpointSaveError",
                        error: "Invalid Remote Ollama Endpoint",
                    });
                    notificationService.showErrorMessage("Invalid Remote Ollama Endpoint provided.");
                }
                break;
            case "saveRemoteOllamaModel": // 원격 Ollama 모델 저장 케이스 추가
                const remoteOllamaModelToSave = data.remoteOllamaModel;
                if (remoteOllamaModelToSave &&
                    typeof remoteOllamaModelToSave === "string") {
                    try {
                        await stateManager.saveRemoteOllamaModel(remoteOllamaModelToSave);
                        safePostMessage(panel, { command: "remoteOllamaModelSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Remote Ollama Model saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "remoteOllamaModelSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Remote Ollama Model: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "remoteOllamaModelSaveError",
                        error: "Invalid Remote Ollama Model",
                    });
                    notificationService.showErrorMessage("Invalid Remote Ollama Model provided.");
                }
                break;
            case "saveBanyaLicenseSerial": // Banya 라이선스 시리얼 저장 케이스 추가
                const banyaLicenseSerialToSave = data.banyaLicenseSerial;
                if (banyaLicenseSerialToSave &&
                    typeof banyaLicenseSerialToSave === "string") {
                    try {
                        await stateManager.saveBanyaLicenseSerial(banyaLicenseSerialToSave);
                        safePostMessage(panel, { command: "banyaLicenseSerialSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Banya License Serial saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "banyaLicenseSerialSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Banya License Serial: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "banyaLicenseSerialSaveError",
                        error: "Invalid Banya License Serial",
                    });
                    notificationService.showErrorMessage("Invalid Banya License Serial provided.");
                }
                break;
            case "verifyBanyaLicense": // Banya 라이선스 검증 케이스 추가
                const banyaLicenseSerialToVerify = data.banyaLicenseSerial ?? data.licenseSerial;
                if (banyaLicenseSerialToVerify &&
                    typeof banyaLicenseSerialToVerify === "string") {
                    try {
                        const verificationResult = await licenseService.verifyLicense(banyaLicenseSerialToVerify);
                        if (verificationResult.success) {
                            await stateManager.saveIsLicenseVerified(true);
                            // 검증 성공 시 시리얼을 저장하여 CODE/ASK 탭에서 즉시 인식되도록 함
                            await stateManager.saveBanyaLicenseSerial(banyaLicenseSerialToVerify);
                            safePostMessage(panel, {
                                command: "banyaLicenseVerified",
                                success: true,
                                message: verificationResult.message,
                            });
                            notificationService.showInfoMessage(`CODEPILOT: License verified successfully. ${verificationResult.message}`);
                        }
                        else {
                            await stateManager.saveIsLicenseVerified(false);
                            safePostMessage(panel, {
                                command: "banyaLicenseVerified",
                                success: false,
                                message: verificationResult.message,
                            });
                            notificationService.showErrorMessage(`CODEPILOT: License verification failed. ${verificationResult.message}`);
                        }
                    }
                    catch (error) {
                        await stateManager.saveIsLicenseVerified(false);
                        safePostMessage(panel, {
                            command: "banyaLicenseVerified",
                            success: false,
                            message: error.message,
                        });
                        notificationService.showErrorMessage(`CODEPILOT: License verification error. ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "banyaLicenseVerified",
                        success: false,
                        message: "Invalid license serial provided.",
                    });
                    notificationService.showErrorMessage("Invalid license serial provided.");
                }
                break;
            case "deleteBanyaLicense": // Banya 라이선스 삭제 케이스 추가
                try {
                    await stateManager.deleteBanyaLicenseSerial();
                    await stateManager.saveIsLicenseVerified(false);
                    safePostMessage(panel, { command: "banyaLicenseDeleted" });
                    notificationService.showInfoMessage("CODEPILOT: Banya License Serial deleted.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "banyaLicenseDeleteError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error deleting Banya License Serial: ${error.message}`);
                }
                break;
            case "setAutoUpdate": // 자동 업데이트 설정 저장 케이스 (별칭)
            case "saveAutoUpdateEnabled": // 자동 업데이트 설정 저장 케이스 추가
                const autoUpdateEnabledToSave = data.autoUpdateEnabled;
                if (typeof autoUpdateEnabledToSave === "boolean") {
                    try {
                        // 설정 저장을 ConfigurationService로 일원화
                        await settingsManager.updateAutoUpdateEnabled(autoUpdateEnabledToSave);
                        // 과거 저장값과의 호환(필요 시 유지)
                        try {
                            await stateManager.saveAutoUpdateEnabled(autoUpdateEnabledToSave);
                        }
                        catch { }
                        safePostMessage(panel, { command: "autoUpdateEnabledSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Auto Update setting saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "autoUpdateEnabledSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Auto Update setting: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "autoUpdateEnabledSaveError",
                        error: "Invalid Auto Update setting",
                    });
                    notificationService.showErrorMessage("Invalid Auto Update setting provided.");
                }
                break;
            case "setOutputLog": // 출력 로그 설정 저장 케이스 (별칭)
            case "saveOutputLogEnabled": // 출력 로그 설정 저장 케이스 추가
                const outputLogEnabledToSave = data.outputLogEnabled;
                if (typeof outputLogEnabledToSave === "boolean") {
                    try {
                        await stateManager.saveOutputLogEnabled(outputLogEnabledToSave);
                        safePostMessage(panel, { command: "outputLogEnabledSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Output Log setting saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "outputLogEnabledSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Output Log setting: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "outputLogEnabledSaveError",
                        error: "Invalid Output Log setting",
                    });
                    notificationService.showErrorMessage("Invalid Output Log setting provided.");
                }
                break;
            case "saveErrorRetryCount": // 오류 재시도 횟수 저장 케이스 추가
                const errorRetryCountToSave = data.errorRetryCount;
                if (typeof errorRetryCountToSave === "number" &&
                    errorRetryCountToSave >= 0 &&
                    errorRetryCountToSave <= 10) {
                    try {
                        await stateManager.saveErrorRetryCount(errorRetryCountToSave);
                        safePostMessage(panel, { command: "errorRetryCountSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Error Retry Count setting saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "errorRetryCountSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Error Retry Count setting: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "errorRetryCountSaveError",
                        error: "Invalid Error Retry Count setting",
                    });
                    notificationService.showErrorMessage("Invalid Error Retry Count setting provided.");
                }
                break;
            case "saveAutoCorrectionEnabled": // 자동 오류 수정 설정 저장 케이스 추가
                const autoCorrectionEnabledToSave = data.autoCorrectionEnabled;
                if (typeof autoCorrectionEnabledToSave === "boolean") {
                    try {
                        // StorageService에 저장 (설정 패널에서 사용하는 소스)
                        await stateManager.saveAutoCorrectionEnabled(autoCorrectionEnabledToSave);
                        // ConfigurationService에도 동기화 (다른 곳에서 읽을 수 있도록)
                        await settingsManager.updateAutoCorrectionEnabled(autoCorrectionEnabledToSave);
                        safePostMessage(panel, { command: "autoCorrectionEnabledSaved" });
                        notificationService.showInfoMessage("CODEPILOT: Auto Correction setting saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "autoCorrectionEnabledSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving Auto Correction setting: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "autoCorrectionEnabledSaveError",
                        error: "Invalid Auto Correction setting",
                    });
                    notificationService.showErrorMessage("Invalid Auto Correction setting provided.");
                }
                break;
            case "setAutoCorrectionEnabled": // 자동 오류 수정 설정 저장 케이스 추가 (토글에서 직접 호출)
                const autoCorrectionEnabledToSet = data.enabled;
                if (typeof autoCorrectionEnabledToSet === "boolean") {
                    try {
                        await stateManager.saveAutoCorrectionEnabled(autoCorrectionEnabledToSet);
                        await settingsManager.updateAutoCorrectionEnabled(autoCorrectionEnabledToSet);
                        safePostMessage(panel, { command: "autoCorrectionEnabledSet" });
                        // 토글에서는 알림을 표시하지 않음 (사용자 경험을 위해)
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "autoCorrectionEnabledSetError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error setting Auto Correction: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "autoCorrectionEnabledSetError",
                        error: "Invalid Auto Correction setting",
                    });
                    notificationService.showErrorMessage("Invalid Auto Correction setting provided.");
                }
                break;
            case "setAutoTestRetryEnabled": // 자동 테스트 재시도 설정 저장 케이스 추가
                const autoTestRetryEnabledToSet = data.enabled;
                if (typeof autoTestRetryEnabledToSet === "boolean") {
                    try {
                        await settingsManager.updateAutoTestRetryEnabled(autoTestRetryEnabledToSet);
                        safePostMessage(panel, { command: "autoTestRetryEnabledSet" });
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "autoTestRetryEnabledSetError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error setting Auto Test Retry: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "autoTestRetryEnabledSetError",
                        error: "Invalid Auto Test Retry setting",
                    });
                    notificationService.showErrorMessage("Invalid Auto Test Retry setting provided.");
                }
                break;
            case "setTestRetryCount": // 자동 테스트 재시도 횟수 설정 저장
                const testRetryCountToSet = data.count;
                if (typeof testRetryCountToSet === "number" && testRetryCountToSet >= 1 && testRetryCountToSet <= 10) {
                    try {
                        await settingsManager.updateTestRetryCount(testRetryCountToSet);
                        safePostMessage(panel, { command: "testRetryCountSet" });
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "testRetryCountSetError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error setting Test Retry Count: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "testRetryCountSetError",
                        error: "Invalid Test Retry Count setting",
                    });
                    notificationService.showErrorMessage("Invalid Test Retry Count setting provided.");
                }
                break;
            case "setAutoExecuteCommandsEnabled": // 명령어 자동 실행 설정 저장 케이스 추가
                const autoExecuteCommandsEnabledToSet = data.enabled;
                if (typeof autoExecuteCommandsEnabledToSet === "boolean") {
                    try {
                        await settingsManager.updateAutoExecuteCommandsEnabled(autoExecuteCommandsEnabledToSet);
                        safePostMessage(panel, {
                            command: "autoExecuteCommandsEnabledSet",
                        });
                        console.log(`[PanelManager] Auto Execute Commands 설정 저장됨: ${autoExecuteCommandsEnabledToSet}`);
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "autoExecuteCommandsEnabledSetError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error setting Auto Execute Commands: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "autoExecuteCommandsEnabledSetError",
                        error: "Invalid Auto Execute Commands setting",
                    });
                    notificationService.showErrorMessage("Invalid Auto Execute Commands setting provided.");
                }
                break;
            case "saveAiModel": // AI 모델 저장 케이스 추가
                const aiModelToSave = data.aiModel || data.model;
                if (aiModelToSave && typeof aiModelToSave === "string") {
                    try {
                        // UI 표시에 쓰는 키와 런타임에서 사용하는 키를 모두 저장
                        await stateManager.saveAiModel(aiModelToSave);
                        // 'ollama' 관련 세부 타입 매핑 제거 및 'ollama' 타입으로 통일
                        let toRuntime = aiModelToSave;
                        if (aiModelToSave.toLowerCase() === "ollama") {
                            toRuntime = "ollama";
                        }
                        await stateManager.saveCurrentAiModel(toRuntime);
                        safePostMessage(panel, { command: "aiModelSaved" });
                        notificationService.showInfoMessage("CODEPILOT: AI Model saved.");
                    }
                    catch (error) {
                        safePostMessage(panel, {
                            command: "aiModelSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving AI Model: ${error.message}`);
                    }
                }
                else {
                    safePostMessage(panel, {
                        command: "aiModelSaveError",
                        error: "Invalid AI Model",
                    });
                    notificationService.showErrorMessage("Invalid AI Model provided.");
                }
                break;
            case "saveLanguage": // 언어 설정 저장 케이스 추가
                const languageToSave = data.language;
                // console.log('[PanelManager] Saving language:', languageToSave);
                if (languageToSave && typeof languageToSave === "string") {
                    try {
                        await stateManager.saveLanguage(languageToSave);
                        // console.log('[PanelManager] Language saved successfully:', languageToSave);
                        safePostMessage(panel, {
                            command: "languageSaved",
                            language: languageToSave,
                        });
                        notificationService.showInfoMessage("CODEPILOT: Language setting updated.");
                    }
                    catch (error) {
                        console.error("[PanelManager] Failed to save language:", error);
                        safePostMessage(panel, {
                            command: "languageSaveError",
                            error: error.message,
                        });
                        notificationService.showErrorMessage(`Error saving language setting: ${error.message}`);
                    }
                }
                else {
                    console.error("[PanelManager] Invalid language setting provided:", languageToSave);
                    safePostMessage(panel, {
                        command: "languageSaveError",
                        error: "Invalid language setting",
                    });
                    notificationService.showErrorMessage("Invalid language setting provided.");
                }
                break;
            case "testOllamaConnection": // Ollama 연결 테스트 케이스 추가
                try {
                    const apiUrl = (await stateManager.getOllamaApiUrl()) ||
                        "http://localhost:11434";
                    const result = await ModelConnectionService_1.ModelConnectionService.testOllamaConnection(apiUrl);
                    safePostMessage(panel, {
                        command: "ollamaConnectionTestResult",
                        success: result.success,
                        data: result.data,
                        error: result.error,
                    });
                    if (result.success) {
                        notificationService.showInfoMessage("CODEPILOT: Ollama connection test successful.");
                    }
                    else {
                        notificationService.showErrorMessage(`CODEPILOT: Ollama connection test failed: ${result.error}`);
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "ollamaConnectionTestResult",
                        success: false,
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`CODEPILOT: Ollama connection test failed: ${error.message}`);
                }
                break;
            case "testGeminiConnection": // Gemini 연결 테스트 케이스 추가
                try {
                    const apiKey = await stateManager.getApiKey();
                    if (!apiKey) {
                        safePostMessage(panel, {
                            command: "geminiConnectionTestResult",
                            success: false,
                            error: "No API key found",
                        });
                        notificationService.showErrorMessage("CODEPILOT: No Gemini API key found.");
                        return;
                    }
                    const testResult = await ModelConnectionService_1.ModelConnectionService.testGeminiConnection(apiKey, geminiApi);
                    safePostMessage(panel, {
                        command: "geminiConnectionTestResult",
                        success: testResult.success,
                        data: testResult.data,
                        error: testResult.error,
                    });
                    if (testResult.success) {
                        notificationService.showInfoMessage("CODEPILOT: Gemini connection test successful.");
                    }
                    else {
                        notificationService.showErrorMessage(`CODEPILOT: Gemini connection test failed: ${testResult.error}`);
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "geminiConnectionTestResult",
                        success: false,
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`CODEPILOT: Gemini connection test failed: ${error.message}`);
                }
                break;
            case "testBanyaLicenseConnection": // Banya 라이선스 연결 테스트 케이스 추가
                try {
                    const licenseSerial = await stateManager.getBanyaLicenseSerial();
                    if (!licenseSerial) {
                        safePostMessage(panel, {
                            command: "banyaLicenseConnectionTestResult",
                            success: false,
                            error: "No Banya License Serial found",
                        });
                        notificationService.showErrorMessage("CODEPILOT: No Banya License Serial found.");
                        return;
                    }
                    const testResult = await licenseService.verifyLicense(licenseSerial);
                    if (testResult.success) {
                        safePostMessage(panel, {
                            command: "banyaLicenseConnectionTestResult",
                            success: true,
                            data: testResult,
                        });
                        notificationService.showInfoMessage("CODEPILOT: Banya License connection test successful.");
                    }
                    else {
                        safePostMessage(panel, {
                            command: "banyaLicenseConnectionTestResult",
                            success: false,
                            error: testResult.message,
                        });
                        notificationService.showErrorMessage(`CODEPILOT: Banya License connection test failed: ${testResult.message}`);
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "banyaLicenseConnectionTestResult",
                        success: false,
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`CODEPILOT: Banya License connection test failed: ${error.message}`);
                }
                break;
            case "testOllamaBlockerConnection": // Ollama Blocker 연결 테스트 케이스 추가
                try {
                    if (!ollamaBlockerService) {
                        safePostMessage(panel, {
                            command: "ollamaBlockerConnectionTestResult",
                            success: false,
                            error: "Ollama Blocker service not available",
                        });
                        notificationService.showErrorMessage("CODEPILOT: Ollama Blocker service not available.");
                        return;
                    }
                    const testResult = await ollamaBlockerService.testConnection();
                    if (testResult.success) {
                        safePostMessage(panel, {
                            command: "ollamaBlockerConnectionTestResult",
                            success: true,
                            data: testResult.data,
                        });
                        notificationService.showInfoMessage("CODEPILOT: Ollama Blocker connection test successful.");
                    }
                    else {
                        safePostMessage(panel, {
                            command: "ollamaBlockerConnectionTestResult",
                            success: false,
                            error: testResult.error,
                        });
                        notificationService.showErrorMessage(`CODEPILOT: Ollama Blocker connection test failed: ${testResult.error}`);
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "ollamaBlockerConnectionTestResult",
                        success: false,
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`CODEPILOT: Ollama Blocker connection test failed: ${error.message}`);
                }
                break;
            case "testTerminalDaemonConnection": // Terminal Daemon 연결 테스트 케이스 추가
                try {
                    // 🆕 core TerminalManager 사용
                    const terminalManager = TerminalManager_1.TerminalManager.getInstance(context);
                    const testResult = await terminalManager.testDaemonConnection();
                    if (testResult.success) {
                        safePostMessage(panel, {
                            command: "terminalDaemonConnectionTestResult",
                            success: true,
                            data: testResult.data,
                        });
                        notificationService.showInfoMessage("CODEPILOT: Terminal Daemon connection test successful.");
                    }
                    else {
                        safePostMessage(panel, {
                            command: "terminalDaemonConnectionTestResult",
                            success: false,
                            error: testResult.error,
                        });
                        notificationService.showErrorMessage(`CODEPILOT: Terminal Daemon connection test failed: ${testResult.error}`);
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "terminalDaemonConnectionTestResult",
                        success: false,
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`CODEPILOT: Terminal Daemon connection test failed: ${error.message}`);
                }
                break;
            case "testAllConnections": // 모든 연결 테스트 케이스 추가
                try {
                    const results = {
                        gemini: false,
                        ollama: false,
                        banyaLicense: false,
                        ollamaBlocker: false,
                        terminalDaemon: false,
                    };
                    // Gemini 연결 테스트
                    try {
                        const apiKey = await stateManager.getApiKey();
                        if (apiKey) {
                            const geminiTest = await ModelConnectionService_1.ModelConnectionService.testGeminiConnection(apiKey, geminiApi);
                            results.gemini = geminiTest.success;
                        }
                    }
                    catch (e) {
                        /* 무시 */
                    }
                    // Ollama 연결 테스트
                    try {
                        const apiUrl = (await stateManager.getOllamaApiUrl()) ||
                            "http://localhost:11434";
                        const ollamaTest = await ModelConnectionService_1.ModelConnectionService.testOllamaConnection(apiUrl);
                        results.ollama = ollamaTest.success;
                    }
                    catch (e) {
                        /* 무시 */
                    }
                    // 기상청 API 연결 테스트
                    try {
                    }
                    catch (e) {
                        /* 무시 */
                    }
                    // Banya 라이선스 연결 테스트
                    try {
                        const licenseSerial = await stateManager.getBanyaLicenseSerial();
                        if (licenseSerial) {
                            const licenseTest = await licenseService.verifyLicense(licenseSerial);
                            results.banyaLicense = licenseTest.success;
                        }
                    }
                    catch (e) {
                        /* 무시 */
                    }
                    // Ollama Blocker 연결 테스트
                    try {
                        if (ollamaBlockerService) {
                            const blockerTest = await ollamaBlockerService.testConnection();
                            results.ollamaBlocker = blockerTest.success;
                        }
                    }
                    catch (e) {
                        /* 무시 */
                    }
                    // Terminal Daemon 연결 테스트
                    try {
                        // 🆕 core TerminalManager 사용
                        const terminalManager = TerminalManager_1.TerminalManager.getInstance(context);
                        const daemonTest = await terminalManager.testDaemonConnection();
                        results.terminalDaemon = daemonTest.success;
                    }
                    catch (e) {
                        /* 무시 */
                    }
                    safePostMessage(panel, {
                        command: "allConnectionsTestResult",
                        results,
                    });
                    notificationService.showInfoMessage("CODEPILOT: All connections test completed.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "allConnectionsTestResult",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`CODEPILOT: All connections test failed: ${error.message}`);
                }
                break;
            case "initializePanel": {
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
                    const autoTestRetryEnabled = await settingsManager.isAutoTestRetryEnabled();
                    const testRetryCount = await settingsManager.getTestRetryCount();
                    const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
                    const outputLogEnabled = await stateManager.getOutputLogEnabled();
                    const errorRetryCount = await stateManager.getErrorRetryCount();
                    const banyaLicenseSerial = await stateManager.getBanyaLicenseSerial();
                    const isLicenseVerified = await stateManager.getIsLicenseVerified();
                    const aiModel = await stateManager.getAiModel();
                    const geminiModel = await stateManager.getGeminiModel();
                    const messageToSend = {
                        command: "currentSettings",
                        apiKey: apiKey || "",
                        geminiModel: geminiModel || "gemini-3-pro-preview",
                        ollamaApiUrl: ollamaApiUrl || "http://localhost:11434",
                        ollamaEndpoint: ollamaEndpoint || "/api/generate",
                        ollamaModel: ollamaModel || "gemma3:27b",
                        ollamaServerType: ollamaServerType || "local",
                        localOllamaApiUrl: ollamaApiUrl || "http://localhost:11434",
                        localOllamaEndpoint: ollamaEndpoint || "/api/generate",
                        remoteOllamaApiUrl: remoteOllamaApiUrl || "",
                        remoteOllamaEndpoint: remoteOllamaEndpoint || "/api/generate",
                        remoteOllamaModel: remoteOllamaModel || "",
                        autoTestRetryEnabled: autoTestRetryEnabled || false,
                        testRetryCount: testRetryCount || 2,
                        autoCorrectionEnabled: autoCorrectionEnabled || false,
                        outputLogEnabled: outputLogEnabled || false,
                        errorRetryCount: errorRetryCount || 2,
                        banyaLicenseSerial: banyaLicenseSerial || "",
                        isLicenseVerified: isLicenseVerified, // 라이선스 검증 상태 추가
                        aiModel: aiModel || "gemini", // AI 모델 정보 추가
                    };
                    // console.log('Sending currentApiKeys message:', messageToSend);
                    safePostMessage(panel, messageToSend);
                }
                catch (error) {
                    console.error("Error getting current settings:", error);
                    safePostMessage(panel, {
                        command: "currentSettings",
                        error: error.message,
                    });
                }
                break;
            }
            case "initSettings": // 설정 초기화 (별칭)
            case "loadSettings": // 설정 로드
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
                    const autoTestRetryEnabled = await settingsManager.isAutoTestRetryEnabled();
                    const testRetryCount = await settingsManager.getTestRetryCount();
                    const autoCorrectionEnabled = await stateManager.getAutoCorrectionEnabled();
                    const outputLogEnabled = await stateManager.getOutputLogEnabled();
                    const errorRetryCount = await stateManager.getErrorRetryCount();
                    const banyaLicenseSerial = await stateManager.getBanyaLicenseSerial();
                    const isLicenseVerified = await stateManager.getIsLicenseVerified();
                    const aiModel = await stateManager.getAiModel();
                    const geminiModel = await stateManager.getGeminiModel();
                    const currentAiModel = await stateManager.getCurrentAiModel();
                    // currentAiModel이 있으면 우선 사용, 없으면 aiModel 사용
                    const modelToUse = currentAiModel || aiModel || "ollama";
                    const messageToSend = {
                        command: "currentSettings",
                        apiKey: apiKey || "",
                        geminiModel: geminiModel || "gemini-3-pro-preview",
                        ollamaApiUrl: ollamaApiUrl || "http://localhost:11434",
                        ollamaEndpoint: ollamaEndpoint || "/api/generate",
                        ollamaModel: ollamaModel || "gemma3:27b",
                        ollamaServerType: ollamaServerType || "local",
                        localOllamaApiUrl: ollamaApiUrl || "http://localhost:11434",
                        localOllamaEndpoint: ollamaEndpoint || "/api/generate",
                        remoteOllamaApiUrl: remoteOllamaApiUrl || "",
                        remoteOllamaEndpoint: remoteOllamaEndpoint || "/api/generate",
                        remoteOllamaModel: remoteOllamaModel || "",
                        autoTestRetryEnabled: autoTestRetryEnabled || false,
                        testRetryCount: testRetryCount || 2,
                        autoCorrectionEnabled: autoCorrectionEnabled || false,
                        outputLogEnabled: outputLogEnabled || false,
                        errorRetryCount: errorRetryCount || 2,
                        banyaLicenseSerial: banyaLicenseSerial || "",
                        isLicenseVerified: isLicenseVerified,
                        aiModel: modelToUse,
                    };
                    // console.log('[PanelManager] Sending currentSettings message:', messageToSend);
                    // console.log('[PanelManager] Message ollamaModel value:', messageToSend.ollamaModel);
                    safePostMessage(panel, messageToSend);
                }
                catch (error) {
                    console.error("Error loading settings:", error);
                    safePostMessage(panel, {
                        command: "settingsLoadError",
                        error: error.message,
                    });
                }
                break;
            case "loadApiKeys": // API 키 로드
                try {
                    const geminiApiKey = await stateManager.getApiKey();
                    safePostMessage(panel, { command: "apiKeysLoaded", geminiApiKey });
                }
                catch (error) {
                    console.error("Error loading API keys:", error);
                    safePostMessage(panel, {
                        command: "apiKeysLoadError",
                        error: error.message,
                    });
                }
                break;
            case "loadAiModel": // AI 모델 로드
                try {
                    const aiModel = await stateManager.getAiModel();
                    const currentAiModel = await stateManager.getCurrentAiModel();
                    // currentAiModel이 있으면 우선 사용, 없으면 aiModel 사용
                    const modelToSend = currentAiModel || aiModel;
                    safePostMessage(panel, {
                        command: "currentAiModel",
                        model: modelToSend,
                    });
                }
                catch (error) {
                    console.error("Error loading AI model:", error);
                    safePostMessage(panel, {
                        command: "aiModelLoadError",
                        error: error.message,
                    });
                }
                break;
            case "loadOllamaModel": // Ollama 모델 로드
                try {
                    const ollamaModel = await stateManager.getOllamaModel();
                    safePostMessage(panel, {
                        command: "ollamaModelLoaded",
                        ollamaModel,
                    });
                }
                catch (error) {
                    console.error("Error loading Ollama model:", error);
                    safePostMessage(panel, {
                        command: "ollamaModelLoadError",
                        error: error.message,
                    });
                }
                break;
            case "getLanguage": // 언어 설정 로드
                try {
                    const language = await stateManager.getLanguage();
                    // console.log('[PanelManager] Loaded language from storage:', language);
                    safePostMessage(panel, { command: "currentLanguage", language });
                    // console.log('[PanelManager] Sent currentLanguage message with language:', language);
                }
                catch (error) {
                    console.error("Error getting language:", error);
                    safePostMessage(panel, {
                        command: "languageLoadError",
                        error: error.message,
                    });
                }
                break;
            case "getLanguageData": // 언어 데이터 로드
                try {
                    const language = data.language || vscode.env.language;
                    const languageData = services_1.LocaleService.loadLanguageData(language);
                    safePostMessage(panel, {
                        command: "languageDataReceived",
                        language,
                        data: languageData,
                    });
                }
                catch (error) {
                    console.error("Error loading language data:", error);
                    safePostMessage(panel, {
                        command: "languageDataLoadError",
                        error: error.message,
                    });
                }
                break;
            case "uploadAgentPolicyStableVersion": // Stable Version Markdown 저장
                try {
                    const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
                    if (mdContent && typeof mdContent === "string") {
                        // 워크스페이스 루트 가져오기
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error("워크스페이스가 열려있지 않습니다.");
                        }
                        // ./.agent/rules 디렉토리 생성
                        const agentDir = path.join(workspaceRoot, ".agent", "rules");
                        const agentDirUri = vscode.Uri.file(agentDir);
                        await vscode.workspace.fs.createDirectory(agentDirUri);
                        // 파일 저장
                        const filePath = path.join(agentDir, "stable-version.md");
                        const fileUri = vscode.Uri.file(filePath);
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));
                        // 메모리에도 저장 (호환성)
                        await stateManager.saveAgentPolicyStableVersion(mdContent);
                        safePostMessage(panel, { command: "agentPolicyStableVersionSaved" });
                        notificationService.showInfoMessage(`CODEPILOT: Stable Version Markdown saved to ${filePath}`);
                    }
                    else {
                        safePostMessage(panel, {
                            command: "agentPolicyStableVersionSaveError",
                            error: "Invalid Markdown content",
                        });
                        notificationService.showErrorMessage("Invalid Markdown content provided.");
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyStableVersionSaveError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error saving Stable Version Markdown: ${error.message}`);
                }
                break;
            case "uploadAgentPolicyCodingStyle": // Coding Style Markdown 저장
                try {
                    const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
                    if (mdContent && typeof mdContent === "string") {
                        // 워크스페이스 루트 가져오기
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error("워크스페이스가 열려있지 않습니다.");
                        }
                        // ./.agent/rules 디렉토리 생성
                        const agentDir = path.join(workspaceRoot, ".agent", "rules");
                        const agentDirUri = vscode.Uri.file(agentDir);
                        await vscode.workspace.fs.createDirectory(agentDirUri);
                        // 파일 저장
                        const filePath = path.join(agentDir, "coding-style.md");
                        const fileUri = vscode.Uri.file(filePath);
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));
                        // 메모리에도 저장 (호환성)
                        await stateManager.saveAgentPolicyCodingStyle(mdContent);
                        safePostMessage(panel, { command: "agentPolicyCodingStyleSaved" });
                        notificationService.showInfoMessage(`CODEPILOT: Coding Style Markdown saved to ${filePath}`);
                    }
                    else {
                        safePostMessage(panel, {
                            command: "agentPolicyCodingStyleSaveError",
                            error: "Invalid Markdown content",
                        });
                        notificationService.showErrorMessage("Invalid Markdown content provided.");
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyCodingStyleSaveError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error saving Coding Style Markdown: ${error.message}`);
                }
                break;
            case "uploadAgentPolicyProjectArchitecture": // Project Architecture Markdown 저장
                try {
                    const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
                    if (mdContent && typeof mdContent === "string") {
                        // 워크스페이스 루트 가져오기
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error("워크스페이스가 열려있지 않습니다.");
                        }
                        // ./.agent/rules 디렉토리 생성
                        const agentDir = path.join(workspaceRoot, ".agent", "rules");
                        const agentDirUri = vscode.Uri.file(agentDir);
                        await vscode.workspace.fs.createDirectory(agentDirUri);
                        // 파일 저장
                        const filePath = path.join(agentDir, "project-architecture.md");
                        const fileUri = vscode.Uri.file(filePath);
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));
                        // 메모리에도 저장 (호환성)
                        await stateManager.saveAgentPolicyProjectArchitecture(mdContent);
                        safePostMessage(panel, { command: "agentPolicyProjectArchitectureSaved" });
                        notificationService.showInfoMessage(`CODEPILOT: Project Architecture Markdown saved to ${filePath}`);
                    }
                    else {
                        safePostMessage(panel, {
                            command: "agentPolicyProjectArchitectureSaveError",
                            error: "Invalid Markdown content",
                        });
                        notificationService.showErrorMessage("Invalid Markdown content provided.");
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyProjectArchitectureSaveError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error saving Project Architecture Markdown: ${error.message}`);
                }
                break;
            case "uploadAgentPolicyDependencyPolicy": // Dependency Policy Markdown 저장
                try {
                    const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
                    if (mdContent && typeof mdContent === "string") {
                        // 워크스페이스 루트 가져오기
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error("워크스페이스가 열려있지 않습니다.");
                        }
                        // ./.agent/rules 디렉토리 생성
                        const agentDir = path.join(workspaceRoot, ".agent", "rules");
                        const agentDirUri = vscode.Uri.file(agentDir);
                        await vscode.workspace.fs.createDirectory(agentDirUri);
                        // 파일 저장
                        const filePath = path.join(agentDir, "dependency-policy.md");
                        const fileUri = vscode.Uri.file(filePath);
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));
                        // 메모리에도 저장 (호환성)
                        await stateManager.saveAgentPolicyDependencyPolicy(mdContent);
                        safePostMessage(panel, { command: "agentPolicyDependencyPolicySaved" });
                        notificationService.showInfoMessage(`CODEPILOT: Dependency Policy Markdown saved to ${filePath}`);
                    }
                    else {
                        safePostMessage(panel, {
                            command: "agentPolicyDependencyPolicySaveError",
                            error: "Invalid Markdown content",
                        });
                        notificationService.showErrorMessage("Invalid Markdown content provided.");
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyDependencyPolicySaveError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error saving Dependency Policy Markdown: ${error.message}`);
                }
                break;
            case "uploadAgentPolicyDbPolicy": // DB Policy Markdown 저장
                try {
                    const mdContent = data.mdContent || data.xmlContent; // 호환성을 위해 xmlContent도 허용
                    if (mdContent && typeof mdContent === "string") {
                        // 워크스페이스 루트 가져오기
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error("워크스페이스가 열려있지 않습니다.");
                        }
                        // ./.agent/rules 디렉토리 생성
                        const agentDir = path.join(workspaceRoot, ".agent", "rules");
                        const agentDirUri = vscode.Uri.file(agentDir);
                        await vscode.workspace.fs.createDirectory(agentDirUri);
                        // 파일 저장
                        const filePath = path.join(agentDir, "db-policy.md");
                        const fileUri = vscode.Uri.file(filePath);
                        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(mdContent, "utf8"));
                        // 메모리에도 저장 (호환성)
                        await stateManager.saveAgentPolicyDbPolicy(mdContent);
                        safePostMessage(panel, { command: "agentPolicyDbPolicySaved" });
                        notificationService.showInfoMessage(`CODEPILOT: DB Policy Markdown saved to ${filePath}`);
                    }
                    else {
                        safePostMessage(panel, {
                            command: "agentPolicyDbPolicySaveError",
                            error: "Invalid Markdown content",
                        });
                        notificationService.showErrorMessage("Invalid Markdown content provided.");
                    }
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyDbPolicySaveError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error saving DB Policy Markdown: ${error.message}`);
                }
                break;
            case "getAgentPolicyStableVersion": // Stable Version Markdown 로드
                try {
                    const mdContent = await stateManager.getAgentPolicyStableVersion();
                    safePostMessage(panel, {
                        command: "agentPolicyStableVersionLoaded",
                        mdContent: mdContent || "",
                        xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
                    });
                }
                catch (error) {
                    console.error("Error loading Stable Version Markdown:", error);
                    safePostMessage(panel, {
                        command: "agentPolicyStableVersionLoadError",
                        error: error.message,
                    });
                }
                break;
            case "getAgentPolicyCodingStyle": // Coding Style Markdown 로드
                try {
                    const mdContent = await stateManager.getAgentPolicyCodingStyle();
                    safePostMessage(panel, {
                        command: "agentPolicyCodingStyleLoaded",
                        mdContent: mdContent || "",
                        xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
                    });
                }
                catch (error) {
                    console.error("Error loading Coding Style Markdown:", error);
                    safePostMessage(panel, {
                        command: "agentPolicyCodingStyleLoadError",
                        error: error.message,
                    });
                }
                break;
            case "getAgentPolicyProjectArchitecture": // Project Architecture Markdown 로드
                try {
                    const mdContent = await stateManager.getAgentPolicyProjectArchitecture();
                    safePostMessage(panel, {
                        command: "agentPolicyProjectArchitectureLoaded",
                        mdContent: mdContent || "",
                        xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
                    });
                }
                catch (error) {
                    console.error("Error loading Project Architecture Markdown:", error);
                    safePostMessage(panel, {
                        command: "agentPolicyProjectArchitectureLoadError",
                        error: error.message,
                    });
                }
                break;
            case "getAgentPolicyDependencyPolicy": // Dependency Policy Markdown 로드
                try {
                    const mdContent = await stateManager.getAgentPolicyDependencyPolicy();
                    safePostMessage(panel, {
                        command: "agentPolicyDependencyPolicyLoaded",
                        mdContent: mdContent || "",
                        xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
                    });
                }
                catch (error) {
                    console.error("Error loading Dependency Policy Markdown:", error);
                    safePostMessage(panel, {
                        command: "agentPolicyDependencyPolicyLoadError",
                        error: error.message,
                    });
                }
                break;
            case "getAgentPolicyDbPolicy": // DB Policy Markdown 로드
                try {
                    const mdContent = await stateManager.getAgentPolicyDbPolicy();
                    safePostMessage(panel, {
                        command: "agentPolicyDbPolicyLoaded",
                        mdContent: mdContent || "",
                        xmlContent: mdContent || "", // 호환성을 위해 xmlContent도 포함
                    });
                }
                catch (error) {
                    console.error("Error loading DB Policy Markdown:", error);
                    safePostMessage(panel, {
                        command: "agentPolicyDbPolicyLoadError",
                        error: error.message,
                    });
                }
                break;
            case "deleteAgentPolicyStableVersion": // Stable Version Markdown 삭제
                try {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const filePath = path.join(workspaceRoot, ".agent", "rules", "stable-version.md");
                        const fileUri = vscode.Uri.file(filePath);
                        try {
                            await vscode.workspace.fs.delete(fileUri);
                        }
                        catch (e) {
                            // 파일이 없으면 무시
                            if (e.code !== "FileNotFound")
                                throw e;
                        }
                    }
                    await stateManager.deleteAgentPolicyStableVersion();
                    safePostMessage(panel, { command: "agentPolicyStableVersionDeleted" });
                    notificationService.showInfoMessage("CODEPILOT: Stable Version Markdown deleted.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyStableVersionDeleteError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error deleting Stable Version Markdown: ${error.message}`);
                }
                break;
            case "deleteAgentPolicyCodingStyle": // Coding Style Markdown 삭제
                try {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const filePath = path.join(workspaceRoot, ".agent", "rules", "coding-style.md");
                        const fileUri = vscode.Uri.file(filePath);
                        try {
                            await vscode.workspace.fs.delete(fileUri);
                        }
                        catch (e) {
                            // 파일이 없으면 무시
                            if (e.code !== "FileNotFound")
                                throw e;
                        }
                    }
                    await stateManager.deleteAgentPolicyCodingStyle();
                    safePostMessage(panel, { command: "agentPolicyCodingStyleDeleted" });
                    notificationService.showInfoMessage("CODEPILOT: Coding Style Markdown deleted.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyCodingStyleDeleteError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error deleting Coding Style Markdown: ${error.message}`);
                }
                break;
            case "deleteAgentPolicyProjectArchitecture": // Project Architecture Markdown 삭제
                try {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const filePath = path.join(workspaceRoot, ".agent", "rules", "project-architecture.md");
                        const fileUri = vscode.Uri.file(filePath);
                        try {
                            await vscode.workspace.fs.delete(fileUri);
                        }
                        catch (e) {
                            // 파일이 없으면 무시
                            if (e.code !== "FileNotFound")
                                throw e;
                        }
                    }
                    await stateManager.deleteAgentPolicyProjectArchitecture();
                    safePostMessage(panel, { command: "agentPolicyProjectArchitectureDeleted" });
                    notificationService.showInfoMessage("CODEPILOT: Project Architecture Markdown deleted.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyProjectArchitectureDeleteError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error deleting Project Architecture Markdown: ${error.message}`);
                }
                break;
            case "deleteAgentPolicyDependencyPolicy": // Dependency Policy Markdown 삭제
                try {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const filePath = path.join(workspaceRoot, ".agent", "rules", "dependency-policy.md");
                        const fileUri = vscode.Uri.file(filePath);
                        try {
                            await vscode.workspace.fs.delete(fileUri);
                        }
                        catch (e) {
                            // 파일이 없으면 무시
                            if (e.code !== "FileNotFound")
                                throw e;
                        }
                    }
                    await stateManager.deleteAgentPolicyDependencyPolicy();
                    safePostMessage(panel, { command: "agentPolicyDependencyPolicyDeleted" });
                    notificationService.showInfoMessage("CODEPILOT: Dependency Policy Markdown deleted.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyDependencyPolicyDeleteError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error deleting Dependency Policy Markdown: ${error.message}`);
                }
                break;
            case "deleteAgentPolicyDbPolicy": // DB Policy Markdown 삭제
                try {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const filePath = path.join(workspaceRoot, ".agent", "rules", "db-policy.md");
                        const fileUri = vscode.Uri.file(filePath);
                        try {
                            await vscode.workspace.fs.delete(fileUri);
                        }
                        catch (e) {
                            // 파일이 없으면 무시
                            if (e.code !== "FileNotFound")
                                throw e;
                        }
                    }
                    await stateManager.deleteAgentPolicyDbPolicy();
                    safePostMessage(panel, { command: "agentPolicyDbPolicyDeleted" });
                    notificationService.showInfoMessage("CODEPILOT: DB Policy Markdown deleted.");
                }
                catch (error) {
                    safePostMessage(panel, {
                        command: "agentPolicyDbPolicyDeleteError",
                        error: error.message,
                    });
                    notificationService.showErrorMessage(`Error deleting DB Policy Markdown: ${error.message}`);
                }
                break;
            default:
                console.log("Unknown command:", data.command);
        }
    });
    // webview를 전역 배열에 등록
    allWebviews.push(panel.webview);
    // 패널이 dispose될 때 배열에서 제거
    panel.onDidDispose(() => {
        try {
            const idx = allWebviews.indexOf(panel.webview);
            if (idx !== -1) {
                allWebviews.splice(idx, 1);
            }
        }
        catch (error) {
            // Panel이 이미 dispose된 경우 무시 (콘솔 스팸 방지를 위해 주석 처리)
            // console.log('[PanelManager] Panel already disposed, ignoring error:', error);
        }
    }, undefined, context.subscriptions);
    return panel;
}
/**
 * Plan Queue 패널을 엽니다.
 */
function openPlanPanel(extensionUri, context) {
    // 🆕 core TaskManager 사용
    const taskManager = TaskManager_1.TaskManager.getInstance(context);
    const panel = (0, utils_1.createAndSetupWebviewPanel)(extensionUri, context, "plan", "CODEPILOT Plan Queue", "plan", vscode.ViewColumn.Two, async (data, panel) => {
        switch (data.command) {
            case "planQueueLoad": {
                try {
                    const items = taskManager.listPlanItems();
                    safePostMessage(panel, { command: "planQueueData", items });
                }
                catch (e) {
                    safePostMessage(panel, {
                        command: "planQueueError",
                        error: e?.message || String(e),
                    });
                }
                break;
            }
            case "planQueueRun": {
                try {
                    const id = String(data.id || "");
                    if (!id) {
                        throw new Error("Invalid id");
                    }
                    taskManager.updatePlanItemStatus(id, "in_progress");
                    const items = taskManager.listPlanItems();
                    safePostMessage(panel, { command: "planQueueData", items });
                }
                catch (e) {
                    safePostMessage(panel, {
                        command: "planQueueError",
                        error: e?.message || String(e),
                    });
                }
                break;
            }
            case "planQueueComplete": {
                try {
                    const id = String(data.id || "");
                    if (!id) {
                        throw new Error("Invalid id");
                    }
                    taskManager.updatePlanItemStatus(id, "done");
                    const items = taskManager.listPlanItems();
                    safePostMessage(panel, { command: "planQueueData", items });
                }
                catch (e) {
                    safePostMessage(panel, {
                        command: "planQueueError",
                        error: e?.message || String(e),
                    });
                }
                break;
            }
            case "planQueueCancel": {
                try {
                    const id = String(data.id || "");
                    if (!id) {
                        throw new Error("Invalid id");
                    }
                    taskManager.updatePlanItemStatus(id, "skipped");
                    const items = taskManager.listPlanItems();
                    safePostMessage(panel, { command: "planQueueData", items });
                }
                catch (e) {
                    safePostMessage(panel, {
                        command: "planQueueError",
                        error: e?.message || String(e),
                    });
                }
                break;
            }
            case "planQueueClear": {
                taskManager.clearPlanQueue();
                const items = taskManager.listPlanItems();
                safePostMessage(panel, { command: "planQueueData", items });
                break;
            }
            default:
                // console.log('[PlanPanel] Unknown command:', data.command);
                break;
        }
    });
    // 초기 로드
    safePostMessage(panel, {
        command: "planQueueData",
        items: taskManager.listPlanItems(),
    });
    return panel;
}
//# sourceMappingURL=SettingsPanelProvider.js.map