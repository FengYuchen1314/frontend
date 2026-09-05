import { ProgressBar } from '@heroui/react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { getNavigationProgressSnapshot, subscribeNavigationProgress } from './navigation-progress'

export function NavigationProgressBar() {
    const { t } = useTranslation()
    const pending = useSyncExternalStore(
        subscribeNavigationProgress,
        getNavigationProgressSnapshot,
        () => false
    )
    if (!pending) return null

    return (
        <ProgressBar
            aria-label={t('common.message.loading')}
            className="pointer-events-none fixed inset-x-0 top-0 z-[11000]"
            isIndeterminate
        >
            <ProgressBar.Track className="h-0.5 rounded-none">
                <ProgressBar.Fill className="rounded-none" />
            </ProgressBar.Track>
        </ProgressBar>
    )
}
