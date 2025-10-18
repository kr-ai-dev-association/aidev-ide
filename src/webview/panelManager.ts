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
        async (data, panel) => {
            // console.log('Settings panel received message:', data.command, data);
            switch (data.command) {
                case 'initSettings':
                    panel.webview.postMessage({
                        command: 'currentSettings',
                        autoUpdateEnabled: await configurationService.isAutoUpdateEnabled(),
                        projectRoot: await configurationService.getProjectRoot(),
                        terminalDaemonEnabled: await configurationService.isTerminalDaemonEnabled()
                    });
                    break;
                case 'setTerminalDaemonEnabled':
                    if (typeof data.enabled === 'boolean') {
                        await configurationService.updateTerminalDaemonEnabled(data.enabled);
                        try {
                            const tds = TerminalDaemonService.getInstance(context);
                            const isInstalled = await tds.isInstalled();
                            if (!isInstalled) {
                                await tds.install();
                            }
                            if (data.enabled) {
                                await tds.start();
                                tds.showLogs();
                            } else {
                                await tds.stop();
                            }
                        } catch (e) {
                            console.error('[PanelManager] terminal-daemon 토글 처리 중 오류:', e);
                        }
                        panel.webview.postMessage({ command: 'terminalDaemonStatusChanged', enabled: data.enabled });
                    }
                    break;
                case 'setAutoUpdate':
                    if (typeof data.enabled === 'boolean') {
                        await configurationService.updateAutoUpdateEnabled(data.enabled);
                        panel.webview.postMessage({ command: 'autoUpdateStatusChanged', enabled: data.enabled });
                    }
                    break;
                case 'setProjectRoot':
                    if (data.clear) {
                        // 프로젝트 Root 지우기
                        try {
                            await configurationService.updateProjectRoot(undefined);

                            // 설정이 제대로 삭제되었는지 확인
                            const savedRoot = await configurationService.getProjectRoot();
                            console.log(`[PanelManager] 프로젝트 Root 삭제 후 확인: ${savedRoot}`);

                            if (!savedRoot) {
                                panel.webview.postMessage({
                                    command: 'updatedProjectRoot',
                                    projectRoot: '',
                                    success: true
                                });
                                console.log(`[PanelManager] 프로젝트 Root 삭제 성공`);
                            } else {
                                panel.webview.postMessage({
                                    command: 'updatedProjectRoot',
                                    projectRoot: '',
                                    success: false,
                                    error: '프로젝트 Root 삭제에 실패했습니다.'
                                });
                                console.error(`[PanelManager] 프로젝트 Root 삭제 실패: 여전히 값이 존재함`);
                            }
                        } catch (error) {
                            console.error(`[PanelManager] 프로젝트 Root 삭제 중 오류:`, error);
                            panel.webview.postMessage({
                                command: 'updatedProjectRoot',
                                projectRoot: '',
                                success: false,
                                error: `삭제 중 오류가 발생했습니다: ${error}`
                            });
                        }
                    } else {
                        // 프로젝트 Root 선택
                        const rootUris = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select Project Root Directory'
                        });

                        if (rootUris && rootUris.length > 0) {
                            const newRootPath = rootUris[0].fsPath;
                            console.log(`[PanelManager] 프로젝트 Root 설정 시도: ${newRootPath}`);

                            try {
                                await configurationService.updateProjectRoot(newRootPath);

                                // 설정이 제대로 저장되었는지 확인
                                const savedRoot = await configurationService.getProjectRoot();
                                console.log(`[PanelManager] 저장된 프로젝트 Root 확인: ${savedRoot}`);

                                if (savedRoot === newRootPath) {
                                    panel.webview.postMessage({
                                        command: 'updatedProjectRoot',
                                        projectRoot: newRootPath,
                                        success: true
                                    });
                                    console.log(`[PanelManager] 프로젝트 Root 설정 성공: ${newRootPath}`);
                                } else {
                                    panel.webview.postMessage({
                                        command: 'updatedProjectRoot',
                                        projectRoot: '',
                                        success: false,
                                        error: '설정 저장에 실패했습니다.'
                                    });
                                    console.error(`[PanelManager] 프로젝트 Root 설정 실패: 저장된 값이 다름`);
                                }
                            } catch (error) {
                                console.error(`[PanelManager] 프로젝트 Root 설정 중 오류:`, error);
                                panel.webview.postMessage({
                                    command: 'updatedProjectRoot',
                                    projectRoot: '',
                                    success: false,
                                    error: `설정 저장 중 오류가 발생했습니다: ${error}`
                                });
                            }
                        } else {
                            // 사용자가 다이얼로그를 취소한 경우
                            console.log(`[PanelManager] 프로젝트 Root 선택이 취소됨`);
                            panel.webview.postMessage({
                                command: 'updatedProjectRoot',
                                projectRoot: '',
                                success: false,
                                error: '프로젝트 Root 선택이 취소되었습니다.'
                            });
                        }
                    }
                    break;
                case 'loadApiKeys':
                    // API 키 상태 로드
                    const weatherApiKey = await configurationService.getWeatherApiKey();
                    const newsApiKey = await configurationService.getNewsApiKey();
                    const newsApiSecret = await configurationService.getNewsApiSecret();
                    const stockApiKey = await configurationService.getStockApiKey();
                    const geminiApiKey = await storageService.getApiKey(); // Gemini API 키 추가
                    const ollamaApiUrl = await storageService.getOllamaApiUrl(); // Ollama API URL 추가
                    const ollamaEndpoint = await storageService.getOllamaEndpoint(); // Ollama 엔드포인트 추가
                    const ollamaModel = await storageService.getOllamaModel(); // Ollama 모델 추가
                    const banyaLicenseSerial = await storageService.getBanyaLicenseSerial(); // Banya 라이센스 추가

                    // Banya 라이센스 시리얼 검증 - 잘못된 데이터 필터링
                    let validBanyaLicenseSerial = '';
                    if (banyaLicenseSerial &&
                        typeof banyaLicenseSerial === 'string' &&
                        banyaLicenseSerial.trim() !== '' &&
                        !banyaLicenseSerial.includes('/') &&
                        !banyaLicenseSerial.includes('\\') &&
                        !banyaLicenseSerial.includes('프로젝트') &&
                        !banyaLicenseSerial.includes('Project') &&
                        banyaLicenseSerial.length > 5) {
                        validBanyaLicenseSerial = banyaLicenseSerial.trim();
                    }

                    // 라이선스 검증 상태 확인
                    let isLicenseVerified = false;
                    if (validBanyaLicenseSerial) {
                        try {
                            // console.log('Verifying license:', validBanyaLicenseSerial);
                            const verificationResult = await licenseService.verifyLicense(validBanyaLicenseSerial);
                            isLicenseVerified = verificationResult.success;
                            // console.log('License verification result:', verificationResult);
                            // console.log('isLicenseVerified set to:', isLicenseVerified);
                        } catch (error) {
                            console.error('License verification failed:', error);
                            isLicenseVerified = false;
                        }
                    } else {
                        console.log('No valid license serial found');
                    }

                    const messageToSend = {
                        command: 'currentApiKeys',
                        weatherApiKey: weatherApiKey || '',
                        newsApiKey: newsApiKey || '',
                        newsApiSecret: newsApiSecret || '',
                        stockApiKey: stockApiKey || '',
                        geminiApiKey: geminiApiKey || '', // Gemini API 키 추가
                        ollamaApiUrl: ollamaApiUrl || '', // Ollama API URL 추가
                        ollamaEndpoint: ollamaEndpoint || '', // Ollama 엔드포인트 추가
                        ollamaModel: ollamaModel || '', // Ollama 모델 추가
                        banyaLicenseSerial: validBanyaLicenseSerial, // 검증된 Banya 라이센스만 전송
                        isLicenseVerified: isLicenseVerified // 라이선스 검증 상태 추가
                    };
                    // console.log('Sending currentApiKeys message:', messageToSend);
                    panel.webview.postMessage(messageToSend);
                    break;
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

                        panel.webview.postMessage({ command: 'ollamaModels', models, apiUrl: apiUrl });
                    } catch (e: any) {
                        panel.webview.postMessage({ command: 'ollamaModels', models: [], error: e?.message || String(e) });
                    }
                    break;
                }
                case 'saveApiKey': // Gemini API 키 저장 케이스 추가
                    const apiKeyToSave = data.apiKey;
                    if (apiKeyToSave && typeof apiKeyToSave === 'string') {
                        try {
                            await storageService.saveApiKey(apiKeyToSave);
                            geminiApi.updateApiKey(apiKeyToSave);
                            panel.webview.postMessage({ command: 'apiKeySaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Gemini API Key saved.');
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'apiKeySaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Gemini API Key: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'apiKeySaveError', error: 'API Key empty.' });
                        notificationService.showErrorMessage('Gemini API Key is empty.');
                    }
                    break;
                case 'saveOllamaApiUrl':
                    const ollamaApiUrlToSave = data.apiUrl;
                    if (ollamaApiUrlToSave && typeof ollamaApiUrlToSave === 'string') {
                        try {
                            await storageService.saveOllamaApiUrl(ollamaApiUrlToSave);
                            // OllamaApi 인스턴스의 URL도 업데이트
                            if (ollamaApi && typeof ollamaApi.setApiUrl === 'function') {
                                ollamaApi.setApiUrl(ollamaApiUrlToSave);
                            }
                            panel.webview.postMessage({ command: 'ollamaApiUrlSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama API URL saved.');
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'ollamaApiUrlError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama API URL: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'ollamaApiUrlError', error: 'API URL empty.' });
                        notificationService.showErrorMessage('Ollama API URL is empty.');
                    }
                    break;
                case 'saveOllamaEndpoint':
                    const ollamaEndpointToSave = data.endpoint;
                    // console.log('Received saveOllamaEndpoint command with endpoint:', ollamaEndpointToSave);
                    if (ollamaEndpointToSave && typeof ollamaEndpointToSave === 'string') {
                        try {
                            // console.log('Saving Ollama endpoint to storage:', ollamaEndpointToSave);
                            await storageService.saveOllamaEndpoint(ollamaEndpointToSave);
                            // console.log('Ollama endpoint saved successfully');

                            // OllamaApi 인스턴스의 엔드포인트도 업데이트
                            if (ollamaApi && typeof ollamaApi.setEndpoint === 'function') {
                                // console.log('Updating OllamaApi instance endpoint');
                                ollamaApi.setEndpoint(ollamaEndpointToSave);
                            } else {
                                console.log('OllamaApi instance not available or setEndpoint method not found');
                            }

                            panel.webview.postMessage({ command: 'ollamaEndpointSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Ollama endpoint saved.');
                        } catch (error: any) {
                            console.error('Error saving Ollama endpoint:', error);
                            panel.webview.postMessage({ command: 'ollamaEndpointError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama endpoint: ${error.message}`);
                        }
                    } else {
                        console.log('Invalid endpoint data received:', ollamaEndpointToSave);
                        panel.webview.postMessage({ command: 'ollamaEndpointError', error: 'Endpoint empty.' });
                        notificationService.showErrorMessage('Ollama endpoint is empty.');
                    }
                    break;
                case 'saveBanyaLicense':
                    const licenseSerialToSave = data.licenseSerial;
                    if (licenseSerialToSave && typeof licenseSerialToSave === 'string') {
                        try {
                            await storageService.saveBanyaLicenseSerial(licenseSerialToSave);
                            panel.webview.postMessage({ command: 'banyaLicenseSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: AIDEV license saved.');

                            // 시리얼 번호 저장 후 ollama-blocker 인증 자동 실행
                            if (ollamaBlockerService) {
                                console.log('[PanelManager] 시리얼 번호 저장 후 ollama-blocker 인증 자동 실행');
                                try {
                                    const authResult = await ollamaBlockerService.authenticate(licenseSerialToSave);
                                    if (authResult.success) {
                                        console.log('[PanelManager] ollama-blocker 인증 성공:', authResult.message);
                                        notificationService.showInfoMessage(`AIDEV-IDE: ${authResult.message}`);
                                    } else {
                                        console.error('[PanelManager] ollama-blocker 인증 실패:', authResult.message);
                                        notificationService.showWarningMessage(`AIDEV-IDE: ${authResult.message}`);
                                    }
                                } catch (error) {
                                    console.error('[PanelManager] ollama-blocker 인증 중 오류:', error);
                                    notificationService.showErrorMessage(`AIDEV-IDE: ollama-blocker 인증 중 오류가 발생했습니다.`);
                                }
                            }
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'banyaLicenseError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Banya license: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'banyaLicenseError', error: 'License serial empty.' });
                        notificationService.showErrorMessage('Banya license serial is empty.');
                    }
                    break;
                case 'verifyBanyaLicense':
                    const licenseSerialToVerify = data.licenseSerial;
                    if (licenseSerialToVerify && typeof licenseSerialToVerify === 'string') {
                        try {
                            // 실제 라이센스 검증 로직 구현
                            const verificationResult = await licenseService.verifyLicense(licenseSerialToVerify);

                            if (verificationResult.success) {
                                panel.webview.postMessage({ command: 'banyaLicenseVerified' });
                                notificationService.showInfoMessage(`AIDEV-IDE: ${verificationResult.message}`);

                                // 시리얼 번호 검증 성공 후 ollama-blocker 인증 자동 실행
                                if (ollamaBlockerService) {
                                    console.log('[PanelManager] 시리얼 번호 검증 성공 후 ollama-blocker 인증 자동 실행');
                                    try {
                                        const authResult = await ollamaBlockerService.authenticate(licenseSerialToVerify);
                                        if (authResult.success) {
                                            console.log('[PanelManager] ollama-blocker 인증 성공:', authResult.message);
                                            notificationService.showInfoMessage(`AIDEV-IDE: ${authResult.message}`);
                                        } else {
                                            console.error('[PanelManager] ollama-blocker 인증 실패:', authResult.message);
                                            notificationService.showWarningMessage(`AIDEV-IDE: ${authResult.message}`);
                                        }
                                    } catch (error) {
                                        console.error('[PanelManager] ollama-blocker 인증 중 오류:', error);
                                        notificationService.showErrorMessage(`AIDEV-IDE: ollama-blocker 인증 중 오류가 발생했습니다.`);
                                    }
                                }
                            } else {
                                panel.webview.postMessage({ command: 'banyaLicenseVerificationFailed', error: verificationResult.message });
                                notificationService.showErrorMessage(`AIDEV-IDE: ${verificationResult.message}`);
                            }
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'banyaLicenseVerificationFailed', error: error.message });
                            notificationService.showErrorMessage(`Error verifying Banya license: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'banyaLicenseVerificationFailed', error: 'License serial empty.' });
                        notificationService.showErrorMessage('Banya license serial is empty.');
                    }
                    break;
                case 'deleteBanyaLicense':
                    try {
                        await storageService.deleteBanyaLicenseSerial();
                        panel.webview.postMessage({ command: 'banyaLicenseDeleted' });
                        notificationService.showInfoMessage('AIDEV-IDE: AIDEV license deleted successfully.');
                    } catch (error: any) {
                        panel.webview.postMessage({ command: 'banyaLicenseDeleteError', error: error.message });
                        notificationService.showErrorMessage(`Error deleting Banya license: ${error.message}`);
                    }
                    break;
                case 'saveAiModel':
                    const aiModelToSave = data.model;
                    if (aiModelToSave && typeof aiModelToSave === 'string') {
                        try {
                            // Ollama 모델인 경우 실제 모델명을 가져와서 저장
                            let modelToSave = aiModelToSave;
                            if (aiModelToSave === 'ollama') {
                                const currentOllamaModel = await storageService.getOllamaModel();
                                // console.log('Current Ollama model for mapping:', currentOllamaModel);

                                if (currentOllamaModel === 'deepseek-r1:70b') {
                                    modelToSave = 'ollama-deepseek';
                                } else if (currentOllamaModel && currentOllamaModel.startsWith('codellama')) {
                                    modelToSave = 'ollama-codellama';
                                } else if (currentOllamaModel === 'gpt-oss:120b-cloud' || currentOllamaModel === 'gpt-oss-120b:cloud') {
                                    modelToSave = 'ollama-gpt-oss';
                                } else if (currentOllamaModel && (currentOllamaModel.includes('gemma') || currentOllamaModel.includes('Gemma'))) {
                                    modelToSave = 'ollama-gemma';
                                } else {
                                    // 기본값을 ollama-gemma로 설정하되, 실제 모델명을 로그로 출력
                                    console.log('Unknown Ollama model, defaulting to ollama-gemma:', currentOllamaModel);
                                    modelToSave = 'ollama-gemma';
                                }
                            }

                            await storageService.saveCurrentAiModel(modelToSave);
                            // LlmService의 현재 모델도 업데이트
                            if (llmService) {
                                llmService.setCurrentModel(modelToSave as any);
                            }
                            panel.webview.postMessage({ command: 'aiModelSaved' });
                            notificationService.showInfoMessage(`AIDEV-IDE: AI model changed to ${aiModelToSave}.`);
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'aiModelSaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving AI model: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'aiModelSaveError', error: 'AI model empty.' });
                        notificationService.showErrorMessage('AI model is empty.');
                    }
                    break;
                case 'loadAiModel':
                    try {
                        const currentAiModel = await storageService.getCurrentAiModel();
                        panel.webview.postMessage({ command: 'currentAiModel', model: currentAiModel || 'gemini' });
                    } catch (error: any) {
                        // 오류 시 기본값 반환
                        panel.webview.postMessage({ command: 'currentAiModel', model: 'gemini' });
                    }
                    break;
                case 'saveOllamaModel':
                    const ollamaModelToSave = data.model;
                    if (ollamaModelToSave && typeof ollamaModelToSave === 'string') {
                        try {
                            await storageService.saveOllamaModel(ollamaModelToSave);
                            // OllamaApi 인스턴스의 모델도 업데이트
                            if (ollamaApi && typeof ollamaApi.setModel === 'function') {
                                ollamaApi.setModel(ollamaModelToSave);
                            }

                            // 현재 AI 모델이 Ollama인 경우 AI 모델도 업데이트
                            const currentAiModel = await storageService.getCurrentAiModel();
                            if (currentAiModel === 'ollama-gemma' || currentAiModel === 'ollama-deepseek' || currentAiModel === 'ollama-codellama') {
                                let newAiModel = 'ollama-gemma'; // 기본값

                                if (ollamaModelToSave === 'deepseek-r1:70b') {
                                    newAiModel = 'ollama-deepseek';
                                } else if (ollamaModelToSave && ollamaModelToSave.startsWith('codellama')) {
                                    newAiModel = 'ollama-codellama';
                                } else if (ollamaModelToSave === 'gpt-oss-120b:cloud' || ollamaModelToSave === 'gpt-oss:120b-cloud') {
                                    newAiModel = 'ollama-gpt-oss'; // 새로운 모델 타입 추가
                                } else if (ollamaModelToSave && (ollamaModelToSave.includes('gemma') || ollamaModelToSave.includes('Gemma'))) {
                                    newAiModel = 'ollama-gemma';
                                }

                                await storageService.saveCurrentAiModel(newAiModel);
                                if (llmService) {
                                    llmService.setCurrentModel(newAiModel as any);
                                }
                            }

                            panel.webview.postMessage({ command: 'ollamaModelSaved' });
                            notificationService.showInfoMessage(`AIDEV-IDE: Ollama model changed to ${ollamaModelToSave}.`);
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'ollamaModelError', error: error.message });
                            notificationService.showErrorMessage(`Error saving Ollama model: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'ollamaModelError', error: 'Ollama model empty.' });
                        notificationService.showErrorMessage('Ollama model is empty.');
                    }
                    break;
                case 'ollamaAuth':
                    const serialNumber = data.serialNumber;
                    if (serialNumber && typeof serialNumber === 'string' && ollamaBlockerService) {
                        try {
                            const result = await ollamaBlockerService.authenticate(serialNumber);
                            panel.webview.postMessage({
                                command: 'ollamaAuthResult',
                                success: result.success,
                                message: result.message
                            });
                            if (result.success) {
                                notificationService.showInfoMessage('Ollama 인증이 성공했습니다.');
                            } else {
                                notificationService.showErrorMessage(`Ollama 인증 실패: ${result.message}`);
                            }
                        } catch (error: any) {
                            console.error('Ollama 인증 중 오류:', error);
                            panel.webview.postMessage({
                                command: 'ollamaAuthResult',
                                success: false,
                                message: error.message || '알 수 없는 오류가 발생했습니다.'
                            });
                            notificationService.showErrorMessage(`Ollama 인증 실패: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
                        }
                    } else {
                        panel.webview.postMessage({
                            command: 'ollamaAuthResult',
                            success: false,
                            message: '시리얼 번호가 제공되지 않았거나 Ollama Blocker 서비스가 사용할 수 없습니다.'
                        });
                    }
                    break;
                case 'loadOllamaModel':
                    try {
                        const currentOllamaModel = await storageService.getOllamaModel();
                        panel.webview.postMessage({ command: 'currentOllamaModel', model: currentOllamaModel || 'gemma3:27b' });
                    } catch (error: any) {
                        // 오류 시 기본값 반환
                        panel.webview.postMessage({ command: 'currentOllamaModel', model: 'gemma3:27b' });
                    }
                    break;
                case 'saveWeatherApiKey':
                    try {
                        await configurationService.updateWeatherApiKey(data.apiKey);
                        panel.webview.postMessage({ command: 'weatherApiKeySaved' });
                        notificationService.showInfoMessage('AIDEV-IDE: Weather API key saved.');
                    } catch (error: any) {
                        panel.webview.postMessage({ command: 'weatherApiKeyError', error: error.message });
                        notificationService.showErrorMessage(`Error saving weather API key: ${error.message}`);
                    }
                    break;
                case 'saveNewsApiKey':
                    try {
                        await configurationService.updateNewsApiKey(data.apiKey);
                        panel.webview.postMessage({ command: 'newsApiKeySaved' });
                        notificationService.showInfoMessage('AIDEV-IDE: News API key saved.');
                    } catch (error: any) {
                        panel.webview.postMessage({ command: 'newsApiKeyError', error: error.message });
                        notificationService.showErrorMessage(`Error saving news API key: ${error.message}`);
                    }
                    break;
                case 'saveNewsApiSecret':
                    try {
                        await configurationService.updateNewsApiSecret(data.apiSecret);
                        panel.webview.postMessage({ command: 'newsApiSecretSaved' });
                        notificationService.showInfoMessage('AIDEV-IDE: News API secret saved.');
                    } catch (error: any) {
                        panel.webview.postMessage({ command: 'newsApiSecretError', error: error.message });
                        notificationService.showErrorMessage(`Error saving news API secret: ${error.message}`);
                    }
                    break;
                case 'saveStockApiKey':
                    try {
                        await configurationService.updateStockApiKey(data.apiKey);
                        panel.webview.postMessage({ command: 'stockApiKeySaved' });
                        notificationService.showInfoMessage('AIDEV-IDE: Stock API key saved.');
                    } catch (error: any) {
                        panel.webview.postMessage({ command: 'stockApiKeyError', error: error.message });
                        notificationService.showErrorMessage(`Error saving stock API key: ${error.message}`);
                    }
                    break;
                case 'saveLanguage':
                    try {
                        const language = data.language;
                        if (language && typeof language === 'string') {
                            // 언어 설정을 저장
                            await configurationService.updateLanguage(language);
                            panel.webview.postMessage({ command: 'languageSaved', language: language });
                            notificationService.showInfoMessage(`AIDEV-IDE: Language changed to ${language}.`);

                            // 모든 활성 webview에 언어 변경 브로드캐스트
                            allWebviews.forEach(webview => {
                                webview.postMessage({ command: 'languageChanged', language });
                            });
                        }
                    } catch (error: any) {
                        panel.webview.postMessage({ command: 'languageSaveError', error: error.message });
                        notificationService.showErrorMessage(`Error saving language: ${error.message}`);
                    }
                    break;
                case 'getLanguage':
                    try {
                        const language = await configurationService.getLanguage();
                        panel.webview.postMessage({ command: 'currentLanguage', language: language });
                    } catch (error: any) {
                        // 오류 시 기본값 반환
                        panel.webview.postMessage({ command: 'currentLanguage', language: 'ko' });
                    }
                    break;
                case 'getLanguageData':
                    try {
                        const language = data.language;
                        if (language && typeof language === 'string') {
                            // 언어 파일 경로
                            const languageFilePath = vscode.Uri.joinPath(extensionUri, 'webview', 'locales', `lang_${language}.json`);

                            // 파일 읽기
                            const fileContent = await vscode.workspace.fs.readFile(languageFilePath);
                            const languageData = JSON.parse(Buffer.from(fileContent).toString('utf8'));

                            // 웹뷰에 언어 데이터 전송
                            panel.webview.postMessage({
                                command: 'languageDataReceived',
                                language: language,
                                data: languageData
                            });
                        }
                    } catch (error: any) {
                        console.error('Error loading language data:', error);
                        // 오류 시 기본 한국어 데이터 반환
                        try {
                            const defaultLanguagePath = vscode.Uri.joinPath(extensionUri, 'webview', 'locales', 'lang_ko.json');
                            const defaultContent = await vscode.workspace.fs.readFile(defaultLanguagePath);
                            const defaultData = JSON.parse(Buffer.from(defaultContent).toString('utf8'));
                            panel.webview.postMessage({
                                command: 'languageDataReceived',
                                language: 'ko',
                                data: defaultData
                            });
                        } catch (fallbackError) {
                            console.error('Error loading fallback language data:', fallbackError);
                        }
                    }
                    break;
                // === 새로운 Ollama 서버 타입 및 원격/로컬 설정 핸들러들 ===
                case 'saveOllamaServerType':
                    const serverTypeToSave = data.serverType;
                    if (serverTypeToSave && typeof serverTypeToSave === 'string') {
                        try {
                            await storageService.saveOllamaServerType(serverTypeToSave);
                            panel.webview.postMessage({ command: 'ollamaServerTypeSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Server type saved.');
                        } catch (error: any) {
                            console.error('Error saving Ollama server type:', error);
                            panel.webview.postMessage({ command: 'ollamaServerTypeError', error: error.message });
                            notificationService.showErrorMessage(`Error saving server type: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'ollamaServerTypeError', error: 'Server type empty.' });
                        notificationService.showErrorMessage('Server type is empty.');
                    }
                    break;
                case 'saveLocalOllamaApiUrl':
                    const localApiUrlToSave = data.apiUrl;
                    if (localApiUrlToSave && typeof localApiUrlToSave === 'string') {
                        try {
                            await storageService.saveLocalOllamaApiUrl(localApiUrlToSave);
                            panel.webview.postMessage({ command: 'localOllamaApiUrlSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Local Ollama API URL saved.');
                        } catch (error: any) {
                            console.error('Error saving local Ollama API URL:', error);
                            panel.webview.postMessage({ command: 'localOllamaApiUrlError', error: error.message });
                            notificationService.showErrorMessage(`Error saving local API URL: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'localOllamaApiUrlError', error: 'API URL empty.' });
                        notificationService.showErrorMessage('Local API URL is empty.');
                    }
                    break;
                case 'saveLocalOllamaEndpoint':
                    const localEndpointToSave = data.endpoint;
                    if (localEndpointToSave && typeof localEndpointToSave === 'string') {
                        try {
                            await storageService.saveLocalOllamaEndpoint(localEndpointToSave);
                            panel.webview.postMessage({ command: 'localOllamaEndpointSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Local Ollama endpoint saved.');
                        } catch (error: any) {
                            console.error('Error saving local Ollama endpoint:', error);
                            panel.webview.postMessage({ command: 'localOllamaEndpointError', error: error.message });
                            notificationService.showErrorMessage(`Error saving local endpoint: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'localOllamaEndpointError', error: 'Endpoint empty.' });
                        notificationService.showErrorMessage('Local endpoint is empty.');
                    }
                    break;
                case 'saveRemoteOllamaApiUrl':
                    const remoteApiUrlToSave = data.apiUrl;
                    if (remoteApiUrlToSave && typeof remoteApiUrlToSave === 'string') {
                        try {
                            await storageService.saveRemoteOllamaApiUrl(remoteApiUrlToSave);
                            panel.webview.postMessage({ command: 'remoteOllamaApiUrlSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Remote Ollama API URL saved.');
                        } catch (error: any) {
                            console.error('Error saving remote Ollama API URL:', error);
                            panel.webview.postMessage({ command: 'remoteOllamaApiUrlError', error: error.message });
                            notificationService.showErrorMessage(`Error saving remote API URL: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'remoteOllamaApiUrlError', error: 'API URL empty.' });
                        notificationService.showErrorMessage('Remote API URL is empty.');
                    }
                    break;
                case 'saveRemoteOllamaEndpoint':
                    const remoteEndpointToSave = data.endpoint;
                    if (remoteEndpointToSave && typeof remoteEndpointToSave === 'string') {
                        try {
                            await storageService.saveRemoteOllamaEndpoint(remoteEndpointToSave);
                            panel.webview.postMessage({ command: 'remoteOllamaEndpointSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Remote Ollama endpoint saved.');
                        } catch (error: any) {
                            console.error('Error saving remote Ollama endpoint:', error);
                            panel.webview.postMessage({ command: 'remoteOllamaEndpointError', error: error.message });
                            notificationService.showErrorMessage(`Error saving remote endpoint: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'remoteOllamaEndpointError', error: 'Endpoint empty.' });
                        notificationService.showErrorMessage('Remote endpoint is empty.');
                    }
                    break;
                case 'saveRemoteOllamaModel':
                    const remoteModelToSave = data.model;
                    if (remoteModelToSave && typeof remoteModelToSave === 'string') {
                        try {
                            await storageService.saveRemoteOllamaModel(remoteModelToSave);
                            panel.webview.postMessage({ command: 'remoteOllamaModelSaved' });
                            notificationService.showInfoMessage('AIDEV-IDE: Remote Ollama model saved.');
                        } catch (error: any) {
                            console.error('Error saving remote Ollama model:', error);
                            panel.webview.postMessage({ command: 'remoteOllamaModelError', error: error.message });
                            notificationService.showErrorMessage(`Error saving remote model: ${error.message}`);
                        }
                    } else {
                        panel.webview.postMessage({ command: 'remoteOllamaModelError', error: 'Model empty.' });
                        notificationService.showErrorMessage('Remote model is empty.');
                    }
                    break;
            }
        }
    );

    // webview를 전역 배열에 등록
    allWebviews.push(panel.webview);

    // 패널이 dispose될 때 배열에서 제거
    panel.onDidDispose(() => {
        const idx = allWebviews.indexOf(panel.webview);
        if (idx !== -1) {
            allWebviews.splice(idx, 1);
        }
    }, undefined, context.subscriptions);

    return panel;
}

/**
 * AIDEV-IDE 라이선스 패널을 엽니다.
 */
export function openLicensePanel(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    viewColumn: vscode.ViewColumn,
    storageService: StorageService,
    geminiApi: GeminiApi,
    notificationService: NotificationService, // NotificationService 주입
    configurationService: ConfigurationService // ConfigurationService 주입
) {
    const panel = createAndSetupWebviewPanel(extensionUri, context, 'license', 'AIDEV-IDE License & Copyright', 'license', viewColumn,
        async (data, panel) => {
            switch (data.command) {
                case 'saveApiKey':
                    const apiKeyToSave = data.apiKey;
                    if (apiKeyToSave && typeof apiKeyToSave === 'string') {
                        try {
                            await storageService.saveApiKey(apiKeyToSave);
                            geminiApi.updateApiKey(apiKeyToSave);
                            panel.webview.postMessage({ command: 'apiKeySaved', message: 'API Key saved!' });
                            notificationService.showInfoMessage('AIDEV-IDE: API Key saved.'); // NotificationService 사용
                        } catch (error: any) {
                            panel.webview.postMessage({ command: 'apiKeySaveError', error: error.message });
                            notificationService.showErrorMessage(`Error saving API Key: ${error.message}`); // NotificationService 사용
                        }
                    } else {
                        panel.webview.postMessage({ command: 'apiKeySaveError', error: 'API Key empty.' });
                        notificationService.showErrorMessage('API Key is empty.'); // NotificationService 사용
                    }
                    break;
                case 'checkApiKeyStatus':
                    const currentKey = await storageService.getApiKey();
                    panel.webview.postMessage({ command: 'apiKeyStatus', hasKey: !!currentKey, apiKeyPreview: currentKey ? `***${currentKey.slice(-4)}` : 'Not Set' });
                    break;
                case 'getLanguage':
                    try {
                        const language = await configurationService.getLanguage();
                        panel.webview.postMessage({ command: 'currentLanguage', language: language });
                    } catch (error: any) {
                        // 오류 시 기본값 반환
                        panel.webview.postMessage({ command: 'currentLanguage', language: 'ko' });
                    }
                    break;
                case 'getLanguageData':
                    try {
                        const language = data.language;
                        if (language && typeof language === 'string') {
                            // 언어 파일 경로
                            const languageFilePath = vscode.Uri.joinPath(extensionUri, 'webview', 'locales', `lang_${language}.json`);

                            // 파일 읽기
                            const fileContent = await vscode.workspace.fs.readFile(languageFilePath);
                            const languageData = JSON.parse(Buffer.from(fileContent).toString('utf8'));

                            // 웹뷰에 언어 데이터 전송
                            panel.webview.postMessage({
                                command: 'languageDataReceived',
                                language: language,
                                data: languageData
                            });
                        }
                    } catch (error: any) {
                        console.error('Error loading language data:', error);
                        // 오류 시 기본 한국어 데이터 반환
                        try {
                            const defaultLanguagePath = vscode.Uri.joinPath(extensionUri, 'webview', 'locales', 'lang_ko.json');
                            const defaultContent = await vscode.workspace.fs.readFile(defaultLanguagePath);
                            const defaultData = JSON.parse(Buffer.from(defaultContent).toString('utf8'));
                            panel.webview.postMessage({
                                command: 'languageDataReceived',
                                language: 'ko',
                                data: defaultData
                            });
                        } catch (fallbackError) {
                            console.error('Error loading fallback language data:', fallbackError);
                        }
                    }
                    break;
            }
        }
    );

    // webview를 전역 배열에 등록
    allWebviews.push(panel.webview);

    // 패널이 dispose될 때 배열에서 제거
    panel.onDidDispose(() => {
        const idx = allWebviews.indexOf(panel.webview);
        if (idx !== -1) {
            allWebviews.splice(idx, 1);
        }
    }, undefined, context.subscriptions);

    return panel;
}
