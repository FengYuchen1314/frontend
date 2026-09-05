import { MutationObserver, QueryClient } from '@tanstack/react-query'
import axios, { CanceledError } from 'axios'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    captureSessionMutation,
    createSessionMutateOptions,
    createSessionMutationOptions,
    settleSessionMutation,
    type SessionMutationBoundary
} from './session-mutation.ts'

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

function fixture() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } }
    })
    let generation = 1
    const boundary: SessionMutationBoundary = {
        getGeneration: () => generation,
        assertGeneration: (expected) => {
            if (expected !== generation) throw new CanceledError('Inactive fixture session')
        }
    }
    const changeSession = () => {
        generation++
        queryClient.clear()
    }
    return { queryClient, boundary, changeSession }
}

test('invocation ownership prevents deferred dispatch in a replacement session', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    let dispatched = false
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(boundary, {
            mutationFn: async (variables: { name: string }) => {
                dispatched = true
                return variables.name
            }
        })
    )
    const invocation = captureSessionMutation(boundary, { name: 'old-session-user' })
    const result = observer.mutate(invocation).catch((error: unknown) => error)
    changeSession()
    assert(axios.isCancel(await result))
    assert.equal(dispatched, false)
    queryClient.clear()
})

test('session changes during asynchronous onMutate prevent network dispatch', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    const entered = deferred()
    const release = deferred()
    let dispatched = false
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(boundary, {
            onMutate: async () => {
                entered.resolve()
                await release.promise
                return { previous: 'private-data' }
            },
            mutationFn: async () => {
                dispatched = true
                return 'unused'
            }
        })
    )
    const result = observer
        .mutate(captureSessionMutation(boundary, undefined))
        .catch((error) => error)
    await entered.promise
    changeSession()
    release.resolve()
    assert(axios.isCancel(await result))
    assert.equal(dispatched, false)
    queryClient.clear()
})

test('late schema completion cannot refill a new cache or run either callback layer', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    const entered = deferred()
    const release = deferred()
    const calls: string[] = []
    const client = axios.create({
        adapter: async (config) => ({
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: 'private-old-session-record'
        })
    })
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(
            boundary,
            {
                mutationFn: async () => {
                    const response = await client.get('/users')
                    entered.resolve()
                    await release.promise
                    return response.data as string
                },
                onSuccess: (data) => {
                    calls.push('global-success')
                    queryClient.setQueryData(['users'], data)
                },
                onError: () => calls.push('global-error'),
                onSettled: () => calls.push('global-settled')
            },
            () => [
                {
                    onSuccess: () => calls.push('additional-success'),
                    onError: () => calls.push('additional-error'),
                    onSettled: () => calls.push('additional-settled')
                }
            ]
        )
    )
    const unsubscribe = observer.subscribe(() => {})
    try {
        const result = observer
            .mutate(
                captureSessionMutation(boundary, undefined),
                createSessionMutateOptions(boundary, {
                    onSuccess: () => calls.push('observer-success'),
                    onError: () => calls.push('observer-error'),
                    onSettled: () => calls.push('observer-settled')
                })
            )
            .catch((error: unknown) => error)
        await entered.promise
        changeSession()
        release.resolve()
        assert(axios.isCancel(await result))
        assert.equal(queryClient.getQueryData(['users']), undefined)
        assert.deepEqual(calls, [])
    } finally {
        unsubscribe()
        queryClient.clear()
    }
})

test('concurrent use of the same DTO retains separate invocation ownership', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    const sharedVariables = { id: 7 }
    const firstEntered = deferred()
    const releaseFirst = deferred()
    const success: number[] = []
    let dispatches = 0
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(boundary, {
            mutationFn: async (variables: typeof sharedVariables) => {
                assert.equal(variables, sharedVariables)
                const dispatch = ++dispatches
                if (dispatch === 1) {
                    firstEntered.resolve()
                    await releaseFirst.promise
                }
                return dispatch
            },
            onSuccess: (data) => success.push(data)
        })
    )
    const firstInvocation = captureSessionMutation(boundary, sharedVariables)
    const first = observer.mutate(firstInvocation).catch((error: unknown) => error)
    await firstEntered.promise
    changeSession()
    const secondInvocation = captureSessionMutation(boundary, sharedVariables)
    assert.notEqual(firstInvocation, secondInvocation)
    assert.equal(await observer.mutate(secondInvocation), 2)
    releaseFirst.resolve()
    assert(axios.isCancel(await first))
    assert.deepEqual(success, [2])
    assert.deepEqual(sharedVariables, { id: 7 })
    queryClient.clear()
})

