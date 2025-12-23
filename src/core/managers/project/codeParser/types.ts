/**
 * AST 기반 코드 분석 관련 타입 정의
 */

import { DefinitionType } from './ICodeParserAdapter';

/**
 * 정의 사용 위치
 */
export interface UsageLocation {
    filePath: string;
    line: number;
    column: number;
    context: string; // 사용된 코드 라인
    usageType: 'import' | 'call' | 'reference' | 'extend' | 'implement' | 'definition';
}

/**
 * 관련 파일 정보 (import/export 관계)
 */
export interface RelatedFile {
    filePath: string;
    relationship: 'imports' | 'imported_by' | 'exports' | 'exported_by';
    symbols?: string[]; // 관련 심볼 목록
}

/**
 * 코드 정의 (확장)
 */
export interface CodeDefinition {
    name: string;
    type: DefinitionType;
    location: {
        file: string;
        line: number;
        column: number;
    };
    signature?: string;
    documentation?: string;
}

