import * as fs from 'fs';
import * as path from 'path';

export class LocaleService {
    /**
     * 언어 데이터(JSON)를 로드합니다. 여러 경로를 순서대로 탐색합니다.
     */
    static loadLanguageData(language: string): any {
        const candidates = [
            path.join(__dirname, '..', 'locales', `lang_${language}.json`),
            path.join(__dirname, '..', '..', 'locales', `lang_${language}.json`),
            path.join(__dirname, '..', '..', '..', 'locales', `lang_${language}.json`),
            path.join(process.cwd(), 'webview', 'locales', `lang_${language}.json`),
            path.join(process.cwd(), 'aidev-ide', 'webview', 'locales', `lang_${language}.json`),
        ];

        for (const p of candidates) {
            if (fs.existsSync(p)) {
                try {
                    const content = fs.readFileSync(p, 'utf8');
                    return JSON.parse(content);
                } catch (e) {
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
                } catch (e) {
                    console.error('[LocaleService] Failed to load fallback locale file:', p, e);
                    return {};
                }
            }
        }

        console.warn('[LocaleService] No locale file found, returning empty object');
        return {};
    }
}

