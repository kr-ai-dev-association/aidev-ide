/**
 * Semantic Boolean Parsing
 * Handles various LLM boolean output formats: true, 'true', 'yes', '1', 1, etc.
 */
export function semanticBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        return v === 'true' || v === 'yes' || v === '1' || v === 'on';
    }
    return false;
}
