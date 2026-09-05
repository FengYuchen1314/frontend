import axios, {
    AxiosError,
    AxiosHeaders,
    type AxiosResponse,
    type InternalAxiosRequestConfig
} from 'axios'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { z } from 'zod'

// Exercise the production client, with only its browser build constants supplied.
Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } }
})

const { instance, setAuthorizationToken, getAuthorizationToken } = await import('./axios.ts')
const { queryClient } = await import('./query-client.ts')
const { logoutEvents } = await import('../emitters/emit-logout.ts')
const { requestSessionResponse } = await import('./session-response.ts')
const { handleRequestError } = await import('./helpers/handler-request-error.ts')
const originalAdapter = instance.defaults.adapter
// A jsdom/browser-like global makes TanStack schedule browser GC. Tests have no
// long-lived observers and explicitly clear their fixture caches below.
queryClient.setDefaultOptions({ queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } })

beforeEach(() => {
    setAuthorizationToken('')
    queryClient.clear()
})
after(() => {
    instance.defaults.adapter = originalAdapter
    setAuthorizationToken('')
    queryClient.clear()
})

function holdRequest() {
    let finish: (status: number) => void = () => assert.fail('Adapter was not started')
    let requestConfig: InternalAxiosRequestConfig | undefined
    let started: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
        started = resolve
    })
    instance.defaults.adapter = (config) =>
        new Promise<AxiosResponse>((resolve, reject) => {
            requestConfig = config
            finish = (status) => {
                const response: AxiosResponse = {
                    config,
                    status,
                    statusText: String(status),
                    headers: new AxiosHeaders(),
                    data: { response: 'old-session-data' }
                }
                if (status < 400) resolve(response)
                else
                    reject(
                        new AxiosError(
                            'Fixture response',
                            'ERR_BAD_REQUEST',
                            config,
                            undefined,
                            response
                        )
                    )
            }
            started()
        })
    return { ready, complete: (status: number) => finish(status), getConfig: () => requestConfig }
}

for (const status of [401, 403]) {
    test(`a late ${status} from the previous login cannot log out the current session`, async () => {
        setAuthorizationToken('first-session')
        const held = holdRequest()
        let logouts = 0
        const unsubscribe = logoutEvents.subscribe(() => {
            logouts++
        })
        try {
            const request = instance.get('/api/users')
            const outcome = request.catch((error: unknown) => error)
            await held.ready
            assert.equal(held.getConfig()?.headers.get('Authorization'), 'Bearer first-session')
            setAuthorizationToken('second-session')
            held.complete(status)
            assert(axios.isCancel(await outcome), 'Stale failure must become a cancellation')
            assert.equal(logouts, 0)
            assert.equal(getAuthorizationToken(), 'second-session')
        } finally {
            unsubscribe()
        }
    })
}

test('late successful data cannot repopulate a new session cache', async () => {
    setAuthorizationToken('first-session')
    const held = holdRequest()
    const outcome = instance.get('/api/users').then(
        (response) => {
            queryClient.setQueryData(['users'], response.data)
            return response
        },
        (error: unknown) => error
    )
    await held.ready
    setAuthorizationToken('second-session')
    held.complete(200)
    assert(axios.isCancel(await outcome))
    assert.equal(queryClient.getQueryData(['users']), undefined)
})

test('logging out and back in with the same token does not revive the old request', async () => {
    setAuthorizationToken('same-token')
    const held = holdRequest()
    const outcome = instance.get('/api/users').catch((error: unknown) => error)
    await held.ready
    setAuthorizationToken('')
    setAuthorizationToken('same-token')
    held.complete(200)
    assert(axios.isCancel(await outcome))
})

test('every real session transition clears old query and mutation state', () => {
    setAuthorizationToken('first-session')
    queryClient.setQueryData(['users'], ['private-first-session-record'])
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['old-mutation'] })
    setAuthorizationToken('second-session')
    assert.equal(queryClient.getQueryCache().getAll().length, 0)
    assert.equal(queryClient.getMutationCache().getAll().length, 0)
    queryClient.setQueryData(['users'], ['private-second-session-record'])
    setAuthorizationToken('')
    assert.equal(queryClient.getQueryCache().getAll().length, 0)
})

