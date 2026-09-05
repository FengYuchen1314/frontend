import { useEffect } from 'react'

import { beginNavigationProgress } from '../page/navigation-progress'

export function LoadingProgress() {
    useEffect(() => beginNavigationProgress(), [])

    return null
}
