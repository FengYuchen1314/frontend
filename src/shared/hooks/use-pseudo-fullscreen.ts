import { useCallback, useId, useLayoutEffect, useState } from 'react'

export interface UsePseudoFullscreenReturn {
    close: () => void
    isFullscreen: boolean
    open: () => void
    toggle: () => void
}

const activeFullscreens = new Set<string>()

export const isPseudoFullscreenActive = () => activeFullscreens.size > 0

export function registerPseudoFullscreen(id: string, target: EventTarget, close: () => void) {
    activeFullscreens.add(id)
    const onKeyDown = (event: Event) => {
        if (
            !('key' in event) ||
            event.key !== 'Escape' ||
            event.defaultPrevented ||
            [...activeFullscreens].at(-1) !== id
        )
            return
        event.preventDefault()
        close()
    }
    target.addEventListener('keydown', onKeyDown)
    return () => {
        activeFullscreens.delete(id)
        target.removeEventListener('keydown', onKeyDown)
    }
}

export function usePseudoFullscreen(initial = false, enabled = true): UsePseudoFullscreenReturn {
    const [requested, setRequested] = useState(initial)
    const isFullscreen = enabled && requested
    const id = useId()
    const close = useCallback(() => {
        activeFullscreens.delete(id)
        setRequested(false)
    }, [id])
    const open = useCallback(() => setRequested(true), [])
    const toggle = useCallback(() => setRequested((value) => !value), [])
    useLayoutEffect(() => {
        if (!isFullscreen) return
        // Bubble phase lets Monaco consume Escape for completion/find first.
        return registerPseudoFullscreen(id, window, close)
    }, [close, id, isFullscreen])

    return { close, isFullscreen, open, toggle }
}
