/**
 * Diff View Provider Manager
 * DiffViewProvider 인스턴스 관리
 * 각 파일마다 별도의 인스턴스를 생성할 수 있도록 팩토리 메서드 제공
 */

import { VscodeDiffViewProvider } from './VscodeDiffViewProvider';
import { DiffViewProvider } from './DiffViewProvider';

export class DiffViewProviderManager {
    private static instance: DiffViewProviderManager;
    private defaultDiffViewProvider: DiffViewProvider;

    private constructor() {
        this.defaultDiffViewProvider = new VscodeDiffViewProvider();
    }

    public static getInstance(): DiffViewProviderManager {
        if (!DiffViewProviderManager.instance) {
            DiffViewProviderManager.instance = new DiffViewProviderManager();
        }
        return DiffViewProviderManager.instance;
    }

    /**
     * 기본 DiffViewProvider 반환 (단일 인스턴스)
     */
    public getDiffViewProvider(): DiffViewProvider {
        return this.defaultDiffViewProvider;
    }

    /**
     * 새로운 DiffViewProvider 인스턴스 생성
     */
    public createDiffViewProvider(): DiffViewProvider {
        return new VscodeDiffViewProvider();
    }
}
