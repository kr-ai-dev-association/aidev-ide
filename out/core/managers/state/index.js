"use strict";
/**
 * State/Session Manager Module
 * 전역 상태 및 세션을 유지
 */
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationService = exports.SettingsManager = exports.SessionManager = exports.StateManager = void 0;
__exportStar(require("./types"), exports);
var StateManager_1 = require("./StateManager");
Object.defineProperty(exports, "StateManager", { enumerable: true, get: function () { return StateManager_1.StateManager; } });
var SessionManager_1 = require("./SessionManager");
Object.defineProperty(exports, "SessionManager", { enumerable: true, get: function () { return SessionManager_1.SessionManager; } });
var SettingsManager_1 = require("./SettingsManager");
Object.defineProperty(exports, "SettingsManager", { enumerable: true, get: function () { return SettingsManager_1.SettingsManager; } });
var ConfigurationService_1 = require("./ConfigurationService");
Object.defineProperty(exports, "ConfigurationService", { enumerable: true, get: function () { return ConfigurationService_1.ConfigurationService; } });
//# sourceMappingURL=index.js.map