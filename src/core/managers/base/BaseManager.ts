/**
 * BaseManager
 * 모든 매니저의 공통 싱글톤 패턴을 제공하는 추상 클래스
 */

import * as vscode from 'vscode';
console.log('[BaseManager] Module loading...');

export abstract class BaseManager {
    private static instances = new Map<string, BaseManager>();

    protected constructor(protected _context?: vscode.ExtensionContext) { }

    protected get context(): vscode.ExtensionContext | undefined {
        return this._context;
    }

    /**
     * 싱글톤 인스턴스 가져오기
     * @param context - 첫 생성시에만 사용됨
     */
    public static getInstance<T extends BaseManager>(
        this: new (context?: vscode.ExtensionContext) => T,
        context?: vscode.ExtensionContext
    ): T {
        const key = this.name;

        if (!BaseManager.instances.has(key)) {
            BaseManager.instances.set(key, new this(context));
        }

        return BaseManager.instances.get(key)! as T;
    }

    /** 테스트용 */
    public static clearAll(): void {
        BaseManager.instances.clear();
    }
}

