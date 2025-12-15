import * as fs from 'fs';
import * as path from 'path';

export class SupportedModelService {
    /**
     * 지원되는 Ollama 모델 목록을 로드합니다.
     * 여러 경로를 탐색하며, 첫 번째로 발견한 파일을 사용합니다.
     */
    static loadSupportedModels(): any[] {
        const cwd = process.cwd();
        const candidates = [
            path.join(cwd, 'supported_ollama_model.json'),
            path.join(cwd, 'aidev-ide', 'supported_ollama_model.json'),
            path.join(__dirname, '..', '..', 'supported_ollama_model.json'),
            path.join(__dirname, '..', '..', '..', 'supported_ollama_model.json'),
            path.join(__dirname, '..', '..', '..', '..', 'supported_ollama_model.json'),
        ];

        for (const p of candidates) {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                try {
                    const parsed = JSON.parse(content);
                    return parsed.models || [];
                } catch (e) {
                    console.error('[SupportedModelService] Failed to parse model file:', p, e);
                    return [];
                }
            }
        }

        console.warn('[SupportedModelService] supported_ollama_model.json not found in known paths');
        return [];
    }
}

