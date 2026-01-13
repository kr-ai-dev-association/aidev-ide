import * as vscode from 'vscode';
console.log('[ExternalApiService] Module loading...');
console.log('[ExternalApiService] Importing StateManager...');
import { StateManager } from '../../core/managers/state/StateManager';
console.log('[ExternalApiService] StateManager imported');

export class ExternalApiService {
    private stateManager: StateManager;

    constructor(context: vscode.ExtensionContext) {
        this.stateManager = StateManager.getInstance(context);
    }

}

