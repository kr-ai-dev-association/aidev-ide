"use strict";
/**
 * Configuration Service
 * vscode.workspace.getConfiguration의 반복 호출을 추상화하고 캐싱을 제공
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
exports.ConfigurationService = void 0;
const vscode = __importStar(require("vscode"));
/**
 * ConfigurationService
 * VS Code 설정을 효율적으로 관리하는 서비스
 */
class ConfigurationService {
    static config = null;
    static configSection = 'codepilot';
    /**
     * Configuration 객체를 가져옵니다 (캐싱됨)
     */
    static getConfig() {
        if (!ConfigurationService.config) {
            ConfigurationService.config = vscode.workspace.getConfiguration(ConfigurationService.configSection);
        }
        return ConfigurationService.config;
    }
    /**
     * 설정값을 가져옵니다
     */
    static get(key, defaultValue) {
        const config = ConfigurationService.getConfig();
        const value = config.get(key);
        if (value !== undefined) {
            return value;
        }
        return defaultValue;
    }
    /**
     * 설정값을 업데이트합니다
     */
    static async updateConfig(key, value, target = vscode.ConfigurationTarget.Global) {
        const config = ConfigurationService.getConfig();
        await config.update(key, value, target);
        // 설정 변경 시 캐시 무효화
        ConfigurationService.invalidateCache();
    }
    /**
     * 설정 변경을 감지하기 위해 캐시를 무효화합니다
     */
    static invalidateCache() {
        ConfigurationService.config = null;
    }
    /**
     * 설정 섹션을 변경합니다 (테스트용)
     */
    static setConfigSection(section) {
        ConfigurationService.configSection = section;
        ConfigurationService.config = null;
    }
}
exports.ConfigurationService = ConfigurationService;
//# sourceMappingURL=ConfigurationService.js.map