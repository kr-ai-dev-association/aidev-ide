console.log('[ExternalApiService] Module loading...');
console.log('[ExternalApiService] Importing StateManager...');
import { StateManager } from '../../core/managers/state/StateManager';
console.log('[ExternalApiService] StateManager imported');
export class ExternalApiService {
    stateManager;
    constructor(context) {
        this.stateManager = StateManager.getInstance(context);
    }
}
//# sourceMappingURL=ExternalApiService.js.map