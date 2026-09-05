export function isMieruProfileConfig(config: unknown): boolean {
    return (
        typeof config === 'object' &&
        config !== null &&
        !Array.isArray(config) &&
        (config as Record<string, unknown>).runtime === 'MIERU'
    )
}
