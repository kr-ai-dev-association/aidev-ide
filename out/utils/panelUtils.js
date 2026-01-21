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
exports.safePostMessage = safePostMessage;
exports.getNonce = getNonce;
exports.getHtmlContentWithUris = getHtmlContentWithUris;
exports.createAndSetupWebviewPanel = createAndSetupWebviewPanel;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const debugLogger_1 = require("./debugLogger");
/**
 * webview가 유효한지 확인하고 안전하게 메시지를 보내는 함수
 */
function safePostMessage(webview, message) {
    try {
        if (webview) {
            try {
                const cmd = String(message?.command || '');
                if (cmd) {
                    const step = message?.step ? ` step=${message.step}` : '';
                    const status = message?.status ? ` status=${String(message.status).slice(0, 200)}` : '';
                    if (/updateProcessingStatus|hideProcessingSteps|hideLoading|hideAutoCorrecting|showRunExecution|hideRunExecution|showCalloutExecuting|hideCalloutExecuting|showErrorCorrection|showErrorCorrectionSuccess/i.test(cmd)) {
                        (0, debugLogger_1.debugLog)(`PanelUtils: postMessage ${cmd}${step}${status}`);
                    }
                }
            }
            catch { /* ignore debug log errors */ }
            webview.postMessage(message);
            return true;
        }
        return false;
    }
    catch (error) {
        console.warn('Failed to post message to webview:', error);
        return false;
    }
}
/**
 * 범용 논스(nonce) 값을 생성합니다.
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
/**
 * 웹뷰 HTML 콘텐츠를 로드하고, 필요한 URI들을 변환하여 반환합니다.
 */
function getHtmlContentWithUris(extensionUri, htmlFileName, webview) {
    const htmlFilePathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview', `${htmlFileName}.html`);
    let htmlContent = '';
    const nonce = getNonce();
    try {
        htmlContent = fs.readFileSync(htmlFilePathOnDisk.fsPath, 'utf8');
        const commonStylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));
        const specificStylesUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', `${htmlFileName}.css`));
        htmlContent = htmlContent
            .replace(/\{\{nonce\}\}/g, nonce)
            .replace(/\{\{cspSource\}\}/g, webview.cspSource)
            .replace('{{commonStylesUri}}', commonStylesUri.toString())
            .replace(`{{${htmlFileName}StylesUri}}`, specificStylesUri.toString());
        // 스크립트 URI (파일별로 다를 수 있음)
        let mainScriptUri = '';
        let secondaryScriptUri = '';
        if (htmlFileName === 'chat') {
            mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'chat.js')).toString();
            secondaryScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'codeCopy.js')).toString();
            htmlContent = htmlContent.replace('{{codeCopyScriptUri}}', secondaryScriptUri);
            // 아이콘 리소스 (chat 전용)
            const clipIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'clip.svg')).toString();
            const historyIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'history.svg')).toString();
            const stopIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'stop.svg')).toString();
            const sendIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'send.svg')).toString();
            const dropdownIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dropdown.svg')).toString();
            // 아이콘 URI 치환 (여러 위치 대응 위해 replaceAll)
            htmlContent = htmlContent
                .replace(/{{clipIconUri}}/g, clipIconUri)
                .replace(/{{historyIconUri}}/g, historyIconUri)
                .replace(/{{stopIconUri}}/g, stopIconUri)
                .replace(/{{sendIconUri}}/g, sendIconUri)
                .replace(/{{dropdownIconUri}}/g, dropdownIconUri);
        }
        else if (htmlFileName === 'ask') {
            mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'ask.js')).toString();
            secondaryScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'codeCopy.js')).toString();
            htmlContent = htmlContent.replace('{{codeCopyScriptUri}}', secondaryScriptUri);
        }
        else if (htmlFileName === 'settings') {
            mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'settings.js')).toString();
        }
        else if (htmlFileName === 'license') {
            mainScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'license.js')).toString();
        }
        htmlContent = htmlContent.replace('{{scriptUri}}', mainScriptUri);
    }
    catch (error) {
        console.error(`[HTML Loader] Error for ${htmlFileName}.html:`, error);
        return `<h1>Error loading ${htmlFileName} view</h1><p>${error.message || 'File not found.'}</p>`;
    }
    return htmlContent;
}
/**
 * 새 웹뷰 패널을 생성하고 설정합니다.
 */
function createAndSetupWebviewPanel(extensionUri, contextForSubs, panelTypeSuffix, panelTitle, htmlFileName, viewColumn = vscode.ViewColumn.One, onDidReceiveMessage) {
    const panel = vscode.window.createWebviewPanel(`codepilot'.${panelTypeSuffix.toLowerCase()}`, panelTitle, viewColumn, {
        enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [
            extensionUri,
            vscode.Uri.joinPath(extensionUri, 'webview'),
            vscode.Uri.joinPath(extensionUri, 'media'),
            vscode.Uri.joinPath(extensionUri, 'dist'),
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
        ]
    });
    panel.webview.html = getHtmlContentWithUris(extensionUri, htmlFileName, panel.webview);
    panel.onDidDispose(() => { }, undefined, contextForSubs.subscriptions);
    if (onDidReceiveMessage) {
        panel.webview.onDidReceiveMessage(async (data) => {
            await onDidReceiveMessage(data, panel);
        }, undefined, contextForSubs.subscriptions);
    }
    panel.reveal(viewColumn);
    return panel;
}
//# sourceMappingURL=panelUtils.js.map