for (const error of [
    new CanceledError('User canceled'),
    new Error('Ordinary validation failure')
]) {
    test(`same-session ${error.name} keeps error handling and cleanup in every layer`, async () => {
        const { queryClient, boundary } = fixture()
        const calls: string[] = []
        const variables = { id: 7 }
        const observer = new MutationObserver(
            queryClient,
            createSessionMutationOptions(
                boundary,
                {
                    onMutate: () => ({ previous: 'value' }),
                    mutationFn: async (_variables: typeof variables) => {
                        throw error
                    },
                    onError: (received, receivedVariables, context) => {
                        assert.equal(received, error)
                        assert.equal(receivedVariables, variables)
                        assert.deepEqual(context, { previous: 'value' })
                        calls.push('global-error')
                    },
                    onSettled: () => calls.push('global-settled')
                },
                () => [
                    {
                        onError: () => calls.push('additional-error'),
                        onSettled: () => calls.push('additional-settled')
                    }
                ]
            )
        )
        const unsubscribe = observer.subscribe(() => {})
        try {
            const result = observer
                .mutate(
                    captureSessionMutation(boundary, variables),
                    createSessionMutateOptions(boundary, {
                        onError: () => calls.push('observer-error'),
                        onSettled: () => calls.push('observer-settled')
                    })
                )
                .catch((received: unknown) => received)
            assert.equal(await result, error)
            assert.deepEqual(calls, [
                'global-error',
                'additional-error',
                'global-settled',
                'additional-settled',
                'observer-error',
                'observer-settled'
            ])
        } finally {
            unsubscribe()
            queryClient.clear()
        }
    })
}

test('synchronous auth token commit preserves its success batch and public variables', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    const calls: string[] = []
    const variables = { username: 'fixture' }
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(
            boundary,
            {
                mutationFn: async (_variables: typeof variables) => 'new-token',
                onSuccess: () => {
                    calls.push('commit-token')
                    changeSession()
                },
                onSettled: () => calls.push('global-settled')
            },
            () => [
                {
                    onSuccess: (_data, receivedVariables) => {
                        assert.equal(receivedVariables, variables)
                        calls.push('hook-success')
                    },
                    onSettled: () => calls.push('hook-settled')
                }
            ]
        )
    )
    const unsubscribe = observer.subscribe(() => {})
    try {
        const data = await observer.mutate(
            captureSessionMutation(boundary, variables),
            createSessionMutateOptions(boundary, {
                onSuccess: (_data, receivedVariables) => {
                    assert.equal(receivedVariables, variables)
                    calls.push('login-page-success')
                },
                onSettled: () => calls.push('observer-settled')
            })
        )
        assert.equal(data, 'new-token')
        assert.deepEqual(calls, [
            'commit-token',
            'hook-success',
            'global-settled',
            'hook-settled',
            'login-page-success',
            'observer-settled'
        ])
    } finally {
        unsubscribe()
        queryClient.clear()
    }
})

test('a session change while awaiting success is not adopted as an auth commit', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    const entered = deferred()
    const release = deferred()
    const calls: string[] = []
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(
            boundary,
            {
                mutationFn: async () => 'private-data',
                onSuccess: async () => {
                    entered.resolve()
                    await release.promise
                },
                onError: () => calls.push('global-error'),
                onSettled: () => calls.push('global-settled')
            },
            () => [{ onSuccess: () => calls.push('additional-success') }]
        )
    )
    const unsubscribe = observer.subscribe(() => {})
    try {
        const result = observer
            .mutate(
                captureSessionMutation(boundary, undefined),
                createSessionMutateOptions(boundary, {
                    onSuccess: () => calls.push('observer-success'),
                    onError: () => calls.push('observer-error')
                })
            )
            .catch((error: unknown) => error)
        await entered.promise
        changeSession()
        release.resolve()
        assert(axios.isCancel(await result))
        assert.deepEqual(calls, [])
    } finally {
        unsubscribe()
        queryClient.clear()
    }
})

