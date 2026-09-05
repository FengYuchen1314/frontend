// Router transitions and independent async work have separate ownership. A route
// completing must never hide another task's still-active progress indicator.
const tasks = new Set<symbol>()
const listeners = new Set<() => void>()
let routePending = false
let snapshot = false

function publish() {
    const next = routePending || tasks.size > 0
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
}

export function setRouteNavigationPending(pending: boolean) {
    routePending = pending
    publish()
}

export function beginNavigationProgress(): () => void {
    const token = Symbol('navigation-progress-task')
    tasks.add(token)
    publish()
    return () => {
        if (tasks.delete(token)) publish()
    }
}

export function subscribeNavigationProgress(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export const getNavigationProgressSnapshot = () => snapshot
export const getServerNavigationProgressSnapshot = () => false
