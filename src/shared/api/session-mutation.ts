import type { MutateOptions, MutationObserverOptions } from '@tanstack/react-query'

export interface SessionMutationBoundary {
    getGeneration: () => number
    assertGeneration: (expected: number) => void
}

/** The envelope belongs to one invocation, never to a reusable public DTO. */
export interface SessionMutationInvocation<TVariables> {
    variables: TVariables
    generation: number
}

type Lifecycle<TData, TError, TVariables, TContext> = Pick<
    MutationObserverOptions<TData, TError, TVariables, TContext>,
    'onSuccess' | 'onError' | 'onSettled'
>

export function captureSessionMutation<TVariables>(
    boundary: SessionMutationBoundary,
    variables: TVariables
): SessionMutationInvocation<TVariables> {
    return { variables, generation: boundary.getGeneration() }
}

export function createSessionMutationOptions<TData, TError, TVariables, TContext>(
    boundary: SessionMutationBoundary,
    options: MutationObserverOptions<TData, TError, TVariables, TContext> & {
        mutationFn: NonNullable<
            MutationObserverOptions<TData, TError, TVariables, TContext>['mutationFn']
        >
    },
    additionalCallbacks?: (
        variables: TVariables
    ) => Lifecycle<TData, TError, TVariables, TContext>[]
): MutationObserverOptions<TData, TError, SessionMutationInvocation<TVariables>, TContext> {
    const current = (invocation: SessionMutationInvocation<TVariables>) =>
        invocation.generation === boundary.getGeneration()
    const assertCurrent = (invocation: SessionMutationInvocation<TVariables>) =>
        boundary.assertGeneration(invocation.generation)
    const callbacks = (invocation: SessionMutationInvocation<TVariables>) => [
        options,
        ...(additionalCallbacks?.(invocation.variables) ?? [])
    ]
    const onMutate = options.onMutate

    return {
        ...options,
        onMutate: onMutate
            ? async (invocation, context) => {
                  assertCurrent(invocation)
                  const result = await onMutate(invocation.variables, context)
                  assertCurrent(invocation)
                  return result
              }
            : undefined,
        mutationFn: async (invocation, context) => {
            assertCurrent(invocation)
            try {
                const result = await options.mutationFn(invocation.variables, context)
                // Validation can be asynchronous after Axios has accepted a response.
                assertCurrent(invocation)
                return result
            } catch (error) {
                assertCurrent(invocation)
                throw error
            }
        },
        onSuccess: async (data, invocation, result, context) => {
            assertCurrent(invocation)
            for (const [index, callback] of callbacks(invocation).entries()) {
                assertCurrent(invocation)
                const pending = callback.onSuccess?.(data, invocation.variables, result, context)
                // Authentication commits its token synchronously in the global
                // success handler. Its own remaining success batch owns that new
                // session; a change while awaiting a callback does not receive it.
                if (index === 0) invocation.generation = boundary.getGeneration()
                await pending
                assertCurrent(invocation)
            }
        },
        onError: async (error, invocation, result, context) => {
            for (const callback of callbacks(invocation)) {
                if (!current(invocation)) return
                await callback.onError?.(error, invocation.variables, result, context)
            }
        },
        onSettled: async (data, error, invocation, result, context) => {
            for (const callback of callbacks(invocation)) {
                if (!current(invocation)) return
                await callback.onSettled?.(data, error, invocation.variables, result, context)
            }
        }
    }
}

/** Callers awaiting mutateAsync also cross asynchronous lifecycle callbacks. */
export function settleSessionMutation<TData, TVariables>(
    boundary: SessionMutationBoundary,
    invocation: SessionMutationInvocation<TVariables>,
    result: Promise<TData>
): Promise<TData> {
    return result.then(
        (data) => {
            boundary.assertGeneration(invocation.generation)
            return data
        },
        (error: unknown) => {
            boundary.assertGeneration(invocation.generation)
            throw error
        }
    )
}

/** TanStack's per-call observer callbacks are outside the mutation options. */
export function createSessionMutateOptions<TData, TError, TVariables, TContext>(
    boundary: SessionMutationBoundary,
    options?: MutateOptions<TData, TError, TVariables, TContext>
): MutateOptions<TData, TError, SessionMutationInvocation<TVariables>, TContext> | undefined {
    if (!options) return undefined
    const current = (invocation: SessionMutationInvocation<TVariables>) =>
        invocation.generation === boundary.getGeneration()

    return {
        onSuccess: (data, invocation, result, context) => {
            if (!current(invocation)) return
            return options.onSuccess?.(data, invocation.variables, result, context)
        },
        onError: (error, invocation, result, context) => {
            if (!current(invocation)) return
            return options.onError?.(error, invocation.variables, result, context)
        },
        onSettled: (data, error, invocation, result, context) => {
            if (!current(invocation)) return
            return options.onSettled?.(data, error, invocation.variables, result, context)
        }
    }
}
