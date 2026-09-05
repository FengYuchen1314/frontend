import { Button, Spinner, toast } from '@heroui/react'
import { GetStatusCommand } from '@remnawave/backend-contract'
import {
    type PublicKeyCredentialRequestOptionsJSON,
    startAuthentication
} from '@simplewebauthn/browser'
import { isCancel } from 'axios'
import { useEffect, useState } from 'react'
import { TbFingerprint } from 'react-icons/tb'

import {
    assertSessionGeneration,
    getSessionGeneration,
    subscribeSessionChanges
} from '@shared/api/axios'
import { usePasskeyAuthenticationOptions, usePasskeyAuthenticationVerify } from '@shared/api/hooks'

import { setToken } from '@entities/auth/session-store'

import { createPasskeyLoginFlow } from './passkey-login-flow'

interface IProps {
    authentication: NonNullable<GetStatusCommand.Response['response']['authentication']>
}

export const PasskeyLoginButtonFeature = (props: IProps) => {
    const { authentication } = props

    const [isLoading, setIsLoading] = useState(false)
    const [flow] = useState(() =>
        createPasskeyLoginFlow({
            getGeneration: getSessionGeneration,
            assertGeneration: assertSessionGeneration
        })
    )

    useEffect(() => {
        const invalidate = () => {
            flow.invalidate()
        }
        const unsubscribe = subscribeSessionChanges(() => {
            invalidate()
            setIsLoading(false)
        })
        return () => {
            unsubscribe()
            invalidate()
        }
    }, [flow])

    const { mutateAsync: verifyAuthentication } = usePasskeyAuthenticationVerify()
    const { refetch } = usePasskeyAuthenticationOptions()

    const handlePasskeyLogin = async () => {
        setIsLoading(true)

        try {
            await flow.run({
                getOptions: async () => {
                    const options = await refetch()
                    if (options.isError || !options.data) {
                        throw (
                            options.error ?? new Error('Passkey authentication options unavailable')
                        )
                    }
                    return options.data as PublicKeyCredentialRequestOptionsJSON
                },
                authenticate: (optionsJSON) => startAuthentication({ optionsJSON }),
                verify: (response) => verifyAuthentication({ variables: { response } }),
                onSuccess: (data) => {
                    setIsLoading(false)
                    setToken({ token: data.accessToken })
                    toast.success('Passkey Verified', {
                        description: 'Passkey authenticated successfully'
                    })
                },
                onSettled: () => setIsLoading(false)
            })
        } catch (error: unknown) {
            if (isCancel(error)) return
            if (error instanceof Error) {
                if (error.name === 'NotAllowedError') {
                    toast.warning('Passkey Authentication', {
                        description: 'Authentication was cancelled'
                    })
                } else if (error.name === 'NotSupportedError') {
                    toast.danger('Passkey Authentication', {
                        description: 'Passkeys are not supported on this device'
                    })
                }
            }
        }
    }

    if (!authentication.passkey.enabled) return null

    return (
        <Button
            isPending={isLoading}
            onPress={() => {
                void handlePasskeyLogin()
            }}
            variant="secondary"
            className="w-full"
        >
            {isLoading ? (
                <Spinner size="sm" color="current" />
            ) : (
                <TbFingerprint aria-hidden="true" size={20} />
            )}
            Passkey
        </Button>
    )
}
