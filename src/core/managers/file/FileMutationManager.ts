/**
 * File Mutation Manager
 * 파일 수정 전략 및 정합성 검사 관리자
 */

import * as vscode from 'vscode';
import { BaseManager } from '../base/BaseManager';
import { AgentConfig } from '../../config/AgentConfig';

export interface FileAnalysis {
    hasDefaultExport: boolean;
    hasReactComponent: boolean;
    isViteTemplate: boolean;
    hasNav: boolean;
    lineCount: number;
    size: number;
}

export enum PatchStrategy {
    SEARCH_REPLACE = 'search_replace',
    STRUCTURAL_REWRITE = 'structural_rewrite',
    FULL_OVERWRITE = 'full_overwrite'
}

// @ts-ignore - BaseManager 상속 타입 호환성
export class FileMutationManager extends BaseManager {
    private constructor(context?: vscode.ExtensionContext) {
        super(context);
    }

    public static getInstance(context?: vscode.ExtensionContext): FileMutationManager {
        return BaseManager.getInstance.call(FileMutationManager as any, context) as unknown as FileMutationManager;
    }

    /**
     * 파일 내용 분석
     */
    public analyzeFile(content: string): FileAnalysis {
        return {
            hasDefaultExport: /export\s+default/.test(content),
            hasReactComponent: /function\s+[A-Z]\w*|const\s+[A-Z]\w*\s*=\s*\(/.test(content),
            isViteTemplate: content.includes('Vite + React') || content.includes('viteLogo'),
            hasNav: /<nav|Router|NavLink|Link\s+to=/.test(content),
            lineCount: content.split('\n').length,
            size: content.length
        };
    }

    /**
     * 수정 전략 선택
     */
    public chooseStrategy(analysis: FileAnalysis, searchContent: string): PatchStrategy {
        // 파일이 매우 작거나 Vite 기본 템플릿인 경우 재작성 선호
        if (analysis.isViteTemplate && analysis.lineCount < 50) {
            return PatchStrategy.STRUCTURAL_REWRITE;
        }

        // 파일 크기가 작으면 전체 재작성이 더 안전할 수 있음
        if (analysis.size < 1000 && analysis.lineCount < 30) {
            return PatchStrategy.STRUCTURAL_REWRITE;
        }

        return PatchStrategy.SEARCH_REPLACE;
    }

    /**
     * 문자열 유사도 계산 (Dice's Coefficient)
     */
    public getStringSimilarity(str1: string, str2: string): number {
        const s1 = str1.replace(/\s+/g, '');
        const s2 = str2.replace(/\s+/g, '');

        if (s1 === s2) return 1.0;
        if (s1.length < 2 || s2.length < 2) return 0;

        const bigrams1 = new Map<string, number>();
        for (let i = 0; i < s1.length - 1; i++) {
            const bigram = s1.substring(i, i + 2);
            bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
        }

        let intersection = 0;
        for (let i = 0; i < s2.length - 1; i++) {
            const bigram = s2.substring(i, i + 2);
            const count = bigrams1.get(bigram) || 0;
            if (count > 0) {
                bigrams1.set(bigram, count - 1);
                intersection++;
            }
        }

        return (2.0 * intersection) / (s1.length + s2.length - 2);
    }

    /**
     * 유사도 기반 퍼지 매칭
     */
    public fuzzyMatch(content: string, search: string, threshold: number = AgentConfig.MIN_FUZZY_MATCH_THRESHOLD): [number, number] | false {
        const searchLines = search.split('\n').filter(l => l.trim() !== '');
        if (searchLines.length === 0) return false;

        const contentLines = content.split('\n');
        let bestMatch: [number, number] | false = false;
        let bestScore = 0;

        // 슬라이딩 윈도우 방식으로 검색
        for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
            const window = contentLines.slice(i, i + searchLines.length).join('\n');
            const score = this.getStringSimilarity(window, search);

            if (score > threshold && score > bestScore) {
                bestScore = score;
                
                // 정확한 위치 계산
                let startPos = 0;
                for (let k = 0; k < i; k++) startPos += contentLines[k].length + 1;
                
                let endPos = startPos;
                for (let k = 0; k < searchLines.length; k++) endPos += contentLines[i + k].length + 1;
                
                bestMatch = [startPos, Math.min(endPos, content.length)];
            }
        }

        return bestMatch;
    }
}

