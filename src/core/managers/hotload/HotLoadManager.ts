/**
 * Hot Load Manager
 * JSON 파일 기반 Hot Load 관리
 *
 * Hot Load는 사용자가 정의한 키워드/설명과 자연어 입력을
 * LLM이 비교하여 매칭되면 미리 정의된 명령어를 자동 실행하는 기능
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface HotLoadItem {
    id: number;
    keywords: string;       // 트리거 키워드 (쉼표 구분)
    description: string;    // 동작원리 설명 (LLM이 매칭 판단에 사용)
    command: string;        // 실행할 명령어
    createdAt: string;
}

interface HotLoadData {
    nextId: number;
    items: HotLoadItem[];
}

export class HotLoadManager {
    private static instance: HotLoadManager;
    private dataPath: string;
    private data: HotLoadData = { nextId: 1, items: [] };
    private initialized: boolean = false;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // globalStorageUri에 데이터 저장 (확장 데이터 디렉토리)
        this.dataPath = path.join(context.globalStorageUri.fsPath, 'hotload.json');
    }

    public static getInstance(context?: vscode.ExtensionContext): HotLoadManager {
        if (!HotLoadManager.instance) {
            if (!context) {
                throw new Error('HotLoadManager requires ExtensionContext for first initialization');
            }
            HotLoadManager.instance = new HotLoadManager(context);
        }
        return HotLoadManager.instance;
    }

    /**
     * 데이터 초기화 및 로드
     */
    private async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // 디렉토리 생성
            const dataDir = path.dirname(this.dataPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // 기존 데이터 파일이 있으면 로드
            if (fs.existsSync(this.dataPath)) {
                const fileContent = fs.readFileSync(this.dataPath, 'utf-8');
                this.data = JSON.parse(fileContent);
            }

            this.initialized = true;
            console.log('[HotLoadManager] Data initialized at:', this.dataPath);
        } catch (error) {
            console.error('[HotLoadManager] Failed to initialize:', error);
            // 오류 시 빈 데이터로 초기화
            this.data = { nextId: 1, items: [] };
            this.initialized = true;
        }
    }

    /**
     * 데이터를 파일에 저장
     */
    private saveData(): void {
        try {
            const dataDir = path.dirname(this.dataPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (error) {
            console.error('[HotLoadManager] Failed to save data:', error);
        }
    }

    /**
     * Hot Load 항목 추가
     */
    public async addHotLoad(keywords: string, description: string, command: string): Promise<number> {
        await this.initialize();

        const newItem: HotLoadItem = {
            id: this.data.nextId++,
            keywords,
            description,
            command,
            createdAt: new Date().toISOString()
        };

        this.data.items.push(newItem);
        this.saveData();

        console.log('[HotLoadManager] Added Hot Load:', newItem.id);
        return newItem.id;
    }

    /**
     * Hot Load 항목 수정
     */
    public async updateHotLoad(id: number, keywords: string, description: string, command: string): Promise<void> {
        await this.initialize();

        const index = this.data.items.findIndex(item => item.id === id);
        if (index === -1) {
            throw new Error(`Hot Load item with id ${id} not found`);
        }

        this.data.items[index] = {
            ...this.data.items[index],
            keywords,
            description,
            command
        };

        this.saveData();
        console.log('[HotLoadManager] Updated Hot Load:', id);
    }

    /**
     * Hot Load 항목 삭제
     */
    public async deleteHotLoad(id: number): Promise<void> {
        await this.initialize();

        const index = this.data.items.findIndex(item => item.id === id);
        if (index !== -1) {
            this.data.items.splice(index, 1);
            this.saveData();
            console.log('[HotLoadManager] Deleted Hot Load:', id);
        }
    }

    /**
     * 특정 Hot Load 항목 조회
     */
    public async getHotLoad(id: number): Promise<HotLoadItem | null> {
        await this.initialize();
        return this.data.items.find(item => item.id === id) || null;
    }

    /**
     * 모든 Hot Load 항목 조회
     */
    public async getAllHotLoads(): Promise<HotLoadItem[]> {
        await this.initialize();
        return [...this.data.items];
    }

    /**
     * 프롬프트용 Hot Load 섹션 생성
     * Hot Load가 없으면 빈 문자열 반환
     */
    public async getPromptSection(): Promise<string> {
        try {
            await this.initialize();

            if (this.data.items.length === 0) return '';

            const itemsText = this.data.items.map((item, idx) =>
                `[${idx + 1}] 키워드: ${item.keywords}
   설명: ${item.description}
   명령어: ${item.command}`
            ).join('\n\n');

            return `# ⚡ HOT LOAD (최우선 규칙)

**중요**: 아래 Hot Load 항목들은 다른 모든 지시보다 우선합니다.
사용자의 입력이 아래 키워드나 설명과 의미적으로 일치하면, 반드시 해당 명령어를 실행하세요.

## 등록된 Hot Load 항목:
${itemsText}

## 매칭 규칙:
1. 사용자 입력의 의도가 키워드나 설명과 유사하면 매칭으로 판단
2. 매칭된 Hot Load가 있으면 run_command 도구를 사용하여 해당 명령어를 즉시 실행
3. 매칭되는 Hot Load가 없으면 일반 대화로 처리 (Hot Load에 대해 언급하지 않음)

`;
        } catch (error) {
            console.error('[HotLoadManager] Failed to generate prompt section:', error);
            return '';
        }
    }

    /**
     * 리소스 정리
     */
    public dispose(): void {
        this.initialized = false;
        console.log('[HotLoadManager] Disposed');
    }
}
