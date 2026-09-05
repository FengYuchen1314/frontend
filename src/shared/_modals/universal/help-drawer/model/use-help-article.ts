import type { THelpDrawerAvailableScreen } from '../help-drawer.types'

import { useEffect, useState } from 'react'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'

import { loadHelpArticle } from './help-article'

export function useHelpArticle(
    screen: THelpDrawerAvailableScreen,
    language: string,
    modal: HeroModalController
) {
    const [revision, setRevision] = useState(0)
    const key = JSON.stringify([screen, language, revision])
    const [state, setState] = useState({
        key: '',
        loading: true,
        content: '',
        language: '',
        error: ''
    })
    const { isOpen, capture } = modal
    useEffect(() => {
        if (!isOpen) return
        const controller = new AbortController()
        const lease = capture()
        void loadHelpArticle(screen, language, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted && lease.isCurrent())
                    setState({ key, loading: false, error: '', ...result })
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted && lease.isCurrent())
                    setState({
                        key,
                        loading: false,
                        content: '',
                        language: '',
                        error: error instanceof Error ? error.message : 'Documentation unavailable'
                    })
            })
        return () => controller.abort()
    }, [screen, language, key, isOpen, capture])
    return {
        ...(state.key === key ? state : { loading: true, content: '', language: '', error: '' }),
        retry: () => setRevision((value) => value + 1)
    }
}
