import { ProgressBar } from '@heroui/react'
import { useTranslation } from 'react-i18next'

import { LoadingProgress } from './loading-progress'

export function LoadingScreen({
    height = '100dvh',
    text = undefined,
    value
}: {
    height?: string
    text?: string
    value?: number
}) {
    const { t } = useTranslation()
    const progress =
        typeof value === 'number' && Number.isFinite(value)
            ? Math.min(100, Math.max(0, value))
            : undefined
    const label = text || t('common.message.loading')

    return (
        <div
            className="flex items-center justify-center"
            style={{
                minHeight: `max(0px, calc(${height} - var(--app-shell-header-height, 0px) - 20px))`
            }}
        >
            <LoadingProgress />
            <div className="flex w-full flex-col items-center gap-3">
                {text && <p className="text-center text-lg text-foreground">{text}</p>}
                <ProgressBar
                    aria-label={label}
                    className="w-4/5 max-w-lg"
                    color="accent"
                    isIndeterminate={progress === undefined}
                    size="sm"
                    value={progress}
                >
                    {progress !== undefined && (
                        <ProgressBar.Output className="text-xs text-muted" />
                    )}
                    <ProgressBar.Track>
                        <ProgressBar.Fill />
                    </ProgressBar.Track>
                </ProgressBar>
            </div>
        </div>
    )
}
