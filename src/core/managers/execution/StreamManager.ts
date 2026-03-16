/**
 * Stream Manager
 * stdout/stderr 스트림을 관리하고 라우팅하는 클래스
 */

import { ChildProcess } from 'child_process';
import { StreamData, StreamHandler } from './types';

export class StreamManager {
    private handlers: Map<number, Set<StreamHandler>> = new Map();
    private buffers: Map<number, { stdout: string; stderr: string }> = new Map();
    private maxBufferSize: number = 1024 * 1024; // 1MB

    /**
     * 프로세스의 스트림을 캡처합니다
     */
    public captureStream(pid: number, childProcess: ChildProcess): void {

        // 버퍼 초기화
        this.buffers.set(pid, { stdout: '', stderr: '' });

        // stdout 캡처
        if (childProcess.stdout) {
            childProcess.stdout.on('data', (data: Buffer) => {
                const text = this.decodeData(data);
                this.handleStreamData(pid, 'stdout', text);
            });
        }

        // stderr 캡처
        if (childProcess.stderr) {
            childProcess.stderr.on('data', (data: Buffer) => {
                const text = this.decodeData(data);
                this.handleStreamData(pid, 'stderr', text);
            });
        }

        // 프로세스 종료 시 정리 (close는 exit 이후, 모든 스트림 flush 후 발생)
        // exit에서 cleanup하면 ExecutionManager가 buffer를 읽기 전에 삭제되는 레이스 컨디션 발생
        childProcess.on('close', () => {
            this.cleanup(pid);
        });
    }

    /**
     * 스트림 핸들러를 등록합니다
     */
    public registerHandler(pid: number, handler: StreamHandler): void {
        if (!this.handlers.has(pid)) {
            this.handlers.set(pid, new Set());
        }
        this.handlers.get(pid)!.add(handler);
    }

    /**
     * 스트림 핸들러를 제거합니다
     */
    public unregisterHandler(pid: number, handler: StreamHandler): void {
        const handlers = this.handlers.get(pid);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.handlers.delete(pid);
            }
        }
    }

    /**
     * 모든 핸들러를 제거합니다
     */
    public unregisterAllHandlers(pid: number): void {
        this.handlers.delete(pid);
    }

    /**
     * 버퍼의 내용을 가져옵니다
     */
    public getBuffer(pid: number): { stdout: string; stderr: string } | undefined {
        return this.buffers.get(pid);
    }

    /**
     * 버퍼를 초기화합니다
     */
    public clearBuffer(pid: number): void {
        const buffer = this.buffers.get(pid);
        if (buffer) {
            buffer.stdout = '';
            buffer.stderr = '';
        }
    }

    /**
     * 최대 버퍼 크기를 설정합니다
     */
    public setMaxBufferSize(size: number): void {
        this.maxBufferSize = size;
    }

    /**
     * 스트림 데이터를 처리합니다
     */
    private handleStreamData(pid: number, type: 'stdout' | 'stderr', text: string): void {
        // 버퍼에 추가
        const buffer = this.buffers.get(pid);
        if (buffer) {
            buffer[type] += text;

            // 버퍼 크기 제한
            if (buffer[type].length > this.maxBufferSize) {
                const excess = buffer[type].length - this.maxBufferSize;
                buffer[type] = buffer[type].substring(excess);
            }
        }

        // 핸들러에 전달
        const handlers = this.handlers.get(pid);
        if (handlers && handlers.size > 0) {
            const streamData: StreamData = {
                type,
                pid,
                data: text,
                timestamp: Date.now()
            };

            handlers.forEach(handler => {
                try {
                    handler(streamData);
                } catch {
                    // Handler error ignored
                }
            });
        }
    }

    /**
     * 데이터를 디코딩합니다
     */
    private decodeData(data: Buffer): string {
        try {
            // UTF-8 디코딩 시도
            let result = data.toString('utf8');
            // Windows UTF-8 BOM 제거
            if (result.charCodeAt(0) === 0xFEFF) {
                result = result.slice(1);
            }
            return result;
        } catch {
            // 실패 시 Latin1로 디코딩
            return data.toString('latin1');
        }
    }

    /**
     * 특정 프로세스의 리소스를 정리합니다
     */
    private cleanup(pid: number): void {
        this.handlers.delete(pid);
        this.buffers.delete(pid);
    }

    /**
     * 모든 리소스를 정리합니다
     */
    public cleanupAll(): void {
        this.handlers.clear();
        this.buffers.clear();
    }

    /**
     * 통계를 가져옵니다
     */
    public getStats(): {
        activeStreams: number;
        totalHandlers: number;
        totalBufferSize: number;
    } {
        let totalHandlers = 0;
        this.handlers.forEach(handlers => {
            totalHandlers += handlers.size;
        });

        let totalBufferSize = 0;
        this.buffers.forEach(buffer => {
            totalBufferSize += buffer.stdout.length + buffer.stderr.length;
        });

        return {
            activeStreams: this.handlers.size,
            totalHandlers,
            totalBufferSize
        };
    }

    /**
     * 최근 N줄을 가져옵니다
     */
    public getRecentLines(
        pid: number,
        type: 'stdout' | 'stderr' | 'combined',
        lineCount: number = 50
    ): string[] {
        const buffer = this.buffers.get(pid);
        if (!buffer) {
            return [];
        }

        let content: string;
        if (type === 'combined') {
            // stdout과 stderr를 타임스탬프 순으로 합칠 수는 없으므로 단순 결합
            content = buffer.stdout + buffer.stderr;
        } else {
            content = buffer[type];
        }

        const lines = content.split('\n');
        return lines.slice(-lineCount);
    }

    /**
     * 패턴과 매칭되는 라인을 찾습니다
     */
    public findLines(
        pid: number,
        pattern: RegExp,
        type: 'stdout' | 'stderr' | 'combined' = 'combined'
    ): string[] {
        const buffer = this.buffers.get(pid);
        if (!buffer) {
            return [];
        }

        let content: string;
        if (type === 'combined') {
            content = buffer.stdout + buffer.stderr;
        } else {
            content = buffer[type];
        }

        const lines = content.split('\n');
        return lines.filter(line => pattern.test(line));
    }

    /**
     * 출력 내용을 분석하여 장기 실행 명령어인지 판단합니다
     * 출력에서 "compiling", "building" 등의 마커를 찾아 장기 실행 여부를 판단
     */
    public isLongRunningOutput(pid: number): boolean {
        const buffer = this.buffers.get(pid);
        if (!buffer) {
            return false;
        }

        const content = (buffer.stdout + buffer.stderr).toLowerCase();

        // 장기 실행을 나타내는 마커들 
        const compilingMarkers = [
            'compiling',
            'building',
            'bundling',
            'transpiling',
            'generating',
            'starting',
            'watching',
            'serving',
            'listening',
            'ready',
            'running',
            'dev server',
            'development server'
        ];

        // 완료를 나타내는 nullifier들
        const markerNullifiers = [
            'compiled',
            'success',
            'finish',
            'complete',
            'succeed',
            'done',
            'end',
            'stop',
            'exit',
            'terminate',
            'error',
            'fail',
            'failed',
            'error:'
        ];

        // 마커가 있고 nullifier가 없으면 장기 실행으로 판단
        const hasCompilingMarker = compilingMarkers.some(marker =>
            content.includes(marker)
        );
        const hasNullifier = markerNullifiers.some(nullifier =>
            content.includes(nullifier)
        );

        return hasCompilingMarker && !hasNullifier;
    }
}

