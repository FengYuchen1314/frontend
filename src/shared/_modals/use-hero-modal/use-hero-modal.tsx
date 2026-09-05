import type { NiceModalHandler } from '@ebay/nice-modal-react'

import { useEffect, useEffectEvent, useLayoutEffect, useState } from 'react'

import { getSessionGeneration } from '@shared/api/axios'

import { createHeroModalLifecycle } from './modal-lifecycle'

export function useHeroModal({ modal, scopeKey }: { modal: NiceModalHandler; scopeKey?: string }) {
    const [{ owner, setHandler }] = useState(() => {
        let handler = modal
        return {
            owner: createHeroModalLifecycle(() => handler, getSessionGeneration),
            setHandler: (next: NiceModalHandler) => {
                handler = next
            }
        }
    })
    // Publish only committed props. Layout effects complete before asynchronous
    // work can observe a new entity, without mutating refs during concurrent render.
    useLayoutEffect(() => {
        setHandler(modal)
        owner.sync(scopeKey, modal.args)
    }, [modal, scopeKey, owner, setHandler])
    useLayoutEffect(() => {
        owner.mount()
        return () => owner.dispose()
    }, [owner])
    return {
        isOpen: modal.visible,
        onOpenChange: (open: boolean) => {
            if (!open) owner.close()
        },
        close: () => owner.close(),
        resolveAndClose: owner.close,
        afterClose: owner.afterClose,
        capture: owner.capture
    }
}

/** Place inside Modal.Backdrop. React Aria retains this subtree through its exit
 * animation; removing NiceModal here preserves that lifecycle and FocusScope. */
export function HeroModalPresence({ onExitComplete }: { onExitComplete: () => void }) {
    const afterExit = useEffectEvent(onExitComplete)
    useEffect(() => () => afterExit(), [])
    return null
}

export type HeroModalController = ReturnType<typeof useHeroModal>
