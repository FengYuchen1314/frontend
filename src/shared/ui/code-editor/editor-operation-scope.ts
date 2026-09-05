export interface EditorSetupContext {
    signal: AbortSignal
    isCurrent: () => boolean
}

/** View-owned cancellation; no token or editor text is stored outside the view. */
export function createEditorOperationScope() {
    let generation = 0
    let active = false
    let ownerIsCurrent = () => false
    const pending = new Set<AbortController>()
    const cancel = () => {
        active = false
        generation++
        pending.forEach((controller) => controller.abort())
        pending.clear()
    }
    const isCurrent = () => active && ownerIsCurrent()
    return {
        activate: (check: () => boolean) => {
            cancel()
            ownerIsCurrent = check
            active = true
        },
        cancel,
        isCurrent,
        begin: () => {
            const version = generation
            const controller = new AbortController()
            pending.add(controller)
            const current = () =>
                isCurrent() && generation === version && !controller.signal.aborted
            return {
                signal: controller.signal,
                isCurrent: current,
                finish: () => pending.delete(controller),
                cancel: () => {
                    controller.abort()
                    pending.delete(controller)
                }
            }
        }
    }
}

export async function runEditorSchemaSetup(
    setup: (context: EditorSetupContext) => Promise<void> | void,
    context: EditorSetupContext
): Promise<'ready' | 'error' | 'stale'> {
    if (!context.isCurrent()) return 'stale'
    try {
        await setup(context)
        return context.isCurrent() ? 'ready' : 'stale'
    } catch {
        return context.isCurrent() ? 'error' : 'stale'
    }
}

export async function saveEditorValue(
    value: string,
    save: (value: string) => void | Promise<void>,
    context: EditorSetupContext
): Promise<'saved' | 'error' | 'stale'> {
    if (!context.isCurrent()) return 'stale'
    try {
        await save(value)
        return context.isCurrent() ? 'saved' : 'stale'
    } catch {
        return context.isCurrent() ? 'error' : 'stale'
    }
}
