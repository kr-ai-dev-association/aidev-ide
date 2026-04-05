/**
 * Global cleanup function registry.
 * Register async cleanup functions that run during extension deactivation.
 * Prevents resource leaks (sockets, file watchers, timers, child processes).
 */

type CleanupFn = () => Promise<void> | void;

const cleanupFunctions = new Set<CleanupFn>();

export function registerCleanup(fn: CleanupFn): void {
    cleanupFunctions.add(fn);
}

export function unregisterCleanup(fn: CleanupFn): void {
    cleanupFunctions.delete(fn);
}

export async function runCleanupFunctions(timeoutMs: number = 5000): Promise<void> {
    if (cleanupFunctions.size === 0) return;

    console.log(`[CleanupRegistry] Running ${cleanupFunctions.size} cleanup function(s)...`);

    const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
            console.warn(`[CleanupRegistry] Cleanup timed out after ${timeoutMs}ms`);
            resolve();
        }, timeoutMs);
    });

    const cleanup = Promise.allSettled(
        Array.from(cleanupFunctions).map(async (fn) => {
            try {
                await fn();
            } catch (error) {
                console.warn('[CleanupRegistry] Cleanup function failed:', error);
            }
        })
    ).then(() => {
        console.log('[CleanupRegistry] All cleanup functions completed');
    });

    await Promise.race([cleanup, timeout]);
    cleanupFunctions.clear();
}
