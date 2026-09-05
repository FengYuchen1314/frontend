export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export function parseThemePreference(value: null | string): ThemePreference {
    if (value === 'light' || value === 'dark') return value
    if (value === 'system' || value === 'auto') return 'system'
    return 'dark'
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
    return preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference
}