test('mutateAsync rejects data that becomes stale during asynchronous settled cleanup', async () => {
    const { queryClient, boundary, changeSession } = fixture()
    const entered = deferred()
    const release = deferred()
    const observer = new MutationObserver(
        queryClient,
        createSessionMutationOptions(boundary, {
            mutationFn: async () => 'private-result',
            onSettled: async () => {
                entered.resolve()
                await release.promise
            }
        })
    )
    const invocation = captureSessionMutation(boundary, undefined)
    const result = settleSessionMutation(boundary, invocation, observer.mutate(invocation)).catch(
        (error: unknown) => error
    )
    await entered.promise
    changeSession()
    release.resolve()
    assert(axios.isCancel(await result))
    queryClient.clear()
})

test('actual hook guards its asynchronous contract parse and preserves successful login callbacks', async () => {
    Object.assign(globalThis, {
        __DOMAIN_BACKEND__: 'https://panel.example',
        __NODE_ENV__: 'production',
        __DOMAIN_OVERRIDE__: '0',
        window: { location: { origin: 'https://panel.example' } }
    })
    const { createElement } = await import('react')
    const { renderToString } = await import('react-dom/server')
    const { QueryClientProvider } = await import('@tanstack/react-query')
    const { z } = await import('zod')
    const { instance, setAuthorizationToken } = await import('./axios.ts')
    const { queryClient } = await import('./query-client.ts')
    const { createMutationHook } = await import('./tsq-helpers/create-mutation-hook.ts')
    const originalAdapter = instance.defaults.adapter
    queryClient.setDefaultOptions({
        queries: { gcTime: Infinity },
        mutations: { gcTime: Infinity }
    })
    const entered = deferred()
    const release = deferred()
    const body = { id: 7 }
    let posted: unknown
    let callbackRuns = 0
    instance.defaults.adapter = async (config) => {
        posted = JSON.parse(config.data)
        return {
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { response: 'private-record' }
        }
    }
    const useFixtureMutation = createMutationHook({
        endpoint: '/api/users',
        requestMethod: 'post',
        bodySchema: z.object({ id: z.number() }),
        responseSchema: z.object({ response: z.string() }).superRefine(async () => {
            entered.resolve()
            await release.promise
        }),
        rMutationParams: {
            onSuccess: (data) => {
                callbackRuns++
                queryClient.setQueryData(['users'], data)
            }
        }
    })
    let mutation!: ReturnType<typeof useFixtureMutation>
    const exposeMutation = (result: ReturnType<typeof useFixtureMutation>) => {
        mutation = result
    }
    function Harness() {
        exposeMutation(useFixtureMutation())
        return null
    }
    try {
        setAuthorizationToken('first-session')
        renderToString(
            createElement(QueryClientProvider, { client: queryClient }, createElement(Harness))
        )
        const result = mutation.mutateAsync({ variables: body }).catch((error: unknown) => error)
        await entered.promise
        setAuthorizationToken('second-session')
        release.resolve()
        assert(axios.isCancel(await result))
        assert.equal(callbackRuns, 0)
        assert.equal(queryClient.getQueryData(['users']), undefined)
        assert.deepEqual(
            posted,
            body,
            'The private invocation envelope must not enter the HTTP DTO'
        )

        const useLoginFixture = createMutationHook({
            endpoint: '/api/auth/login',
            requestMethod: 'post',
            bodySchema: z.object({ id: z.number() }),
            responseSchema: z.object({ response: z.string() }),
            rMutationParams: {
                onSuccess: () => setAuthorizationToken('successful-login')
            }
        })
        let login!: ReturnType<typeof useLoginFixture>
        let authenticated = false
        const exposeLogin = (result: ReturnType<typeof useLoginFixture>) => {
            login = result
        }
        function LoginHarness() {
            exposeLogin(
                useLoginFixture({
                    mutationFns: {
                        onSuccess: () => {
                            authenticated = true
                        }
                    }
                })
            )
            return null
        }
        renderToString(
            createElement(QueryClientProvider, { client: queryClient }, createElement(LoginHarness))
        )
        assert.equal(await login.mutateAsync({ variables: body }), 'private-record')
        assert.equal(authenticated, true)
    } finally {
        instance.defaults.adapter = originalAdapter
        setAuthorizationToken('')
        queryClient.clear()
    }
})

test('both public hook entry points capture ownership and unwrap result variables', () => {
    const source = readFileSync(
        new URL('./tsq-helpers/create-mutation-hook.ts', import.meta.url),
        'utf8'
    )
    assert.equal(source.match(/captureSessionMutation\(sessionBoundary, variables\)/g)?.length, 2)
    assert.equal(source.match(/createSessionMutateOptions\(sessionBoundary, options\)/g)?.length, 2)
    assert.match(source, /variables:\s*mutation\.variables\?\.variables/)
})
