import { toast } from '@heroui/react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { getSessionGeneration } from '@shared/api/axios'
import { useGetUpdateStatus, useTriggerUpdate } from '@shared/api/hooks'

import {
    canRequestPanelUpdate,
    createPanelUpdateLifecycle,
    sameUpdateTarget,
    type PanelUpdateEvent,
    type PanelUpdateStatus
} from './panel-updater.model'

export function usePanelUpdater(signal?: AbortSignal) {
    const renderedSession = getSessionGeneration()
    const { t } = useTranslation()
    const statusQuery = useGetUpdateStatus({
        rQueryParams: { refetchInterval: 2_500, refetchIntervalInBackground: true }
    })
    const mutation = useTriggerUpdate()
    const lifecycle = useRef<ReturnType<typeof createPanelUpdateLifecycle> | null>(null)
    const notifyRef = useRef((_event: PanelUpdateEvent) => {})
    useEffect(() => {
        notifyRef.current = (event) => {
            switch (event.type) {
                case 'accepted':
                    toast.success(t('build-info.updater.request-accepted-title'), {
                        description: t('build-info.updater.request-accepted-message')
                    })
                    break
                case 'rejected':
                    toast.warning(t('build-info.updater.request-rejected-title'), {
                        description:
                            event.message ?? t('build-info.updater.request-rejected-message')
                    })
                    break
                case 'request-failed':
                    toast.danger(t('build-info.updater.request-failed-title'), {
                        description: event.message ?? t('build-info.updater.failed')
                    })
                    break
                case 'succeeded':
                    toast.success(t('build-info.updater.state-succeeded'), {
                        description: t('build-info.updater.succeeded')
                    })
                    break
                case 'failed':
                    toast.danger(t('build-info.updater.state-failed'), {
                        description: event.message ?? t('build-info.updater.failed')
                    })
                    break
            }
        }
    }, [t])
    useEffect(() => {
        const session = getSessionGeneration()
        const controller = createPanelUpdateLifecycle({
            isCurrent: () => !signal?.aborted && getSessionGeneration() === session,
            notify: (event) => notifyRef.current(event),
            reload: () => globalThis.location.reload(),
            schedule: (callback, delay) => {
                const timer = globalThis.setTimeout(callback, delay)
                return () => globalThis.clearTimeout(timer)
            }
        })
        lifecycle.current = controller
        const abort = () => controller.dispose()
        signal?.addEventListener('abort', abort, { once: true })
        return () => {
            signal?.removeEventListener('abort', abort)
            controller.dispose()
            lifecycle.current = null
        }
    }, [signal])
    useEffect(() => {
        lifecycle.current?.observe(statusQuery.data)
    }, [statusQuery.data])
    const canUpdate = canRequestPanelUpdate(
        statusQuery.data,
        statusQuery.isFetching || mutation.isPending,
        statusQuery.error
    )
    const confirm = async (confirmed: PanelUpdateStatus) => {
        if (signal?.aborted || getSessionGeneration() !== renderedSession) return false
        if (!canUpdate || !statusQuery.data || !sameUpdateTarget(confirmed, statusQuery.data)) {
            notifyRef.current({ type: 'rejected' })
            return false
        }
        const controller = lifecycle.current
        const accepted = await controller?.request(statusQuery.data, () => mutation.mutateAsync({}))
        if (
            lifecycle.current === controller &&
            controller &&
            !signal?.aborted &&
            getSessionGeneration() === renderedSession
        )
            void statusQuery.refetch()
        return accepted ?? false
    }
    return { ...statusQuery, canUpdate, confirm, isTriggering: mutation.isPending }
}
