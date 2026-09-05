import {
    useMutation,
    useQueryClient,
    type UseMutateAsyncFunction,
    type UseMutateFunction,
    type UseMutationResult
} from '@tanstack/react-query'
import { useCallback } from 'react'
import { z } from 'zod'

import { assertSessionGeneration, getSessionGeneration, instance } from '../axios'
import { createUrl, handleRequestError } from '../helpers'
import { CreateMutationHookArgs, MutationResponse } from '../interfaces'
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

export function createMutationHook<
    RouteParamsSchema extends z.ZodType<Record<string, unknown>>,
    RequestQuerySchema extends z.ZodType<Record<string, unknown>>,
    BodySchema extends z.ZodType,
    ResponseSchema extends undefined | z.ZodType<{ response: unknown }> = undefined
>({
    endpoint,
    requestMethod,
    routeParams,
    queryParams,
    requestQuerySchema,
    bodySchema,
    responseSchema,
    rMutationParams
}: CreateMutationHookArgs<RouteParamsSchema, RequestQuerySchema, BodySchema, ResponseSchema>) {
    type Data = MutationResponse<ResponseSchema>
    type Variables = {
        mutationFns?: Partial<typeof rMutationParams>
        query?: z.infer<RequestQuerySchema>
        route?: z.infer<RouteParamsSchema>
        variables?: z.infer<BodySchema>
    }

    return (params?: {
        mutationFns?: Partial<typeof rMutationParams>
        query?: z.infer<RequestQuerySchema>
        route?: z.infer<RouteParamsSchema>
    }): UseMutationResult<Data, Error, Variables, unknown> => {
        const queryClient = useQueryClient()

        const validatedQuery = requestQuerySchema?.parse({ ...queryParams, ...params?.query })
        const baseUrl = createUrl(endpoint, validatedQuery, params?.route ?? routeParams)

        const mutationFn = async ({ variables, route, query }: Variables) => {
            const url = createUrl(baseUrl, query, route)

            return instance
                .request({
                    method: requestMethod,
                    url,
                    data: bodySchema?.parse(variables)
                })
                .then(async (response) => {
                    if (!responseSchema) {
                        return undefined as MutationResponse<ResponseSchema>
                    }
                    const result = await responseSchema.safeParseAsync(response.data)
                    if (!result.success) {
                        throw result.error
                    }
                    return result.data.response as MutationResponse<ResponseSchema>
                })
                .catch((error) => handleRequestError(error))
        }

        const lifecycle = (callbacks: Partial<typeof rMutationParams>) => ({
            onSuccess: (data: Data, variables: Variables, context: unknown) =>
                callbacks?.onSuccess?.(data, variables, context, queryClient),
            onError: (error: Error, variables: Variables, context: unknown) =>
                callbacks?.onError?.(error, variables, context, queryClient),
            onSettled: (
                data: Data | undefined,
                error: Error | null,
                variables: Variables,
                context: unknown
            ) => callbacks?.onSettled?.(data, error, variables, context, queryClient)
        })
        const mutation = useMutation(
            createSessionMutationOptions<Data, Error, Variables, unknown>(
                sessionBoundary,
                {
                    ...rMutationParams,
                    ...params?.mutationFns,
                    mutationFn,
                    ...lifecycle(rMutationParams)
                },
                (variables) => [lifecycle(params?.mutationFns), lifecycle(variables.mutationFns)]
            )
        )

        const mutate = useCallback<UseMutateFunction<Data, Error, Variables, unknown>>(
            (variables, options) => {
                mutation.mutate(
                    captureSessionMutation(sessionBoundary, variables),
                    createSessionMutateOptions(sessionBoundary, options)
                )
            },
            [mutation.mutate]
        )
        const mutateAsync = useCallback<UseMutateAsyncFunction<Data, Error, Variables, unknown>>(
            (variables, options) => {
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
        } as UseMutationResult<Data, Error, Variables, unknown>
    }
}
