import type { GetUpdateStatusCommand, TriggerUpdateCommand } from '@remnawave/backend-contract'

export type PanelUpdateStatus = GetUpdateStatusCommand.Response['response']
export type PanelUpdateEvent = {
    type: 'accepted' | 'rejected' | 'request-failed' | 'succeeded' | 'failed'
    message?: string
}

export function canRequestPanelUpdate(
    status: PanelUpdateStatus | undefined,
    busy = false,
    error: unknown = null
) {
    return (
        !busy &&
        !error &&
        status?.configured === true &&
        status.reachable &&
        status.updateAvailable === true &&
        status.state !== 'UPDATING'
    )
}

export function sameUpdateTarget(left: PanelUpdateStatus, right: PanelUpdateStatus | undefined) {
    return Boolean(
        right &&
        left.channel === right.channel &&
        left.targetVersion === right.targetVersion &&
        left.currentVersion === right.currentVersion
    )
}

export function createPanelUpdateLifecycle(deps: {
    isCurrent(): boolean
    notify(event: PanelUpdateEvent): void
    reload(): void
    schedule(callback: () => void, delay: number): () => void
}) {
    let disposed = false
    let pending = false
    let watch: { baseline: string | null; seenRunning: boolean } | null = null
    let cancelReload: (() => void) | undefined
    const current = () => !disposed && deps.isCurrent()
    return {
        async request(
            status: PanelUpdateStatus,
            trigger: () => Promise<TriggerUpdateCommand.Response['response']>
        ) {
            if (!current() || pending || !canRequestPanelUpdate(status)) return false
            pending = true
            try {
                const result = await trigger()
                if (!current()) return false
                if (result.accepted) {
                    cancelReload?.()
                    watch = { baseline: status.updatedAt, seenRunning: false }
                    deps.notify({ type: 'accepted' })
                    return true
                }
                deps.notify({ type: 'rejected', message: result.message ?? undefined })
                return false
            } catch (error) {
                if (current())
                    deps.notify({
                        type: 'request-failed',
                        message: error instanceof Error ? error.message : undefined
                    })
                return false
            } finally {
                pending = false
            }
        },
        observe(status: PanelUpdateStatus | undefined) {
            if (!current() || !watch || !status) return
            if (status.state === 'UPDATING') {
                watch.seenRunning = true
                return
            }
            if (status.updatedAt === watch.baseline && !watch.seenRunning) return
            if (status.state === 'SUCCEEDED') {
                watch = null
                deps.notify({ type: 'succeeded' })
                if (current())
                    cancelReload = deps.schedule(() => {
                        if (current()) deps.reload()
                    }, 1_200)
            } else if (status.state === 'FAILED') {
                watch = null
                deps.notify({ type: 'failed', message: status.lastError ?? undefined })
            }
        },
        dispose() {
            disposed = true
            watch = null
            cancelReload?.()
        }
    }
}
