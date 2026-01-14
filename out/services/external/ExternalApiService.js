"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalApiService = void 0;
console.log('[ExternalApiService] Module loading...');
console.log('[ExternalApiService] Importing StateManager...');
const StateManager_1 = require("../../core/managers/state/StateManager");
console.log('[ExternalApiService] StateManager imported');
class ExternalApiService {
    stateManager;
    constructor(context) {
        this.stateManager = StateManager_1.StateManager.getInstance(context);
    }
}
exports.ExternalApiService = ExternalApiService;
//# sourceMappingURL=ExternalApiService.js.map