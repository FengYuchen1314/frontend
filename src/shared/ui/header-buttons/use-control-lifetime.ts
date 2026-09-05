import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { getSessionGeneration, subscribeSessionChanges } from '@shared/api/axios'

import { createDialogOperationScope } from './header-controls.model'

export function useDialogSessionKey() {
    return useSyncExternalStore(subscribeSessionChanges, getSessionGeneration, () => 0)
}

export function useControlLifetime(signal?: AbortSignal) {
    const lifetime = useRef({ mounted: true, generation: 0, session: getSessionGeneration() })
    useEffect(() => {
        lifetime.current.mounted = true
        return () => {
            lifetime.current.mounted = false
            lifetime.current.generation++
        }
    }, [])
    return () => {
        const generation = lifetime.current.generation
        const session = lifetime.current.session
        return () =>
            lifetime.current.mounted &&
            lifetime.current.generation === generation &&
            !signal?.aborted &&
            getSessionGeneration() === session
    }
}

// Abort at the close event, before HeroUI's exit animation unmounts children.
// Every reopen gets a fresh content key, even if the previous exit is unfinished.
export function useDialogOperationScope() {
    const [scope, setScope] = useState(() => ({ generation: 0, signal: AbortSignal.abort() }))
    const operations = useRef(createDialogOperationScope())
    useEffect(() => {
        const controller = operations.current
        const unsubscribe = subscribeSessionChanges(() => controller.close())
        return () => {
            unsubscribe()
            controller.close()
        }
    }, [])
    return {
        ...scope,
        onOpenChange(open: boolean) {
            if (open) setScope(operations.current.open())
            else operations.current.close()
        }
    }
}
