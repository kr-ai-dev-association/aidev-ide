/**
 * Hot Load Manager
 * sql.js를 사용한 SQLite DB 기반 Hot Load 관리
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

export class HotLoadManager {
    private static instance: HotLoadManager;
    private db: any = null;
    private dbPath: string;
    private initialized: boolean = false;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        // globalStorageUri에 DB 저장 (확장 데이터 디렉토리)
        this.dbPath = path.join(context.globalStorageUri.fsPath, 'hotload.db');
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
     * DB 초기화
     */
    public async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // sql.js 동적 import
            const initSqlJs = (await import('sql.js')).default;

            // sql.js 초기화
            const SQL = await initSqlJs({
                // WASM 파일 로드 (CDN 사용)
                locateFile: (file: string) => `https://sql.js.org/dist/${file}`
            });

            // 디렉토리 생성
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // 기존 DB 파일이 있으면 로드
            if (fs.existsSync(this.dbPath)) {
                const fileBuffer = fs.readFileSync(this.dbPath);
                this.db = new SQL.Database(fileBuffer);
            } else {
                this.db = new SQL.Database();
            }

            // 테이블 생성
            this.db.run(`
                CREATE TABLE IF NOT EXISTS hot_loads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    keywords TEXT NOT NULL,
                    description TEXT NOT NULL,
                    command TEXT NOT NULL,
                    created_at TEXT DEFAULT (datetime('now'))
                )
            `);

            this.saveDatabase();
            this.initialized = true;
            console.log('[HotLoadManager] Database initialized at:', this.dbPath);
        } catch (error) {
            console.error('[HotLoadManager] Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * DB를 파일에 저장
     */
    private saveDatabase(): void {
        if (!this.db) return;
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        } catch (error) {
            console.error('[HotLoadManager] Failed to save database:', error);
        }
    }

    /**
     * Hot Load 항목 추가
     */
    public async addHotLoad(keywords: string, description: string, command: string): Promise<number> {
        await this.initialize();
        if (!this.db) throw new Error('Database not initialized');

        this.db.run(
            'INSERT INTO hot_loads (keywords, description, command) VALUES (?, ?, ?)',
            [keywords, description, command]
        );
        this.saveDatabase();

        const result = this.db.exec('SELECT last_insert_rowid() as id');
        const id = result[0]?.values[0]?.[0] as number || 0;
        console.log('[HotLoadManager] Added Hot Load:', id);
        return id;
    }

    /**
     * Hot Load 항목 수정
     */
    public async updateHotLoad(id: number, keywords: string, description: string, command: string): Promise<void> {
        await this.initialize();
        if (!this.db) throw new Error('Database not initialized');

        this.db.run(
            'UPDATE hot_loads SET keywords = ?, description = ?, command = ? WHERE id = ?',
            [keywords, description, command, id]
        );
        this.saveDatabase();
        console.log('[HotLoadManager] Updated Hot Load:', id);
    }

    /**
     * Hot Load 항목 삭제
     */
    public async deleteHotLoad(id: number): Promise<void> {
        await this.initialize();
        if (!this.db) throw new Error('Database not initialized');

        this.db.run('DELETE FROM hot_loads WHERE id = ?', [id]);
        this.saveDatabase();
        console.log('[HotLoadManager] Deleted Hot Load:', id);
    }

    /**
     * 특정 Hot Load 항목 조회
     */
    public async getHotLoad(id: number): Promise<HotLoadItem | null> {
        await this.initialize();
        if (!this.db) throw new Error('Database not initialized');

        const result = this.db.exec(
            'SELECT id, keywords, description, command, created_at FROM hot_loads WHERE id = ?',
            [id]
        );

        if (!result.length || !result[0].values.length) return null;

        const row = result[0].values[0];
        return {
            id: row[0] as number,
            keywords: row[1] as string,
            description: row[2] as string,
            command: row[3] as string,
            createdAt: row[4] as string
        };
    }

    /**
     * 모든 Hot Load 항목 조회
     */
    public async getAllHotLoads(): Promise<HotLoadItem[]> {
        await this.initialize();
        if (!this.db) throw new Error('Database not initialized');

        const result = this.db.exec('SELECT id, keywords, description, command, created_at FROM hot_loads ORDER BY id');
        if (!result.length) return [];

        return result[0].values.map((row: any[]) => ({
            id: row[0] as number,
            keywords: row[1] as string,
            description: row[2] as string,
            command: row[3] as string,
            createdAt: row[4] as string
        }));
    }

    /**
     * 프롬프트용 Hot Load 섹션 생성
     * Hot Load가 없으면 빈 문자열 반환
     */
    public async getPromptSection(): Promise<string> {
        try {
            const hotLoads = await this.getAllHotLoads();
            if (hotLoads.length === 0) return '';

            const itemsText = hotLoads.map((item, idx) =>
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
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        this.initialized = false;
        console.log('[HotLoadManager] Disposed');
    }
}
