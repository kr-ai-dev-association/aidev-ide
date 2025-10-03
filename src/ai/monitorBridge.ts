export interface MinimalTerminalMonitor {
    ingestExternalOutput(source: string, data: string): void;
}

let monitorRef: MinimalTerminalMonitor | undefined;

export function setTerminalMonitor(monitor: MinimalTerminalMonitor | undefined): void {
    monitorRef = monitor;
}

export function getTerminalMonitor(): MinimalTerminalMonitor | undefined {
    return monitorRef;
}


