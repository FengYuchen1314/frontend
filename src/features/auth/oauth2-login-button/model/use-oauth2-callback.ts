import { toast } from '@heroui/react'
import { OAuth2CallbackCommand } from '@remnawave/backend-contract'
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'

import { useOauth2Callback } from '@shared/api/hooks/auth/auth.hooks'
import { ROUTES } from '@shared/constants/routes'
import { logoutEvents } from '@shared/emitters'
import { consumeReturnTo } from '@shared/utils/return-to.util'

export function useOAuth2CallbackFlow() {
    const { provider } = useParams()
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const request = useMemo(
        () => OAuth2CallbackCommand.RequestBodySchema.safeParse({ provider, code, state }),
        [provider, code, state]
    )
    const sent = useRef<string | null>(null)
    const { mutate: oauth2Callback, isSuccess } = useOauth2Callback({
        mutationFns: {
            onSuccess: () => navigate(consumeReturnTo() ?? ROUTES.DASHBOARD.HOME),
            onError: (error) => {
                toast.danger('OAuth2 Callback', { description: error.message })
                logoutEvents.emit()
                navigate(ROUTES.AUTH.LOGIN)
            }
        }
    })
    useEffect(() => {
        if (!request.success || !request.data.code || !request.data.state) return
        const identity = JSON.stringify(request.data)
        if (sent.current === identity) return
        sent.current = identity
        oauth2Callback({ variables: request.data })
    }, [request, oauth2Callback])
    return {
        isValid: request.success && Boolean(request.data.code && request.data.state),
        isSuccess,
        backToLogin: () => navigate(ROUTES.AUTH.LOGIN)
    }
}
