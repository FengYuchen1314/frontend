import type {
    LauncherFlags,
    LauncherModalCatalog
} from '../../../ui/quick-launcher/quick-launcher.model'
import type {
    IQuickLauncherRoute,
    TQuickIconName,
    TQuickLink,
    TQuickModalId
} from '../../../ui/quick-launcher/quick-links.types'

import { isLauncherLinkAvailable } from '../../../ui/quick-launcher/quick-launcher.model.ts'
import {
    DEFAULT_QUICK_ICON,
    isSafeExternalUrl,
    MAX_QUICK_LABEL,
    MAX_QUICK_LINKS,
    sanitizeQuickLinks
} from '../../../ui/quick-launcher/quick-links.types.ts'

export type AddKind = TQuickLink['kind']
export interface QuickLinksDraft {
    links: TQuickLink[]
    kind: AddKind
    modalId: TQuickModalId | null
    routePath: string | null
    routeSearch: string
    label: string
    url: string
    icon: TQuickIconName
    error: string | null
    open: boolean
    scope: unknown
}
export interface QuickLinksContext {
    routes: readonly IQuickLauncherRoute[]
    flags: LauncherFlags
    modals: LauncherModalCatalog
}

export function createQuickLinksDraft(
    links: unknown,
    open: boolean,
    scope: unknown
): QuickLinksDraft {
    return {
        links: sanitizeQuickLinks(links),
        kind: 'modal',
        modalId: null,
        routePath: null,
        routeSearch: '',
        label: '',
        url: '',
        icon: DEFAULT_QUICK_ICON,
        error: null,
        open,
        scope
    }
}

/** Incoming preferences never replace the same open draft; a new show starts a new draft. */
export function syncQuickLinksDraft(
    draft: QuickLinksDraft,
    stored: unknown,
    open: boolean,
    scope: unknown
): QuickLinksDraft {
    return draft.open === open && draft.scope === scope
        ? draft
        : createQuickLinksDraft(stored, open, scope)
}

export function switchQuickLinkKind(draft: QuickLinksDraft, kind: AddKind): QuickLinksDraft {
    return { ...createQuickLinksDraft(draft.links, draft.open, draft.scope), kind }
}

export function searchQuickLinkRoutes(
    draft: QuickLinksDraft,
    routeSearch: string
): QuickLinksDraft {
    // A newly filtered collection must not leave a hidden old selection addable.
    return { ...draft, routeSearch, routePath: null }
}

export function visibleQuickLinks(draft: QuickLinksDraft, context: QuickLinksContext) {
    return draft.links.flatMap((link, index) =>
        link.kind !== 'modal' ||
        isLauncherLinkAvailable(link, context.routes, context.flags, context.modals)
            ? [{ link, index }]
            : []
    )
}

export function pendingQuickLink(
    draft: QuickLinksDraft,
    context: QuickLinksContext
): TQuickLink | null {
    if (draft.links.length >= MAX_QUICK_LINKS) return null
    if (draft.kind === 'modal') {
        const link: TQuickLink | null = draft.modalId ? { kind: 'modal', id: draft.modalId } : null
        return link &&
            isLauncherLinkAvailable(link, context.routes, context.flags, context.modals) &&
            !draft.links.some((item) => item.kind === 'modal' && item.id === draft.modalId)
            ? link
            : null
    }
    if (draft.kind === 'route') {
        const link: TQuickLink | null = draft.routePath
            ? { kind: 'route', path: draft.routePath }
            : null
        return link &&
            isLauncherLinkAvailable(link, context.routes, context.flags, context.modals) &&
            !draft.links.some((item) => item.kind === 'route' && item.path === draft.routePath)
            ? link
            : null
    }
    const url = draft.url.trim()
    const label = draft.label.trim().slice(0, MAX_QUICK_LABEL)
    return label &&
        isSafeExternalUrl(url) &&
        !draft.links.some(
            (item) => item.kind === 'external' && new URL(item.url).href === new URL(url).href
        )
        ? { kind: 'external', label, url, icon: draft.icon }
        : null
}

export function addQuickLink(draft: QuickLinksDraft, context: QuickLinksContext): QuickLinksDraft {
    const link = pendingQuickLink(draft, context)
    if (!link) return draft
    return { ...switchQuickLinkKind(draft, draft.kind), links: [...draft.links, link] }
}

export function removeQuickLink(draft: QuickLinksDraft, index: number): QuickLinksDraft {
    return { ...draft, links: draft.links.filter((_, row) => row !== index), error: null }
}

/** Move only visible positions; hidden feature-gated entries remain in the saved preference. */
export function moveQuickLink(
    draft: QuickLinksDraft,
    from: number,
    to: number,
    context: QuickLinksContext
): QuickLinksDraft {
    const rows = visibleQuickLinks(draft, context)
    const source = rows[from]
    const target = rows[to]
    if (!source || !target || from === to) return draft
    const links = [...draft.links]
    const [moved] = links.splice(source.index, 1)
    links.splice(target.index, 0, moved)
    return { ...draft, links, error: null }
}

export function saveQuickLinksDraft(
    draft: QuickLinksDraft,
    persist: (links: TQuickLink[]) => void,
    close: () => void
): QuickLinksDraft {
    try {
        persist(sanitizeQuickLinks(draft.links))
    } catch {
        return {
            ...draft,
            error: 'Could not save quick links. Your changes are still here; try again.'
        }
    }
    close()
    return draft
}
