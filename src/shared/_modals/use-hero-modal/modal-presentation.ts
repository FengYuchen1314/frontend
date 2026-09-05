export interface ModalPresentation {
    invocation: unknown
    scope: unknown
    visible: boolean
    key: number
}

/** Retain the exiting view, but never reuse its form state for a new opening. */
export function nextModalPresentation(
    current: ModalPresentation,
    invocation: unknown,
    scope: unknown,
    visible: boolean
): ModalPresentation {
    if (current.invocation === invocation && current.scope === scope && current.visible === visible)
        return current
    const isNewView =
        visible &&
        (!current.visible || current.invocation !== invocation || current.scope !== scope)
    return { invocation, scope, visible, key: current.key + Number(isNewView) }
}
