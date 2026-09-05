import { toast } from '@heroui/react'
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { getSessionGeneration, subscribeSessionChanges } from '@shared/api/axios'

import { createPageHeaderCopy } from './page-header-copy.model'

export function usePageHeaderCopy(description: string | undefined) {
    const { t } = useTranslation()
    const session = useSyncExternalStore(subscribeSessionChanges, getSessionGeneration, () => 0)
    const lifecycle = useRef<ReturnType<typeof createPageHeaderCopy> | null>(null)

    // Bind pending writes to the visible description at commit, before a later
    // clipboard callback can announce a result for another page or account.
    useLayoutEffect(() => {
        const controller = createPageHeaderCopy({
            value: description,
            isCurrent: () => getSessionGeneration() === session,
            write: (value) => navigator.clipboard.writeText(value),
            success: (value) => toast.success(t('common.message.copied'), { description: value }),
            failure: (error) =>
                toast.danger(t('common.message.error'), {
                    description:
                        error instanceof Error ? error.message : t('common.action.try-again')
                })
        })
        lifecycle.current = controller
        return () => {
            controller.dispose()
            lifecycle.current = null
        }
    }, [description, session, t])

    return () => lifecycle.current?.copy(description) ?? Promise.resolve(false)
}
