import * as os from 'os';
import { IOperatingSystemAdapter, OSDetectionResult } from './IOperatingSystemAdapter';
import { DarwinAdapter } from './DarwinAdapter';
import { WindowsAdapter } from './WindowsAdapter';
import { LinuxAdapter } from './LinuxAdapter';

/**
 * OS 어댑터 팩토리
 * 현재 OS를 감지하고 적절한 어댑터를 반환
 */
export class OSAdapterFactory {
    private static instance: IOperatingSystemAdapter | null = null;
    private static detectionResult: OSDetectionResult | null = null;

    /**
     * 현재 OS에 맞는 어댑터 인스턴스 반환 (싱글톤)
     */
    static getInstance(): IOperatingSystemAdapter {
        if (!this.instance) {
            this.instance = this.createAdapter();
        }
        return this.instance;
    }

    /**
     * OS 감지 결과 반환
     */
    static detect(): OSDetectionResult {
        if (!this.detectionResult) {
            const platform = os.platform();
            
            switch (platform) {
                case 'darwin':
                    this.detectionResult = DarwinAdapter.detect();
                    break;
                case 'win32':
                    this.detectionResult = WindowsAdapter.detect();
                    break;
                case 'linux':
                    this.detectionResult = LinuxAdapter.detect();
                    break;
                default:
                    // 기본값은 Linux
                    console.warn(`[OSAdapterFactory] Unknown platform: ${platform}, using Linux adapter`);
                    this.detectionResult = LinuxAdapter.detect();
            }
        }
        return this.detectionResult;
    }

    /**
     * OS 어댑터 생성
     */
    private static createAdapter(): IOperatingSystemAdapter {
        const platform = os.platform();
        
        switch (platform) {
            case 'darwin':
                console.log('[OSAdapterFactory] Using macOS (Darwin) adapter');
                return new DarwinAdapter();
            case 'win32':
                console.log('[OSAdapterFactory] Using Windows adapter');
                return new WindowsAdapter();
            case 'linux':
                console.log('[OSAdapterFactory] Using Linux adapter');
                return new LinuxAdapter();
            default:
                console.warn(`[OSAdapterFactory] Unknown platform: ${platform}, using Linux adapter as fallback`);
                return new LinuxAdapter();
        }
    }

    /**
     * 특정 OS 어댑터 강제 생성 (테스트용)
     */
    static createAdapterForOS(osType: 'darwin' | 'win32' | 'linux'): IOperatingSystemAdapter {
        switch (osType) {
            case 'darwin':
                return new DarwinAdapter();
            case 'win32':
                return new WindowsAdapter();
            case 'linux':
                return new LinuxAdapter();
        }
    }

    /**
     * 인스턴스 초기화 (테스트용)
     */
    static reset(): void {
        this.instance = null;
        this.detectionResult = null;
    }
}

