import * as vscode from 'vscode';
export class NotificationService {
    /**
     * 정보 메시지를 사용자에게 표시합니다.
     */
    showInfoMessage(message) {
        vscode.window.showInformationMessage(message);
    }
    /**
     * 경고 메시지를 사용자에게 표시합니다.
     */
    showWarningMessage(message) {
        vscode.window.showWarningMessage(message);
    }
    /**
     * 에러 메시지를 사용자에게 표시합니다.
     */
    showErrorMessage(message) {
        vscode.window.showErrorMessage(message);
    }
}
//# sourceMappingURL=NotificationService.js.map