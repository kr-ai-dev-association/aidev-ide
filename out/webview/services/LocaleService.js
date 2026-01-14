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
exports.LocaleService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LocaleService {
    /**
     * 언어 데이터(JSON)를 로드합니다. 여러 경로를 순서대로 탐색합니다.
     */
    static loadLanguageData(language) {
        const candidates = [
            path.join(__dirname, '..', 'locales', `lang_${language}.json`),
            path.join(__dirname, '..', '..', 'locales', `lang_${language}.json`),
            path.join(__dirname, '..', '..', '..', 'locales', `lang_${language}.json`),
            path.join(__dirname, '..', 'webview', 'locales', `lang_${language}.json`), // dist/../webview/locales
            path.join(__dirname, '..', '..', 'webview', 'locales', `lang_${language}.json`), // dist/../../webview/locales
            path.join(process.cwd(), 'webview', 'locales', `lang_${language}.json`),
            path.join(process.cwd(), 'codepilot', 'webview', 'locales', `lang_${language}.json`),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                try {
                    const content = fs.readFileSync(p, 'utf8');
                    return JSON.parse(content);
                }
                catch (e) {
                    console.error('[LocaleService] Failed to load locale file:', p, e);
                    return {};
                }
            }
        }
        // fallback: 영어
        const fallback = candidates.map(c => c.replace(`lang_${language}.json`, 'lang_en.json'));
        for (const p of fallback) {
            if (fs.existsSync(p)) {
                try {
                    const content = fs.readFileSync(p, 'utf8');
                    return JSON.parse(content);
                }
                catch (e) {
                    console.error('[LocaleService] Failed to load fallback locale file:', p, e);
                    return {};
                }
            }
        }
        // console.warn('[LocaleService] No locale file found, returning empty object');
        return {};
    }
}
exports.LocaleService = LocaleService;
//# sourceMappingURL=LocaleService.js.map