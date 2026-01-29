/**
 * File Mutation Manager
 * 파일 수정 전략 및 정합성 검사 관리자
 */

import * as vscode from 'vscode';
import { BaseManager } from '../base/BaseManager';

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

}