test('setting the unchanged token keeps the current request and cache valid', async () => {
    setAuthorizationToken('current-session')
    queryClient.setQueryData(['users'], ['current-session-record'])
    const held = holdRequest()
    const request = instance.get('/api/users')
    await held.ready
    setAuthorizationToken('current-session')
    held.complete(200)
    assert.equal((await request).status, 200)
    assert.deepEqual(queryClient.getQueryData(['users']), ['current-session-record'])
})

test('a current unauthorized response still expires its own session once', async () => {
    setAuthorizationToken('expired-session')
    const held = holdRequest()
    let logouts = 0
    const unsubscribe = logoutEvents.subscribe(() => {
        logouts++
        setAuthorizationToken('')
    })
    try {
        const outcome = instance.get('/api/users').catch((error: unknown) => error)
        await held.ready
        held.complete(401)
        assert(axios.isAxiosError(await outcome))
        assert.equal(logouts, 1)
        assert.equal(getAuthorizationToken(), '')
    } finally {
        unsubscribe()
    }
})

test('an unauthenticated login failure does not broadcast global logout', async () => {
    const held = holdRequest()
    let logouts = 0
    const unsubscribe = logoutEvents.subscribe(() => {
        logouts++
    })
    try {
        const outcome = instance.post('/api/auth/login', {}).catch((error: unknown) => error)
        await held.ready
        held.complete(401)
        assert(axios.isAxiosError(await outcome))
        assert.equal(logouts, 0)
    } finally {
        unsubscribe()
    }
})

test('session changes during asynchronous response validation cannot commit old data', async () => {
    setAuthorizationToken('first-session')
    let finishParsing = () => {}
    let startedParsing = () => {}
    const parseGate = new Promise<void>((resolve) => {
        finishParsing = resolve
    })
    const parseStarted = new Promise<void>((resolve) => {
        startedParsing = resolve
    })
    const schema = z.object({
        response: z.string().transform(async (value) => {
            startedParsing()
            await parseGate
            return value
        })
    })
    const held = holdRequest()
    const outcome = requestSessionResponse(() => instance.get('/api/users'), schema).then(
        (data) => {
            queryClient.setQueryData(['users'], data)
            return data
        },
        (error: unknown) => error
    )
    await held.ready
    held.complete(200)
    await parseStarted
    setAuthorizationToken('second-session')
    finishParsing()
    const error = await outcome
    assert(axios.isCancel(error))
    assert.equal(queryClient.getQueryData(['users']), undefined)
    assert.throws(
        () => handleRequestError(error),
        (handled: unknown) => handled === error
    )
})

test('a current validated response and an ordinary server failure keep normal semantics', async () => {
    setAuthorizationToken('current-session')
    const schema = z.object({ response: z.string() })
    const held = holdRequest()
    const outcome = requestSessionResponse(() => instance.get('/api/users'), schema)
    await held.ready
    held.complete(200)
    assert.equal(await outcome, 'old-session-data')
    const failure = holdRequest()
    const rejected = requestSessionResponse(() => instance.get('/api/users'), schema).catch(
        (error: unknown) => error
    )
    await failure.ready
    failure.complete(500)
    const error = await rejected
    assert(axios.isAxiosError(error))
    assert.equal(error.response?.status, 500)
    assert.equal(axios.isCancel(error), false)
    assert.equal(getAuthorizationToken(), 'current-session')
})

test('request authorization is captured before a synchronous account switch', async () => {
    setAuthorizationToken('first-session')
    const held = holdRequest()
    const outcome = instance.get('/api/users').catch((error: unknown) => error)
    setAuthorizationToken('second-session')
    await held.ready
    assert.equal(held.getConfig()?.headers.get('Authorization'), 'Bearer first-session')
    held.complete(200)
    assert(axios.isCancel(await outcome))
})
