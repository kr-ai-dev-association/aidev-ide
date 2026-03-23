/**
 * MemoryManager
 * 프로젝트별 영속적 메모리 관리
 *
 * 저장 위치: globalStorageUri/memory/{projectHash}/
 * 최대 파일 수: 50개
 * 자동 정리: project(만료) → project(오래된) → reference → feedback 순 (user 보호)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as crypto from 'crypto';

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryEntry {
    name: string;
    description: string;
    type: MemoryType;
    content: string;
}

interface MemoryFileMeta {
    name: string;
    description: string;
    type: MemoryType;
    filePath: string;
    createdAt: number;
}

/** 자동 정리 우선순위 (낮을수록 먼저 삭제, user=4는 삭제 보호) */
const CLEANUP_PRIORITY: Record<MemoryType, number> = {
    project: 1,
    reference: 2,
    feedback: 3,
    user: 4,
};

const MAX_MEMORY_FILES = 30;
const MAX_INDEX_LINES = 200;

export class MemoryManager {
    private static instance: MemoryManager;
    private memoryDir: string = '';
    private initialized = false;

    private constructor() {}

    public static getInstance(): MemoryManager {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager();
        }
        return MemoryManager.instance;
    }

    /** extension.ts activate 시 호출 */
    public initialize(context: vscode.ExtensionContext, projectRoot: string): void {
        const hash = this.hashProjectPath(projectRoot);
        this.memoryDir = path.join(context.globalStorageUri.fsPath, 'memory', hash);
        this.initialized = true;
    }

    /** 프로젝트 루트 변경 시 재초기화 */
    public setProjectRoot(context: vscode.ExtensionContext, projectRoot: string): void {
        const hash = this.hashProjectPath(projectRoot);
        this.memoryDir = path.join(context.globalStorageUri.fsPath, 'memory', hash);
        this.initialized = true;
    }

    // ──────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────

    /** 메모리 저장 (중복 시 업데이트) */
    public async save(entry: MemoryEntry): Promise<void> {
        if (!this.initialized) { return; }
        await this.ensureDir();

        const safeName = this.sanitizeName(entry.name);
        const filePath = path.join(this.memoryDir, `${safeName}.md`);
        const content = this.serializeMemory(entry);

        await fs.writeFile(filePath, content, 'utf-8');
        await this.updateIndex();

        // 50개 초과 시 자동 정리
        const count = await this.countFiles();
        if (count > MAX_MEMORY_FILES) {
            await this.autoCleanup(count - MAX_MEMORY_FILES);
        }
    }

    /** 메모리 삭제 */
    public async remove(name: string): Promise<void> {
        if (!this.initialized) { return; }
        const safeName = this.sanitizeName(name);
        const filePath = path.join(this.memoryDir, `${safeName}.md`);
        try {
            await fs.unlink(filePath);
        } catch { /* 없으면 무시 */ }
        await this.updateIndex();
    }

    /** 이름으로 메모리 존재 여부 확인 */
    public async exists(name: string): Promise<boolean> {
        if (!this.initialized) { return false; }
        const safeName = this.sanitizeName(name);
        const filePath = path.join(this.memoryDir, `${safeName}.md`);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 시스템 프롬프트 주입용 메모리 컨텍스트 로드
     * MEMORY.md 인덱스 + 각 메모리 파일 내용 결합
     */
    public async loadForPrompt(): Promise<string> {
        if (!this.initialized) { return ''; }
        try {
            const indexPath = path.join(this.memoryDir, 'MEMORY.md');
            if (!fsSync.existsSync(indexPath)) { return ''; }

            const indexContent = await fs.readFile(indexPath, 'utf-8');
            const lines = indexContent.split('\n');
            if (lines.length <= 3) { return ''; } // 헤더만 있는 경우

            // 각 메모리 파일 읽기
            const entries: string[] = [];
            const files = await this.listMemoryFiles();
            for (const meta of files) {
                try {
                    const raw = await fs.readFile(meta.filePath, 'utf-8');
                    const parsed = this.parseMemory(raw);
                    if (parsed) {
                        entries.push(`### [${parsed.type}] ${parsed.name}\n${parsed.content.trim()}`);
                    }
                } catch { /* 손상된 파일 무시 */ }
            }

            if (entries.length === 0) { return ''; }

            return `## 영속적 메모리 (이전 대화에서 저장된 정보)
아래 정보는 이전 대화에서 학습하거나 기억하도록 저장된 내용입니다. 현재 코드베이스와 충돌 시 코드를 우선합니다.

${entries.join('\n\n')}`;
        } catch {
            return '';
        }
    }

    // ──────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────

    private hashProjectPath(projectRoot: string): string {
        return crypto.createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
    }

    private sanitizeName(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60);
    }

    private async ensureDir(): Promise<void> {
        await fs.mkdir(this.memoryDir, { recursive: true });
    }

    private serializeMemory(entry: MemoryEntry): string {
        return `---
name: ${entry.name}
description: ${entry.description}
type: ${entry.type}
createdAt: ${Date.now()}
---

${entry.content}
`;
    }

    private parseMemory(raw: string): (MemoryEntry & { createdAt?: number }) | null {
        const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
        if (!match) { return null; }

        const frontmatter = match[1];
        const content = match[2];

        const name = (frontmatter.match(/^name:\s*(.+)$/m) || [])[1]?.trim() || '';
        const description = (frontmatter.match(/^description:\s*(.+)$/m) || [])[1]?.trim() || '';
        const type = ((frontmatter.match(/^type:\s*(.+)$/m) || [])[1]?.trim() || 'reference') as MemoryType;
        const createdAt = parseInt((frontmatter.match(/^createdAt:\s*(\d+)$/m) || [])[1] || '0');

        if (!name) { return null; }
        return { name, description, type, content, createdAt };
    }

    private async listMemoryFiles(): Promise<MemoryFileMeta[]> {
        try {
            const files = await fs.readdir(this.memoryDir);
            const metas: MemoryFileMeta[] = [];

            for (const file of files) {
                if (!file.endsWith('.md') || file === 'MEMORY.md') { continue; }
                const filePath = path.join(this.memoryDir, file);
                try {
                    const raw = await fs.readFile(filePath, 'utf-8');
                    const parsed = this.parseMemory(raw);
                    if (parsed) {
                        const stat = await fs.stat(filePath);
                        metas.push({
                            name: parsed.name,
                            description: parsed.description,
                            type: parsed.type,
                            filePath,
                            createdAt: parsed.createdAt || stat.mtimeMs,
                        });
                    }
                } catch { /* 손상된 파일 무시 */ }
            }

            return metas;
        } catch {
            return [];
        }
    }

    private async countFiles(): Promise<number> {
        try {
            const files = await fs.readdir(this.memoryDir);
            return files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md').length;
        } catch {
            return 0;
        }
    }

    /** MEMORY.md 인덱스 재생성 */
    private async updateIndex(): Promise<void> {
        const files = await this.listMemoryFiles();
        const indexPath = path.join(this.memoryDir, 'MEMORY.md');

        const lines = [
            '# MEMORY',
            '',
            '> 영속적 메모리 인덱스. 각 항목은 별도 .md 파일에 저장됩니다.',
            '',
        ];

        // 타입별로 그룹화
        const grouped: Record<MemoryType, MemoryFileMeta[]> = {
            user: [], feedback: [], project: [], reference: [],
        };
        for (const f of files) {
            grouped[f.type]?.push(f);
        }

        const typeLabels: Record<MemoryType, string> = {
            user: '## 사용자',
            feedback: '## 피드백',
            project: '## 프로젝트',
            reference: '## 참조',
        };

        for (const type of ['user', 'feedback', 'project', 'reference'] as MemoryType[]) {
            if (grouped[type].length === 0) { continue; }
            lines.push(typeLabels[type]);
            for (const meta of grouped[type]) {
                lines.push(`- [${meta.name}](${path.basename(meta.filePath)}): ${meta.description}`);
            }
            lines.push('');
        }

        // 200줄 초과 시 트렁케이트
        const content = lines.slice(0, MAX_INDEX_LINES).join('\n');
        await fs.writeFile(indexPath, content, 'utf-8');
    }

    /**
     * 자동 정리: count개 파일 제거
     * 순서: project(날짜만료) → project(오래된) → reference → feedback (user 보호)
     */
    private async autoCleanup(count: number): Promise<void> {
        const files = await this.listMemoryFiles();
        const now = Date.now();

        // 삭제 후보 정렬: priority 낮을수록 먼저, 같은 priority는 오래된 것 먼저
        const candidates = files
            .filter(f => f.type !== 'user') // user 보호
            .map(f => ({
                ...f,
                isExpired: f.type === 'project' && this.isDateExpired(f.name, now),
                priority: CLEANUP_PRIORITY[f.type],
            }))
            .sort((a, b) => {
                // 만료된 project 최우선
                if (a.isExpired !== b.isExpired) { return a.isExpired ? -1 : 1; }
                // priority 낮을수록 먼저
                if (a.priority !== b.priority) { return a.priority - b.priority; }
                // 같은 우선순위는 오래된 것 먼저
                return a.createdAt - b.createdAt;
            });

        let removed = 0;
        for (const candidate of candidates) {
            if (removed >= count) { break; }
            try {
                await fs.unlink(candidate.filePath);
                removed++;
            } catch { /* 무시 */ }
        }

        if (removed > 0) {
            await this.updateIndex();
        }
    }

    /** project 메모리 이름에서 날짜를 추출해 만료 여부 판단 */
    private isDateExpired(name: string, now: number): boolean {
        // YYYY-MM-DD 형식 날짜 추출
        const match = name.match(/(\d{4}-\d{2}-\d{2})/);
        if (!match) { return false; }
        try {
            const date = new Date(match[1]).getTime();
            return date < now;
        } catch {
            return false;
        }
    }
}
