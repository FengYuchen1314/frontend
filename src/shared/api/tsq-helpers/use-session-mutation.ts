import {
    useMutation,
    type UseMutateAsyncFunction,
    type UseMutateFunction,
    type UseMutationOptions,
    type UseMutationResult
} from '@tanstack/react-query'
import { useCallback } from 'react'

import { assertSessionGeneration, getSessionGeneration } from '../axios'
import {
    captureSessionMutation,
    createSessionMutateOptions,
    createSessionMutationOptions,
    settleSessionMutation
} from '../session-mutation'

const sessionBoundary = {
    getGeneration: getSessionGeneration,
    assertGeneration: assertSessionGeneration
}

/** Session ownership starts at the user's invocation, before TanStack defers dispatch. */
export function useSessionMutation<
    TData = unknown,
    TError = Error,
    TVariables = void,
    TContext = unknown
>(
    options: UseMutationOptions<TData, TError, TVariables, TContext> & {
        mutationFn: NonNullable<
            UseMutationOptions<TData, TError, TVariables, TContext>['mutationFn']
        >
    },
    additionalCallbacks?: (
        variables: TVariables
    ) => Pick<
        UseMutationOptions<TData, TError, TVariables, TContext>,
        'onSuccess' | 'onError' | 'onSettled'
    >[]
): UseMutationResult<TData, TError, TVariables, TContext> {
    const mutation = useMutation(
        createSessionMutationOptions(sessionBoundary, options, additionalCallbacks)
    )
    const mutate = useCallback<UseMutateFunction<TData, TError, TVariables, TContext>>(
        (...args) => {
            // TanStack permits omitted variables for void mutations. Its public
            // argument tuple already enforces every other variables shape.
            const variables = args[0] as TVariables
            const options = args[1]
            mutation.mutate(
                captureSessionMutation(sessionBoundary, variables),
                createSessionMutateOptions(sessionBoundary, options)
            )
        },
        [mutation.mutate]
    )
    const mutateAsync = useCallback<UseMutateAsyncFunction<TData, TError, TVariables, TContext>>(
        (...args) => {
            const variables = args[0] as TVariables
            const options = args[1]
            const invocation = captureSessionMutation(sessionBoundary, variables)
            return settleSessionMutation(
                sessionBoundary,
                invocation,
                mutation.mutateAsync(
                    invocation,
                    createSessionMutateOptions(sessionBoundary, options)
                )
            )
        },
        [mutation.mutateAsync]
    )

    return {
        ...mutation,
        variables: mutation.variables?.variables,
        mutate,
        mutateAsync
    } as UseMutationResult<TData, TError, TVariables, TContext>
}
