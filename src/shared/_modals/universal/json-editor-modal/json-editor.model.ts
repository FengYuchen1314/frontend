export function parseJsonEditorValue(
    value: string
): { valid: true; value: string } | { valid: false } {
    const trimmed = value.trim()
    if (trimmed === '') return { valid: true, value: '' }
    try {
        JSON.parse(trimmed)
        return { valid: true, value: trimmed }
    } catch {
        return { valid: false }
    }
}
