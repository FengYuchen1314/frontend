import { useSyncExternalStore } from 'react'

import i18n from './i18n'

function subscribe(listener: () => void) {
    i18n.on('languageChanged', listener)
    i18n.on('initialized', listener)
    return () => {
        i18n.off('languageChanged', listener)
        i18n.off('initialized', listener)
    }
}

function getSnapshot() {
    return i18n.resolvedLanguage || i18n.language || 'en'
}

export function useAppLocale() {
    return useSyncExternalStore(subscribe, getSnapshot, () => 'en')
}
