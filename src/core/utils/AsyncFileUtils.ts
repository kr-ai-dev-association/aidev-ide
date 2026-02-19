/**
 * Async File Utilities
 * 비동기 파일 I/O 헬퍼 함수들
 *
 * 동기 fs 메서드를 대체하여 메인 스레드 블로킹 방지
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 파일 존재 여부를 비동기로 확인
 * fs.existsSync 대체
 */
export async function fileExistsAsync(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 여러 파일 중 존재하는 첫 번째 파일 반환
 * 파일이 없으면 null 반환
 */
export async function findFirstExistingFile(filePaths: string[]): Promise<string | null> {
    for (const filePath of filePaths) {
        if (await fileExistsAsync(filePath)) {
            return filePath;
        }
    }
    return null;
}

/**
 * 여러 파일 존재 여부를 병렬로 확인
 * 결과는 { [filePath]: boolean } 형태
 */
export async function checkFilesExistAsync(filePaths: string[]): Promise<Map<string, boolean>> {
    const results = await Promise.all(
        filePaths.map(async (filePath) => ({
            path: filePath,
            exists: await fileExistsAsync(filePath)
        }))
    );
    return new Map(results.map(r => [r.path, r.exists]));
}

/**
 * 파일 읽기 (비동기)
 * fs.readFileSync 대체
 */
export async function readFileAsync(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return await fs.readFile(filePath, encoding);
}

/**
 * 파일 읽기 (실패 시 null 반환)
 */
export async function readFileSafeAsync(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string | null> {
    try {
        return await fs.readFile(filePath, encoding);
    } catch {
        return null;
    }
}

/**
 * JSON 파일 읽기 및 파싱
 */
export async function readJsonFileAsync<T = unknown>(filePath: string): Promise<T | null> {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content) as T;
    } catch {
        return null;
    }
}

/**
 * 파일 stat 조회 (비동기)
 * fs.statSync 대체
 */
export async function statAsync(filePath: string): Promise<fs.FileHandle extends never ? never : Awaited<ReturnType<typeof fs.stat>> | null> {
    try {
        return await fs.stat(filePath);
    } catch {
        return null;
    }
}

/**
 * 디렉토리 읽기 (비동기)
 * fs.readdirSync 대체
 */
export async function readdirAsync(dirPath: string): Promise<string[]> {
    try {
        return await fs.readdir(dirPath);
    } catch {
        return [];
    }
}

/**
 * 디렉토리인지 확인
 */
export async function isDirectoryAsync(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * 파일인지 확인
 */
export async function isFileAsync(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    } catch {
        return false;
    }
}

/**
 * 프로젝트 타입 감지용 파일 존재 확인
 * 여러 파일 경로를 받아서 어떤 것이 존재하는지 확인
 */
export async function detectProjectFiles(
    projectRoot: string,
    filePatterns: { files: string[], type: string }[]
): Promise<{ type: string, matchedFile: string } | null> {
    for (const pattern of filePatterns) {
        for (const file of pattern.files) {
            const fullPath = path.join(projectRoot, file);
            if (await fileExistsAsync(fullPath)) {
                return { type: pattern.type, matchedFile: file };
            }
        }
    }
    return null;
}
