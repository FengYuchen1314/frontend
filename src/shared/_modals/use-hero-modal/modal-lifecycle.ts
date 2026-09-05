import type { NiceModalHandler } from '@ebay/nice-modal-react'

type Handler = Pick<
    NiceModalHandler,
    'visible' | 'keepMounted' | 'hide' | 'resolve' | 'resolveHide' | 'remove'
>

/** Dialog ownership is independent of mutation ownership: a closed/replaced view
 * must not be closed again by a successful request from its previous instance. */
export function createHeroModalLifecycle(getHandler: () => Handler, getSession: () => number) {
    let epoch = 0
    let scope: unknown
    let invocation: unknown
    let openingSession = getSession()
    let visible = false
    let active = false
    let mounted = true
    let completed = false
    let resolved = false
    const sync = (nextScope: unknown, nextInvocation?: unknown) => {
        const nextVisible = getHandler().visible
        if (nextVisible !== visible || nextScope !== scope || nextInvocation !== invocation) {
            epoch++
            active = nextVisible
            if (nextVisible) openingSession = getSession()
            completed = false
            if (nextVisible || nextScope !== scope || nextInvocation !== invocation)
                resolved = false
        }
        visible = nextVisible
        scope = nextScope
        invocation = nextInvocation
    }
    const close = (value?: unknown) => {
        if (!mounted || !active) return
        active = false
        epoch++
        resolved = true
        getHandler().resolve(value)
        void getHandler().hide()
    }
    return {
        sync,
        close,
        capture: () => {
            const owner = epoch
            // A fresh click in an old visible dialog is still old intent. Never
            // let it acquire the replacement account's authorization generation.
            const session = openingSession
            return {
                isCurrent: () => mounted && active && owner === epoch && session === getSession()
            }
        },
        afterClose: () => {
            if (!mounted || active || visible || completed) return
            completed = true
            if (!resolved) getHandler().resolve(undefined)
            getHandler().resolveHide()
            if (!getHandler().keepMounted) getHandler().remove()
        },
        mount: () => {
            if (!mounted) {
                mounted = true
                active = visible
            }
        },
        dispose: () => {
            mounted = false
            active = false
            epoch++
        }
    }
}
