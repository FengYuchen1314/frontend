import { onlineManager, useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { getSessionGeneration, subscribeSessionChanges } from '@shared/api/axios'

import { connectionProbeOptions } from './connection-probe'

function subscribeToOnlineManager(onStoreChange: () => void) {
    return onlineManager.subscribe(onStoreChange)
}

function getOnlineSnapshot() {
    return onlineManager.isOnline()
}

export function useConnectionProbe() {
    const isOnline = useSyncExternalStore(subscribeToOnlineManager, getOnlineSnapshot, () => true)
    const generation = useSyncExternalStore(subscribeSessionChanges, getSessionGeneration, () => 0)

    useQuery({
        ...connectionProbeOptions(generation),
        enabled: !isOnline
    })

    return { isOnline }
}
