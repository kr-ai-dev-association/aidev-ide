/**
 * File Context
 * 파일 컨텍스트를 수집하는 클래스
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    FileContext,
    RelatedFilesContext
} from '../types';

export class FileContextCollector {
    /**
     * 파일 컨텍스트를 수집합니다
     * 
     * ✅ 핵심: LLM context에는 pending change를 제외한 내용만 전달
     * - pending change가 있으면 checkpoint.beforeContent + accepted changes만 사용
     * - 이렇게 해야 LLM이 자기 자신을 다시 생성하지 않음
     */
    public async collect(filePath: string): Promise<FileContext | null> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);

            // 파일 읽기
            let content: string;
            let isOpen = false;
            let isDirty = false;

            if (document) {
                // ✅ pending change 확인 및 제외
                try {
                    const diffModule = await import('../../diff/InlineDiffManager');
                    const inlineDiffManager = diffModule.InlineDiffManager.getInstance();
                    const stableContent = inlineDiffManager.getCurrentDocumentContent(filePath);
                    
                    if (stableContent !== undefined) {
                        // getCurrentDocumentContent가 pending change를 제외한 내용 반환
                        content = stableContent;
                        console.log(`[FileContext] Using stable content (pending changes excluded): ${filePath}`);
                    } else {
                        // fallback: document.getText() 사용
                        content = document.getText();
                    }
                } catch (error) {
                    // InlineDiffManager를 사용할 수 없으면 fallback
                    console.warn(`[FileContext] Failed to get stable content, using document.getText(): ${filePath}`, error);
                    content = document.getText();
                }
                
                isOpen = true;
                isDirty = document.isDirty;
            } else {
                // 파일 시스템에서 읽기 (pending change 고려 불필요)
                content = fs.readFileSync(filePath, 'utf8');
            }

            // 파일 정보
            const stats = fs.statSync(filePath);
            const fileName = path.basename(filePath);
            const language = this.detectLanguage(filePath);

            // 관련 파일 찾기
            const relatedFiles = await this.findRelatedFiles(filePath);

            const fileContext: FileContext = {
                path: filePath,
                name: fileName,
                language,
                content,
                lines: content.split('\n').length,
                size: stats.size,
                isOpen,
                isDirty,
                relatedFiles
            };

            console.log(`[FileContext] Collected context for: ${filePath} (${fileContext.lines} lines)`);

            return fileContext;

        } catch (error) {
            console.error(`[FileContext] Failed to collect context for ${filePath}:`, error);
            return null;
        }
    }

    /**
     * 관련 파일을 찾습니다
     */
    private async findRelatedFiles(filePath: string): Promise<string[]> {
        const relatedFiles: string[] = [];
        const dir = path.dirname(filePath);
        const fileName = path.basename(filePath, path.extname(filePath));

        try {
            // 같은 디렉토리의 파일들
            const files = fs.readdirSync(dir);
            
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                
                if (stat.isFile() && fullPath !== filePath) {
                    // 같은 이름의 다른 확장자 파일
                    const otherFileName = path.basename(file, path.extname(file));
                    if (otherFileName === fileName) {
                        relatedFiles.push(fullPath);
                    }
                }
            }
        } catch (error) {
            console.warn(`[FileContext] Failed to find related files:`, error);
        }

        return relatedFiles;
    }

    /**
     * 언어를 감지합니다
     */
    private detectLanguage(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase().substring(1);
        
        const languageMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript',
            'jsx': 'javascript',
            'py': 'python',
            'java': 'java',
            'go': 'go',
            'rs': 'rust',
            'cpp': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'rb': 'ruby',
            'php': 'php',
            'swift': 'swift',
            'kt': 'kotlin',
            'dart': 'dart',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'html': 'html',
            'css': 'css',
            'scss': 'scss',
            'sql': 'sql'
        };

        return languageMap[ext] || ext || 'text';
    }

    /**
     * 파일의 import 문을 분석하여 관련 파일을 찾습니다
     */
    public async findImportedFiles(filePath: string): Promise<string[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const importedFiles: string[] = [];
            const dir = path.dirname(filePath);

            // TypeScript/JavaScript import 패턴
            const importPatterns = [
                /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
                /require\(['"]([^'"]+)['"]\)/g,
                /import\(['"]([^'"]+)['"]\)/g
            ];

            for (const pattern of importPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const importPath = match[1];
                    
                    // 상대 경로인 경우
                    if (importPath.startsWith('.')) {
                        const resolvedPath = path.resolve(dir, importPath);
                        // 확장자 추가 시도
                        const possiblePaths = [
                            resolvedPath,
                            `${resolvedPath}.ts`,
                            `${resolvedPath}.tsx`,
                            `${resolvedPath}.js`,
                            `${resolvedPath}.jsx`
                        ];

                        for (const possiblePath of possiblePaths) {
                            if (fs.existsSync(possiblePath)) {
                                importedFiles.push(possiblePath);
                                break;
                            }
                        }
                    }
                }
            }

            return importedFiles;

        } catch (error) {
            console.warn(`[FileContext] Failed to find imported files:`, error);
            return [];
        }
    }
}

