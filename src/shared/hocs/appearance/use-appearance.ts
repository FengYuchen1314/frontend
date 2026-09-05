import { useSyncExternalStore } from 'react'

import { parseThemePreference, resolveTheme, ThemePreference } from './appearance-model'

const preferenceKey = 'rw-color-scheme'
// Read the former preference only when the new native preference is absent.
const legacyPreferenceKey = 'mantine-color-scheme-value'
const listeners = new Set<() => void>()
const systemQuery = '(prefers-color-scheme: dark)'

function getPreference(): ThemePreference {
    if (typeof window === 'undefined') return 'dark'
    try {
        return parseThemePreference(
            window.localStorage.getItem(preferenceKey) ??
                window.localStorage.getItem(legacyPreferenceKey)
        )
    } catch {
        return 'dark'
    }
}

function getSnapshot() {
    return resolveTheme(
        getPreference(),
        typeof window !== 'undefined' && window.matchMedia(systemQuery).matches
    )
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    const media = window.matchMedia(systemQuery)
    const onStorage = (event: StorageEvent) => {
        if (
            event.key === null ||
            event.key === preferenceKey ||
            event.key === legacyPreferenceKey
        ) {
            listener()
        }
    }
    media.addEventListener('change', listener)
    window.addEventListener('storage', onStorage)
    return () => {
        listeners.delete(listener)
        media.removeEventListener('change', listener)
        window.removeEventListener('storage', onStorage)
    }
}

export function setThemePreference(preference: ThemePreference) {
    window.localStorage.setItem(preferenceKey, preference)
    listeners.forEach((listener) => listener())
}

export function useAppearance() {
    return useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as const)
}
