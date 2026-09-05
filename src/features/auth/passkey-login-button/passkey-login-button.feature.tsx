import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
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
                    notifications.show({
                        title: 'Passkey Verified',
                        message: 'Passkey authenticated successfully',
                        color: 'teal'
                    })
                },
                onSettled: () => setIsLoading(false)
            })
        } catch (error: unknown) {
            if (isCancel(error)) return
            if (error instanceof Error) {
                if (error.name === 'NotAllowedError') {
                    notifications.show({
                        title: 'Passkey Authentication',
                        message: 'Authentication was cancelled',
                        color: 'yellow'
                    })
                } else if (error.name === 'NotSupportedError') {
                    notifications.show({
                        title: 'Passkey Authentication',
                        message: 'Passkeys are not supported on this device',
                        color: 'red'
                    })
                }
            }
        }
    }

    if (!authentication.passkey.enabled) return null

    return (
        <Button
            color="dark"
            leftSection={<TbFingerprint color="white" size={20} />}
            loaderProps={{ type: 'dots' }}
            loading={isLoading}
            onClick={handlePasskeyLogin}
            variant="filled"
        >
            Passkey
        </Button>
    )
}
