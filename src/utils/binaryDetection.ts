/**
 * Binary file detection via content sampling.
 * Checks first 8KB for null bytes and non-printable character ratio.
 */

const BINARY_DETECTION_SIZE = 8192;
const NULL_BYTE_THRESHOLD = 0; // Any null byte = binary
const NON_PRINTABLE_RATIO = 0.1; // > 10% non-printable = binary

export function isBinaryContent(buffer: Buffer): boolean {
    const sampleSize = Math.min(buffer.length, BINARY_DETECTION_SIZE);
    let nullBytes = 0;
    let nonPrintable = 0;

    for (let i = 0; i < sampleSize; i++) {
        const byte = buffer[i];
        if (byte === 0) {
            nullBytes++;
        } else if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            // Not tab, newline, or carriage return
            nonPrintable++;
        }
    }

    if (nullBytes > NULL_BYTE_THRESHOLD) return true;
    if (sampleSize > 0 && nonPrintable / sampleSize > NON_PRINTABLE_RATIO) return true;

    return false;
}

export function isBinaryFile(filePath: string): boolean {
    const fs = require('fs');
    try {
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(BINARY_DETECTION_SIZE);
        const bytesRead = fs.readSync(fd, buffer, 0, BINARY_DETECTION_SIZE, 0);
        fs.closeSync(fd);
        return isBinaryContent(buffer.subarray(0, bytesRead));
    } catch {
        return false;
    }
}
