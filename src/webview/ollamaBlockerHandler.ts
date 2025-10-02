import * as vscode from 'vscode';
import { OllamaBlockerService } from '../services/ollamaBlockerService';

/**
 * Ollama Blocker 메시지 처리 함수
 */
export function handleOllamaBlockerMessage(data: any, panel: vscode.WebviewPanel, ollamaBlockerService: OllamaBlockerService) {
    switch (data.command) {
        case 'startOllamaBlocker':
            ollamaBlockerService.start().then(result => {
                panel.webview.postMessage({
                    command: 'ollamaBlockerResult',
                    success: result.success,
                    message: result.message
                });
            });
            break;
        case 'stopOllamaBlocker':
            ollamaBlockerService.stop().then(result => {
                panel.webview.postMessage({
                    command: 'ollamaBlockerResult',
                    success: result.success,
                    message: result.message
                });
            });
            break;
        case 'ollamaBlockerStatus':
            ollamaBlockerService.getStatus().then(status => {
                panel.webview.postMessage({
                    command: 'ollamaBlockerStatusResult',
                    running: status.running,
                    message: status.message
                });
            });
            break;
        case 'killOllamaProcesses':
            ollamaBlockerService.killOllamaProcesses().then(result => {
                panel.webview.postMessage({
                    command: 'ollamaBlockerResult',
                    success: result.success,
                    message: result.message
                });
            });
            break;
        case 'ollamaBlockerAuth':
            ollamaBlockerService.authenticate(data.serialNumber).then(result => {
                panel.webview.postMessage({
                    command: 'ollamaBlockerAuthResult',
                    success: result.success,
                    message: result.message
                });
            });
            break;
    }
}
