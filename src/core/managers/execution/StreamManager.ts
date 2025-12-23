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
        console.log(`[StreamManager] Capturing streams for PID=${pid}`);

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

        // 프로세스 종료 시 정리
        childProcess.on('exit', () => {
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
        console.log(`[StreamManager] Registered handler for PID=${pid}`);
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
            console.log(`[StreamManager] Unregistered handler for PID=${pid}`);
        }
    }

    /**
     * 모든 핸들러를 제거합니다
     */
    public unregisterAllHandlers(pid: number): void {
        this.handlers.delete(pid);
        console.log(`[StreamManager] Unregistered all handlers for PID=${pid}`);
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
            console.log(`[StreamManager] Cleared buffer for PID=${pid}`);
        }
    }

    /**
     * 최대 버퍼 크기를 설정합니다
     */
    public setMaxBufferSize(size: number): void {
        this.maxBufferSize = size;
        console.log(`[StreamManager] Max buffer size set to ${size} bytes`);
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
                console.warn(`[StreamManager] Buffer for PID=${pid} ${type} exceeded max size, truncated`);
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
                } catch (error) {
                    console.error(`[StreamManager] Handler error for PID=${pid}:`, error);
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
            return data.toString('utf8');
        } catch (error) {
            // 실패 시 Latin1로 디코딩
            console.warn('[StreamManager] UTF-8 decoding failed, using latin1');
            return data.toString('latin1');
        }
    }

    /**
     * 특정 프로세스의 리소스를 정리합니다
     */
    private cleanup(pid: number): void {
        console.log(`[StreamManager] Cleaning up streams for PID=${pid}`);
        this.handlers.delete(pid);
        
        // 버퍼는 유지 (히스토리 목적)
        // this.buffers.delete(pid);
    }

    /**
     * 모든 리소스를 정리합니다
     */
    public cleanupAll(): void {
        console.log('[StreamManager] Cleaning up all streams');
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
}

