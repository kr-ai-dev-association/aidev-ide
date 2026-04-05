import * as vscode from 'vscode';

interface DiagnosticBaseline {
    timestamp: number;
    counts: Map<string, number>; // filePath -> error count
    total: number;
}

export class DiagnosticTracker {
    private static instance: DiagnosticTracker;
    private baseline: DiagnosticBaseline | null = null;

    static getInstance(): DiagnosticTracker {
        if (!this.instance) this.instance = new DiagnosticTracker();
        return this.instance;
    }

    captureBaseline(): void {
        const counts = new Map<string, number>();
        let total = 0;
        for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            if (errors.length > 0) {
                counts.set(uri.fsPath, errors.length);
                total += errors.length;
            }
        }
        this.baseline = { timestamp: Date.now(), counts, total };
        console.log(`[DiagnosticTracker] Baseline captured: ${total} errors in ${counts.size} files`);
    }

    getDelta(): { added: number; removed: number; net: number; details: string[] } | null {
        if (!this.baseline) return null;

        const currentCounts = new Map<string, number>();
        let currentTotal = 0;
        for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
            if (errors.length > 0) {
                currentCounts.set(uri.fsPath, errors.length);
                currentTotal += errors.length;
            }
        }

        let added = 0;
        let removed = 0;
        const details: string[] = [];

        // Check files that had errors before
        for (const [file, baseCount] of this.baseline.counts) {
            const currentCount = currentCounts.get(file) || 0;
            if (currentCount > baseCount) {
                added += currentCount - baseCount;
                details.push(`${file}: +${currentCount - baseCount} errors`);
            } else if (currentCount < baseCount) {
                removed += baseCount - currentCount;
                details.push(`${file}: -${baseCount - currentCount} errors`);
            }
        }

        // Check new files with errors
        for (const [file, count] of currentCounts) {
            if (!this.baseline.counts.has(file)) {
                added += count;
                details.push(`${file}: +${count} errors (new)`);
            }
        }

        const net = added - removed;
        console.log(`[DiagnosticTracker] Delta: +${added} -${removed} (net: ${net >= 0 ? '+' : ''}${net})`);
        return { added, removed, net, details };
    }

    reset(): void {
        this.baseline = null;
    }
}
