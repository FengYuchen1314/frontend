import type { IQuickModalEntry } from './quick-links.catalog'
import type {
    ILauncherPosition,
    IQuickLauncherRoute,
    TQuickLink,
    TQuickModalId
} from './quick-links.types'

import { isSafeExternalUrl, MAX_QUICK_COLUMNS } from './quick-links.types.ts'

export const LAUNCHER_CELL_SIZE = 58
export const LAUNCHER_HEADER_HEIGHT = 29
export const LAUNCHER_HOLD_DELAY = 320
export const LAUNCHER_HOLD_TOLERANCE = 6
export const LAUNCHER_OFFSET = 5

export interface LauncherSize {
    width: number
    height: number
}
export type LauncherFlags = Partial<Record<NonNullable<IQuickModalEntry['experimental']>, boolean>>
export type LauncherModalCatalog = Record<TQuickModalId, IQuickModalEntry>

export function isLauncherLinkAvailable(
    link: TQuickLink,
    routes: readonly IQuickLauncherRoute[],
    flags: LauncherFlags,
    modals: LauncherModalCatalog
): boolean {
    if (link.kind === 'modal') {
        const entry = modals[link.id]
        return Boolean(entry && (!entry.experimental || flags[entry.experimental]))
    }
    if (link.kind === 'route') return routes.some((route) => route.href === link.path)
    return isSafeExternalUrl(link.url)
}

export function quickLinkKey(link: TQuickLink): string {
    return link.kind === 'modal'
        ? `modal:${link.id}`
        : link.kind === 'route'
          ? `route:${link.path}`
          : `external:${link.url}:${link.label}:${link.icon}`
}

export function runLauncherLink(
    link: TQuickLink,
    routes: readonly IQuickLauncherRoute[],
    flags: LauncherFlags,
    modals: LauncherModalCatalog,
    navigate: (path: string) => void,
    openExternal: (url: string, target: string, features: string) => void
): boolean {
    if (!isLauncherLinkAvailable(link, routes, flags, modals)) return false
    if (link.kind === 'modal') modals[link.id].open()
    else if (link.kind === 'route') navigate(link.path)
    else openExternal(link.url, '_blank', 'noopener,noreferrer')
    return true
}

export function launcherColumns(
    preference: number | null,
    count: number,
    viewportWidth: number
): number {
    const preferred = preference && Number.isInteger(preference) ? preference : 3
    const room = Math.max(1, Math.floor((viewportWidth - 2) / LAUNCHER_CELL_SIZE))
    return Math.min(Math.max(1, preferred), Math.max(count, 1), MAX_QUICK_COLUMNS, room)
}

export function clampLauncherPosition(
    position: ILauncherPosition,
    size: LauncherSize,
    viewport: LauncherSize
): ILauncherPosition {
    return {
        x: Math.min(
            Math.max(Number.isFinite(position.x) ? position.x : 0, 0),
            Math.max(viewport.width - size.width, 0)
        ),
        y: Math.min(
            Math.max(Number.isFinite(position.y) ? position.y : 0, 0),
            Math.max(viewport.height - size.height, 0)
        )
    }
}

export function resizeLauncherColumns(
    clientX: number,
    left: number,
    viewportWidth: number
): number {
    const room = Math.max(Math.floor((viewportWidth - left - 2) / LAUNCHER_CELL_SIZE), 1)
    return Math.min(
        Math.max(Math.round((clientX - left) / LAUNCHER_CELL_SIZE), 1),
        MAX_QUICK_COLUMNS,
        room
    )
}

export function createLauncherGesture() {
    let current: null | {
        pointerId: number
        startX: number
        startY: number
        offsetX: number
        offsetY: number
        mode: 'pending' | 'drag' | 'cancelled'
    } = null
    let suppressClick = false
    return {
        begin: (
            pointerId: number,
            x: number,
            y: number,
            position: ILauncherPosition,
            immediate: boolean
        ) => {
            if (current) return false
            suppressClick = false
            current = {
                pointerId,
                startX: x,
                startY: y,
                offsetX: x - position.x,
                offsetY: y - position.y,
                mode: immediate ? 'drag' : 'pending'
            }
            return true
        },
        activate: (pointerId: number) => {
            if (!current || current.pointerId !== pointerId || current.mode !== 'pending')
                return false
            current.mode = 'drag'
            return true
        },
        move: (
            pointerId: number,
            x: number,
            y: number,
            size: LauncherSize,
            viewport: LauncherSize
        ) => {
            if (!current || current.pointerId !== pointerId) return null
            if (
                current.mode === 'pending' &&
                Math.hypot(x - current.startX, y - current.startY) > LAUNCHER_HOLD_TOLERANCE
            )
                current.mode = 'cancelled'
            if (current.mode !== 'drag') return null
            return clampLauncherPosition(
                { x: x - current.offsetX, y: y - current.offsetY },
                size,
                viewport
            )
        },
        finish: (pointerId: number) => {
            if (!current || current.pointerId !== pointerId) return false
            const dragged = current.mode === 'drag'
            current = null
            suppressClick = dragged
            return dragged
        },
        hasPointer: (pointerId: number) => current?.pointerId === pointerId,
        cancel: () => {
            current = null
            suppressClick = false
        },
        shouldSuppressClick: () => suppressClick || current?.mode === 'drag',
        clearSuppressedClick: () => {
            suppressClick = false
        }
    }
}

/** A pending long-press has no pointer capture yet. Releasing outside the floating
 * window (or switching apps) must cancel its timer before it can capture a dead pointer. */
export function observeLauncherPointerEnd(
    target: EventTarget,
    gesture: ReturnType<typeof createLauncherGesture>,
    onCancel: () => void
) {
    const cancel = () => {
        gesture.cancel()
        onCancel()
    }
    const release = (event: Event) => {
        if ('pointerId' in event && gesture.hasPointer(Number(event.pointerId))) cancel()
    }
    target.addEventListener('pointerup', release)
    target.addEventListener('pointercancel', release)
    target.addEventListener('blur', cancel)
    return () => {
        target.removeEventListener('pointerup', release)
        target.removeEventListener('pointercancel', release)
        target.removeEventListener('blur', cancel)
    }
}
