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
    description: string;    // 동작원리 설명 (LLM이 매칭 판단에 사용, 인자 형식 포함 가능)
                            // 예: "에이전트 생성. 인자: --name <이름:영문> --port <포트:31100~31200>"
    command: string;        // 실행할 명령어 (기본)
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
        // 최신 데이터 로드
        await this.reloadData();
        console.log(`[HotLoadManager] 📋 getAllHotLoads called: ${this.data.items.length} items`);
        return [...this.data.items];
    }

    /**
     * 사용자 쿼리가 Hot Load 키워드와 매칭되는지 확인
     * @returns 매칭된 Hot Load 항목 또는 null
     */
    public async matchQuery(query: string): Promise<HotLoadItem | null> {
        // 🔥 매번 최신 데이터 로드 (Settings에서 추가한 항목 반영)
        await this.reloadData();

        console.log(`[HotLoadManager] 🔍 matchQuery called: query="${query}", items=${this.data.items.length}`);

        if (this.data.items.length === 0) {
            console.log(`[HotLoadManager] 🔍 No Hot Load items registered`);
            return null;
        }

        const normalizedQuery = query.toLowerCase().trim();
        console.log(`[HotLoadManager] 🔍 Checking against keywords: ${this.data.items.map(i => i.keywords).join(', ')}`);

        for (const item of this.data.items) {
            // 쉼표로 구분된 키워드들을 배열로 변환
            const keywords = item.keywords.split(',').map(k => k.trim().toLowerCase());

            // 키워드 중 하나라도 쿼리에 포함되면 매칭
            for (const keyword of keywords) {
                if (keyword && normalizedQuery.includes(keyword)) {
                    console.log(`[HotLoadManager] 🔥 Query matched Hot Load: keyword="${keyword}", command="${item.command}"`);
                    return item;
                }
            }
        }

        console.log(`[HotLoadManager] 🔍 No match found for query`);
        return null;
    }

    /**
     * 데이터 파일에서 최신 데이터 다시 로드
     */
    private async reloadData(): Promise<void> {
        try {
            if (fs.existsSync(this.dataPath)) {
                const fileContent = fs.readFileSync(this.dataPath, 'utf-8');
                this.data = JSON.parse(fileContent);
                console.log(`[HotLoadManager] 🔄 Data reloaded: ${this.data.items.length} items`);
            }
        } catch (error) {
            console.error('[HotLoadManager] Failed to reload data:', error);
        }
    }

    /**
     * 매칭된 Hot Load 항목에 대한 프롬프트 섹션 생성
     * @param matchedItem 매칭된 Hot Load 항목 (matchQuery로 얻은 결과)
     * @param userQuery 사용자 원본 쿼리 (인자 추출용)
     * @returns 해당 항목에 대한 프롬프트 문자열
     */
    public getMatchedPromptSection(matchedItem: HotLoadItem, userQuery?: string): string {
        console.log(`[HotLoadManager] 🔥 Generating prompt for matched item: ${matchedItem.keywords}`);

        return `## ⚡ HOT LOAD (매칭됨 - 최우선 실행)

**매칭된 항목:**
- 키워드: ${matchedItem.keywords}
- 설명: ${matchedItem.description}
- **🚨 기본 명령어 (반드시 그대로 사용):** \`${matchedItem.command}\`
- 사용자 요청: "${userQuery || ''}"

**🔥 인자 추출 규칙:**
1. 위 **설명**을 분석하여 명령어에 필요한 인자의 의미와 타입을 파악하세요
2. 사용자 요청 "${userQuery || ''}"에서 각 인자에 해당하는 값을 추출하세요
3. 설명에 인자 형식이 포함된 경우 (예: --name <이름:영문>):
   - 인자명: 명령어에 사용할 플래그 이름
   - 타입 힌트: 영문, 한글, 숫자 등 예상되는 값의 형태
   - 기본값/범위: 사용자가 명시하지 않은 경우 적절한 값 생성
4. 추출한 값들로 완전한 명령어를 구성하세요
5. 사용자가 명시하지 않은 인자는 설명을 참고하여 적절한 값을 생성하세요

**🚨 중요: 명령어 구성 시 반드시 위 "기본 명령어"를 그대로 사용하고 그 뒤에 인자만 추가하세요!**
예: 기본 명령어가 \`bash ./scripts/create_agent.sh\`이면 → \`bash ./scripts/create_agent.sh --name ...\`

**명령어 실행 형식:**
{"tool": "run_command", "command": "${matchedItem.command} <추출된 인자들>", "wait": "true"}

**⚠️ 환경 설정 명령어 주의사항:**
- \`source\`, \`export\`, \`activate\` 등은 후속 작업과 \`&&\`로 연결
`;
    }

    /**
     * 프롬프트용 Hot Load 섹션 생성 (전체 목록)
     * @deprecated matchQuery() + getMatchedPromptSection() 조합 사용 권장
     */
    public async getPromptSection(): Promise<string> {
        try {
            await this.initialize();

            console.log(`[HotLoadManager] 🔥 getPromptSection called, items count: ${this.data.items.length}`);
            if (this.data.items.length === 0) return '';

            const itemsText = this.data.items.map((item, idx) =>
                `[${idx + 1}] 키워드: ${item.keywords}
   설명: ${item.description}
   명령어: ${item.command}`
            ).join('\n\n');

            console.log(`[HotLoadManager] 🔥 Generated prompt with ${this.data.items.length} items: ${this.data.items.map(i => i.keywords).join(', ')}`);

            return `## ⚡ HOT LOAD (복합 작업 지원)

${itemsText}

**처리 규칙:**
1. 사용자 입력에서 위 키워드와 매칭되는 부분이 있는지 먼저 확인
2. 매칭된 Hot Load가 있으면 해당 명령을 실행

**⚠️ 환경 설정 명령어 (source, export, activate 등) 주의사항:**
- \`source\`, \`export\`, \`activate\` 등 환경 설정 명령어는 현재 셸 세션에만 영향
- 후속 명령어가 있으면 반드시 \`&&\`로 **한 번에** 연결해서 실행
- 예: \`source venv/bin/activate && python script.py\`

**실행 예시:**
- "가상환경 구동해" (Hot Load만 매칭)
  → {"tool": "run_command", "command": "source venv/bin/activate", "wait": "true"}
- "가상환경 구동해서 테스트 실행해" (Hot Load + 후속 작업)
  → Hot Load 명령어와 후속 작업 명령어를 \`&&\`로 연결
  → {"tool": "run_command", "command": "source venv/bin/activate && pytest tests/", "wait": "true"}

**중요:** Hot Load에 없는 후속 작업은 프로젝트 컨텍스트를 분석하여 적절한 명령어를 결정하세요.
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
