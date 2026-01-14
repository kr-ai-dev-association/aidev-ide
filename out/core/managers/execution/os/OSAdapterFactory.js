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
exports.OSAdapterFactory = void 0;
const os = __importStar(require("os"));
const DarwinAdapter_1 = require("./DarwinAdapter");
const WindowsAdapter_1 = require("./WindowsAdapter");
const LinuxAdapter_1 = require("./LinuxAdapter");
/**
 * OS 어댑터 팩토리
 * 현재 OS를 감지하고 적절한 어댑터를 반환
 */
class OSAdapterFactory {
    static instance = null;
    static detectionResult = null;
    /**
     * 현재 OS에 맞는 어댑터 인스턴스 반환 (싱글톤)
     */
    static getInstance() {
        if (!this.instance) {
            this.instance = this.createAdapter();
        }
        return this.instance;
    }
    /**
     * OS 감지 결과 반환
     */
    static detect() {
        if (!this.detectionResult) {
            const platform = os.platform();
            switch (platform) {
                case 'darwin':
                    this.detectionResult = DarwinAdapter_1.DarwinAdapter.detect();
                    break;
                case 'win32':
                    this.detectionResult = WindowsAdapter_1.WindowsAdapter.detect();
                    break;
                case 'linux':
                    this.detectionResult = LinuxAdapter_1.LinuxAdapter.detect();
                    break;
                default:
                    // 기본값은 Linux
                    console.warn(`[OSAdapterFactory] Unknown platform: ${platform}, using Linux adapter`);
                    this.detectionResult = LinuxAdapter_1.LinuxAdapter.detect();
            }
        }
        return this.detectionResult;
    }
    /**
     * OS 어댑터 생성
     */
    static createAdapter() {
        const platform = os.platform();
        switch (platform) {
            case 'darwin':
                console.log('[OSAdapterFactory] Using macOS (Darwin) adapter');
                return new DarwinAdapter_1.DarwinAdapter();
            case 'win32':
                console.log('[OSAdapterFactory] Using Windows adapter');
                return new WindowsAdapter_1.WindowsAdapter();
            case 'linux':
                console.log('[OSAdapterFactory] Using Linux adapter');
                return new LinuxAdapter_1.LinuxAdapter();
            default:
                console.warn(`[OSAdapterFactory] Unknown platform: ${platform}, using Linux adapter as fallback`);
                return new LinuxAdapter_1.LinuxAdapter();
        }
    }
    /**
     * 특정 OS 어댑터 강제 생성 (테스트용)
     */
    static createAdapterForOS(osType) {
        switch (osType) {
            case 'darwin':
                return new DarwinAdapter_1.DarwinAdapter();
            case 'win32':
                return new WindowsAdapter_1.WindowsAdapter();
            case 'linux':
                return new LinuxAdapter_1.LinuxAdapter();
        }
    }
    /**
     * 인스턴스 초기화 (테스트용)
     */
    static reset() {
        this.instance = null;
        this.detectionResult = null;
    }
}
exports.OSAdapterFactory = OSAdapterFactory;
//# sourceMappingURL=OSAdapterFactory.js.map