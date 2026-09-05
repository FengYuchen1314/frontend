import { createContext, ReactNode, useEffect, useMemo, useSyncExternalStore } from 'react'

import { clearQueryClient } from '@shared/api/query-client'
import { logoutEvents } from '@shared/emitters'
import { resetAllStores } from '@shared/hocs/store-wrapper'

import { removeToken, useToken } from '@entities/auth'

interface AuthContextValues {
    isAuthenticated: boolean
    isInitialized: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValues | null>(null)

interface AuthProviderProps {
    children: ReactNode
}

// localStorage persistence is synchronous before the provider renders. Only
// server rendering/hydration needs a closed initialization snapshot.
const subscribeInitialization = () => () => {}
const getClientInitialized = () => true
const getServerInitialized = () => false

export function AuthProvider({ children }: AuthProviderProps) {
    const isInitialized = useSyncExternalStore(
        subscribeInitialization,
        getClientInitialized,
        getServerInitialized
    )
    const token = useToken()
    const isAuthenticated = Boolean(token)

    useEffect(() => {
        // Logout is synchronous. A closure lock protects nested emissions;
        // React state would not update until after this listener has returned.
        let isLoggingOut = false
        const unsubscribe = logoutEvents.subscribe(() => {
            if (isLoggingOut) return
            isLoggingOut = true
            try {
                try {
                    removeToken()
                } finally {
                    try {
                        resetAllStores()
                    } finally {
                        // Also clear when already anonymous or storage persistence fails.
                        clearQueryClient()
                    }
                }
            } finally {
                isLoggingOut = false
            }
        })

        return unsubscribe
    }, [])

    const value = useMemo(
        () => ({ isAuthenticated, isInitialized }),
        [isAuthenticated, isInitialized]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
