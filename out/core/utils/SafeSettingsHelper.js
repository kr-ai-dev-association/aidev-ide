"use strict";
/**
 * Safe Settings Helper
 * 설정값을 안전하게 가져오는 유틸리티 클래스
 * 에러 발생 시 기본값을 반환하여 안정성을 보장합니다
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeSettingsHelper = void 0;
const SettingsManager_1 = require("../managers/state/SettingsManager");
class SafeSettingsHelper {
    /**
     * 안전하게 설정값을 가져옵니다. 에러 발생 시 기본값을 반환합니다.
     */
    static async getSettingSafely(getter, defaultValue) {
        try {
            return await getter();
        }
        catch (error) {
            console.warn('[SafeSettingsHelper] Failed to get setting, using default:', error);
            return defaultValue;
        }
    }
    /**
     * 자동 수정 활성화 여부를 안전하게 가져옵니다.
     */
    static async isAutoCorrectionEnabled() {
        return SafeSettingsHelper.getSettingSafely(() => SettingsManager_1.SettingsManager.getInstance().isAutoCorrectionEnabled(), true);
    }
}
exports.SafeSettingsHelper = SafeSettingsHelper;
//# sourceMappingURL=SafeSettingsHelper.js.map