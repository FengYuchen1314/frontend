import type {
    UseMutateAsyncFunction,
    UseMutateFunction,
    UseMutationResult
} from '@tanstack/react-query'

import { CanceledError } from 'axios'
import { useCallback } from 'react'

export interface AuthenticationOwnership {
    isCurrent: () => boolean
}
export interface AuthenticationOwnershipOptions {
    captureOwnership?: () => AuthenticationOwnership
}

// Metadata is local to a single invocation, never part of the HTTP DTO. Cloning
// its envelope prevents concurrent reuse of the same variables from stealing ownership.
const owners = new WeakMap<object, AuthenticationOwnership>()
export const hasAuthenticationOwnership = (variables: object) =>
    owners.get(variables)?.isCurrent() ?? true
export function assertAuthenticationOwnership(variables: object) {
    if (!hasAuthenticationOwnership(variables))
        throw new CanceledError('Authentication attempt is no longer active')
}

export function useAuthenticationOwnership<Data, Variables extends object, Context>(
    mutation: UseMutationResult<Data, Error, Variables, Context>,
    captureOwnership?: () => AuthenticationOwnership
): UseMutationResult<Data, Error, Variables, Context> {
    const { mutate, mutateAsync } = mutation
    const ownedMutate = useCallback<UseMutateFunction<Data, Error, Variables, Context>>(
        (...args) => {
            const variables = args[0] as Variables
            const invocation = { ...variables }
            if (captureOwnership) owners.set(invocation, captureOwnership())
            mutate(...([invocation, args[1]] as Parameters<typeof mutate>))
        },
        [captureOwnership, mutate]
    )
    const ownedMutateAsync = useCallback<UseMutateAsyncFunction<Data, Error, Variables, Context>>(
        (...args) => {
            const variables = args[0] as Variables
            const invocation = { ...variables }
            if (captureOwnership) owners.set(invocation, captureOwnership())
            return mutateAsync(...([invocation, args[1]] as Parameters<typeof mutateAsync>))
        },
        [captureOwnership, mutateAsync]
    )
    return { ...mutation, mutate: ownedMutate, mutateAsync: ownedMutateAsync }
}
