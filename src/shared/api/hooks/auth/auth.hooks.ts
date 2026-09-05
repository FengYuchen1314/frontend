import { toast } from '@heroui/react'
import {
    LoginCommand,
    OAuth2AuthorizeCommand,
    OAuth2CallbackCommand,
    RegisterCommand,
    VerifyPasskeyAuthenticationCommand
} from '@remnawave/backend-contract'
import { isCancel } from 'axios'

import { setToken } from '@entities/auth/session-store'

import { createMutationHook } from '../../tsq-helpers'
import {
    assertAuthenticationOwnership,
    hasAuthenticationOwnership,
    useAuthenticationOwnership,
    type AuthenticationOwnershipOptions
} from './authentication-ownership'

export const AUTH_QUERY_KEY = 'auth'

const useLoginMutation = createMutationHook({
    endpoint: LoginCommand.TSQ_url,
    bodySchema: LoginCommand.RequestBodySchema,
    responseSchema: LoginCommand.ResponseSchema,
    requestMethod: LoginCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onMutate: assertAuthenticationOwnership,
        onSuccess: (data, variables) => {
            assertAuthenticationOwnership(variables)
            setToken({ token: data.accessToken })
        },
        onError: (error, variables) => {
            if (isCancel(error) || !hasAuthenticationOwnership(variables)) return
            toast.danger('Login', { description: error.message })
        }
    }
})

const useRegisterMutation = createMutationHook({
    endpoint: RegisterCommand.TSQ_url,
    bodySchema: RegisterCommand.RequestBodySchema,
    responseSchema: RegisterCommand.ResponseSchema,
    requestMethod: RegisterCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onMutate: assertAuthenticationOwnership,
        onSuccess: (data, variables) => {
            assertAuthenticationOwnership(variables)
            toast.success('Register', { description: 'User registered successfully' })
            setToken({ token: data.accessToken })
        },
        onError: (error, variables) => {
            if (isCancel(error) || !hasAuthenticationOwnership(variables)) return
            toast.danger('Register', { description: error.message })
        }
    }
})

export function useLogin(
    params?: Parameters<typeof useLoginMutation>[0] & AuthenticationOwnershipOptions
) {
    const { captureOwnership, ...mutationParams } = params ?? {}
    return useAuthenticationOwnership(useLoginMutation(mutationParams), captureOwnership)
}

export function useRegister(
    params?: Parameters<typeof useRegisterMutation>[0] & AuthenticationOwnershipOptions
) {
    const { captureOwnership, ...mutationParams } = params ?? {}
    return useAuthenticationOwnership(useRegisterMutation(mutationParams), captureOwnership)
}

export const useOauth2Callback = createMutationHook({
    endpoint: OAuth2CallbackCommand.TSQ_url,
    bodySchema: OAuth2CallbackCommand.RequestBodySchema,
    responseSchema: OAuth2CallbackCommand.ResponseSchema,
    requestMethod: OAuth2CallbackCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onSuccess: (data) => {
            setToken({ token: data.accessToken })
        }
    }
})

export const useOAuth2Authorize = createMutationHook({
    endpoint: OAuth2AuthorizeCommand.TSQ_url,
    bodySchema: OAuth2AuthorizeCommand.RequestBodySchema,
    responseSchema: OAuth2AuthorizeCommand.ResponseSchema,
    requestMethod: OAuth2AuthorizeCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {
        onError: (error) => {
            toast.danger('OAuth2 Authorize', { description: error.message })
        }
    }
})

export const usePasskeyAuthenticationVerify = createMutationHook({
    endpoint: VerifyPasskeyAuthenticationCommand.TSQ_url,
    bodySchema: VerifyPasskeyAuthenticationCommand.RequestBodySchema,
    responseSchema: VerifyPasskeyAuthenticationCommand.ResponseSchema,
    requestMethod: VerifyPasskeyAuthenticationCommand.endpointDetails.REQUEST_METHOD
})
