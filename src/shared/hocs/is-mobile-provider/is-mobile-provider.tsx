import { createContext, ReactNode, useSyncExternalStore } from 'react'

const MOBILE_QUERY = `(max-width: 64rem)`

function subscribe(listener: () => void) {
    const media = window.matchMedia(MOBILE_QUERY)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
}

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches
const getServerSnapshot = () => false

// eslint-disable-next-line react-refresh/only-export-components
export const IsMobileContext = createContext<boolean>(false)

interface IsMobileProviderProps {
    children: ReactNode
}

export function IsMobileProvider({ children }: IsMobileProviderProps) {
    const isMobile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

    return <IsMobileContext.Provider value={isMobile}>{children}</IsMobileContext.Provider>
}
