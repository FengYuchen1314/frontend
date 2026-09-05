import type { TOpenEntityTarget } from '@shared/_modals/open-entity-targets'

export function resolveOpenEntity(
    targets: Record<string, TOpenEntityTarget>,
    home: string,
    entity: string | undefined,
    id: string | undefined
) {
    const target = entity && Object.hasOwn(targets, entity) ? targets[entity] : undefined
    if (!target || !id) return { kind: 'redirect' as const, to: home }
    if (!target.validate(id)) return { kind: 'redirect' as const, to: target.fallback }
    if (target.kind === 'route') return { kind: 'redirect' as const, to: target.buildPath(id) }
    return { kind: 'modal' as const, id, target, key: `${entity}:${id}` }
}

export function createModalReturnTracker() {
    let wasVisible = false
    return (isVisible: boolean) => {
        if (isVisible) wasVisible = true
        return wasVisible && !isVisible
    }
}
