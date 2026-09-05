import type { TOAuth2ProvidersKeys } from '@remnawave/backend-contract'

import { toast } from '@heroui/react'
import { isCancel } from 'axios'
import { useEffect, useRef, useState } from 'react'

import {
    assertSessionGeneration,
    getSessionGeneration,
    subscribeSessionChanges
} from '@shared/api/axios'
import { useOAuth2Authorize } from '@shared/api/hooks/auth/auth.hooks'

import { getAuthorizationUrl, InvalidAuthorizationUrlError } from './oauth-providers'

export function useOAuth2Login() {
    const [loadingProvider, setLoadingProvider] = useState<TOAuth2ProvidersKeys | null>(null)
    const attempts = useRef(0)
    const { mutateAsync: authorize } = useOAuth2Authorize()
    useEffect(() => {
        const unsubscribe = subscribeSessionChanges(() => {
            attempts.current++
            setLoadingProvider(null)
        })
        return () => {
            unsubscribe()
            attempts.current++
        }
    }, [])
    const login = async (provider: TOAuth2ProvidersKeys) => {
        const attempt = ++attempts.current
        const generation = getSessionGeneration()
        const current = () => attempt === attempts.current && generation === getSessionGeneration()
        setLoadingProvider(provider)
        try {
            const response = await authorize({ variables: { provider } })
            assertSessionGeneration(generation)
            if (!current()) return
            window.location.assign(getAuthorizationUrl(response.authorizationUrl))
        } catch (error) {
            if (!isCancel(error) && current() && error instanceof InvalidAuthorizationUrlError) {
                toast.danger('OAuth2 Authorize', { description: error.message })
            }
        } finally {
            if (current()) setLoadingProvider(null)
        }
    }
    return { loadingProvider, login }
}
