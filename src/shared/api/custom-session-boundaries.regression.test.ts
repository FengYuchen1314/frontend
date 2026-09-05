import { QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import { createInstance } from 'i18next'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createElement, isValidElement, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } }
})

const { instance, getAuthorizationToken, setAuthorizationToken } = await import('./axios.ts')
const { queryClient } = await import('./query-client.ts')
const {
    useCreateTopology,
    useUpdateTopology,
    useDeleteTopology,
    useValidateTopology,
    usePreviewTopology,
    topologyQueryKeys,
    isTopologyVersionConflict,
    useGetTopologies,
    useGetTopology
} = await import('./hooks/topology/topology.api.ts')
const { EvaluateVaultCommand } = await import('@remnawave/backend-contract')
const { evaluateVault } = await import('./hooks/node-ssh/evaluate-vault.ts')
const { useGetInfraBillingHistoryRecordsInfinite } =
    await import('./hooks/infra-billing/infra-billing.query.hooks.ts')
const { NodeEdgeSettingsCard } =
    await import('../ui/forms/nodes/base-node-form/node-edge-settings.card.tsx')
const i18n = createInstance()
await i18n.init({ lng: 'en', resources: { en: { translation: {} } }, initAsync: false })
const originalAdapter = instance.defaults.adapter
queryClient.setDefaultOptions({
    queries: { gcTime: Infinity },
    mutations: { gcTime: Infinity }
})

beforeEach(() => {
    setAuthorizationToken('first-session')
    queryClient.clear()
})
after(() => {
    instance.defaults.adapter = originalAdapter
    setAuthorizationToken('')
    queryClient.clear()
})

function renderHook<T>(useHook: () => T): T {
    let result!: T
    const expose = (value: T) => {
        result = value
    }
    function Harness() {
        expose(useHook())
        return null
    }
    renderToString(
        createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(I18nextProvider, { i18n }, createElement(Harness))
        )
    )
    return result
}

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

const graph = {
    schemaVersion: 1 as const,
    nodes: [
        { id: 'entry', kind: 'ENTRY' as const, label: 'Entry' },
        {
            id: 'proxy',
            kind: 'PROXY' as const,
            label: 'Proxy',
            hostUuid: '11111111-1111-4111-8111-111111111111',
            nodeUuid: '22222222-2222-4222-8222-222222222222'
        },
        { id: 'exit', kind: 'EXIT' as const, label: 'Exit' }
    ],
    edges: [
        { id: 'first', source: 'entry', target: 'proxy' },
        { id: 'last', source: 'proxy', target: 'exit' }
    ]
}
const topology = {
    uuid: '33333333-3333-4333-8333-333333333333',
    name: 'Private first-session topology',
    version: 1,
    isPublished: false,
    graph,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z'
}

const operations = [
    {
        name: 'create',
        invoke: () => renderHook(useCreateTopology).mutateAsync({ name: topology.name, graph }),
        response: topology
    },
    {
        name: 'update',
        invoke: () =>
            renderHook(useUpdateTopology).mutateAsync({
                uuid: topology.uuid,
                expectedVersion: 1,
                name: topology.name
            }),
        response: topology
    },
    {
        name: 'delete',
        invoke: () =>
            renderHook(useDeleteTopology).mutateAsync({ uuid: topology.uuid, expectedVersion: 1 }),
        response: null
    },
    {
        name: 'validate',
        invoke: () => renderHook(useValidateTopology).mutateAsync(graph),
        response: { valid: true, issues: [], maxDepth: 1 }
    },
    {
        name: 'preview',
        invoke: () => renderHook(usePreviewTopology).mutateAsync({ graph, formats: ['MIHOMO'] }),
        response: { valid: true, issues: [], results: [] }
    }
]

for (const operation of operations) {
    test(`topology ${operation.name} must not dispatch old intent with a replacement token`, async () => {
        const requests: { authorization: unknown; method: unknown; url: unknown }[] = []
        instance.defaults.adapter = async (config) => {
            requests.push({
                authorization: config.headers.get('Authorization'),
                method: config.method,
                url: config.url
            })
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: operation.response }
            }
        }
        const result = operation.invoke().catch((error: unknown) => error)
        // TanStack defers mutationFn, even though mutateAsync has already returned.
        setAuthorizationToken('replacement-session')
        const outcome = await result
        assert.equal(getAuthorizationToken(), 'replacement-session')
        assert.deepEqual(
            requests,
            [],
            'Old operation must be canceled before sending under replacement credentials'
        )
        assert(axios.isCancel(outcome))
    })

    test(`current-session topology ${operation.name} preserves request and success behavior`, async () => {
        queryClient.setQueryData(topologyQueryKeys.detail(topology.uuid), topology)
        const requests: unknown[] = []
        instance.defaults.adapter = async (config) => {
            requests.push(config.headers.get('Authorization'))
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: operation.response }
            }
        }
        const result = await operation.invoke()
        assert.deepEqual(requests, ['Bearer first-session'])
        assert.deepEqual(result, operation.name === 'delete' ? undefined : operation.response)
        if (operation.name === 'delete') {
            assert.equal(
                queryClient.getQueryData(topologyQueryKeys.detail(topology.uuid)),
                undefined
            )
        } else if (operation.name === 'create' || operation.name === 'update') {
            assert.deepEqual(
                queryClient.getQueryData(topologyQueryKeys.detail(topology.uuid)),
                topology
            )
        }
    })
}

test('accepted topology response must not refill the replacement session cache', async () => {
    const passedBoundary = deferred()
    const release = deferred()
    instance.defaults.adapter = async (config) => ({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { response: topology }
    })
    // Hold the response after the production request boundary accepted it. This
    // exercises the mutation's independent commit boundary, not HTTP rejection.
    const interceptor = instance.interceptors.response.use(async (response) => {
        passedBoundary.resolve()
        await release.promise
        return response
    })
    try {
        const result = renderHook(useCreateTopology)
            .mutateAsync({ name: topology.name, graph })
            .catch((error: unknown) => error)
        await passedBoundary.promise
        setAuthorizationToken('replacement-session')
        release.resolve()
        assert(axios.isCancel(await result))
        assert.equal(queryClient.getQueryData(topologyQueryKeys.detail(topology.uuid)), undefined)
    } finally {
        instance.interceptors.response.eject(interceptor)
    }
})

test('topology conflict remains an Axios error recognizable by the existing editor', async () => {
    const conflict = new axios.AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 409,
        statusText: 'Conflict',
        headers: {},
        data: { error: { code: 'XT003' } },
        config: { headers: new axios.AxiosHeaders() }
    })
    instance.defaults.adapter = async () => {
        throw conflict
    }
    await assert.rejects(operations[1].invoke(), (error) => {
        assert.equal(error, conflict)
        assert.equal(isTopologyVersionConflict(error), true)
        return true
    })
})

const queries = [
    {
        name: 'topology list',
        invoke: () => renderHook(useGetTopologies).refetch(),
        response: { topologies: [topology], total: 1 }
    },
    {
        name: 'topology detail',
        invoke: () => renderHook(() => useGetTopology(topology.uuid)).refetch(),
        response: topology
    },
    {
        name: 'billing infinite',
        invoke: () => renderHook(() => useGetInfraBillingHistoryRecordsInfinite(7)).refetch(),
        response: { records: [], total: 0 }
    }
]

for (const query of queries) {
    test(`${query.name} forwards cancellation to the transport on session replacement`, async () => {
        const started = deferred()
        const release = deferred()
        let signal: AbortSignal | undefined
        instance.defaults.adapter = async (config) => {
            signal = config.signal as AbortSignal
            started.resolve()
            await release.promise
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: query.response }
            }
        }
        const result = query.invoke()
        await started.promise
        setAuthorizationToken('replacement-session')
        release.resolve()
        await result
        assert.equal(signal?.aborted, true)
        assert.deepEqual(queryClient.getQueryCache().getAll(), [])
    })

    test(`${query.name} accepts valid current-session data`, async () => {
        let requestUrl: string | undefined
        instance.defaults.adapter = async (config) => {
            requestUrl = config.url
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: query.response }
            }
        }
        const result = await query.invoke()
        assert.equal(result.isSuccess, true)
        if (query.name === 'billing infinite') {
            assert.deepEqual(result.data, { pages: [query.response], pageParams: [0] })
            assert.match(requestUrl!, /start=0/)
            assert.match(requestUrl!, /size=7/)
        } else {
            assert.deepEqual(result.data, query.response)
        }
    })
}

test('vault evaluation keeps session ownership through asynchronous schema validation', async () => {
    const entered = deferred()
    const release = deferred()
    const schema = EvaluateVaultCommand.ResponseSchema
    const originalParse = schema.safeParseAsync
    schema.safeParseAsync = async (...args) => {
        const result = await originalParse(...args)
        entered.resolve()
        await release.promise
        return result
    }
    instance.defaults.adapter = async (config) => ({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { response: { evaluated: 'AQID' } }
    })
    try {
        const result = evaluateVault('BAUG').catch((error: unknown) => error)
        await entered.promise
        setAuthorizationToken('replacement-session')
        release.resolve()
        assert(axios.isCancel(await result))
    } finally {
        schema.safeParseAsync = originalParse
    }
})

test('vault evaluation preserves its wire DTO, result and malformed response error', async () => {
    let data: unknown
    instance.defaults.adapter = async (config) => {
        data = JSON.parse(config.data)
        return {
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { response: { evaluated: 'AQID' } }
        }
    }
    assert.equal(await evaluateVault('BAUG'), 'AQID')
    assert.deepEqual(data, { blinded: 'BAUG' })
    instance.defaults.adapter = async (config) => ({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { response: { evaluated: 123 } }
    })
    await assert.rejects(evaluateVault('BAUG'), { message: 'Malformed vault evaluation response' })
})

const edgeNode = {
    uuid: '44444444-4444-4444-8444-444444444444',
    configProfile: { activeConfigProfileUuid: '55555555-5555-4555-8555-555555555555' },
    isDisabled: false,
    isConnecting: false,
    isConnected: true
} as Parameters<typeof NodeEdgeSettingsCard>[0]['node']
const edgeKey = ['node-edge-settings', edgeNode.uuid]
const edgeSettings = {
    revision: 1,
    settings: {
        management: null,
        website: { domains: ['website.example'], upstream: 'http://127.0.0.1:8080' }
    },
    runtime: { available: true, haproxy: true, caddy: true, planVersion: 1 }
}

function findClick(node: ReactNode, label: string): () => unknown {
    const visit = (node: ReactNode): (() => unknown) | undefined => {
        if (Array.isArray(node)) {
            for (const child of node) {
                const found = visit(child)
                if (found) return found
            }
        } else if (isValidElement<{ children?: ReactNode; onClick?: () => unknown }>(node)) {
            if (node.props.children === label && node.props.onClick) return node.props.onClick
            return visit(node.props.children)
        }
    }
    const click = visit(node)
    assert(click, `Expected actual NodeEdge button: ${label}`)
    return click
}

// Execute the real component's hooks and event handlers without rendering the
// Mantine visual subtree. Transport/cache behavior remains production code.
for (const label of ['Save reverse-proxy settings', 'Apply saved settings']) {
    test(`NodeEdge ${label} cancels a void mutation before replacement-session dispatch`, async () => {
        queryClient.setQueryData(edgeKey, edgeSettings)
        const tree = renderHook(() => NodeEdgeSettingsCard({ node: edgeNode }))
        const requests: unknown[] = []
        instance.defaults.adapter = async (config) => {
            requests.push(config)
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: edgeSettings }
            }
        }
        findClick(tree, label)()
        const mutation = queryClient.getMutationCache().getAll()[0]
        assert(mutation)
        setAuthorizationToken('replacement-session')
        await setImmediate()
        assert.deepEqual(requests, [])
        assert(axios.isCancel(mutation.state.error))
    })

    test(`NodeEdge ${label} preserves same-session request and success handling`, async () => {
        queryClient.setQueryData(edgeKey, edgeSettings)
        const tree = renderHook(() => NodeEdgeSettingsCard({ node: edgeNode }))
        const requests: { method: string | undefined; body: unknown }[] = []
        instance.defaults.adapter = async (config) => {
            requests.push({ method: config.method, body: JSON.parse(config.data) })
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: { ...edgeSettings, revision: 2 } }
            }
        }
        findClick(tree, label)()
        const mutation = queryClient.getMutationCache().getAll()[0]
        await setImmediate()
        assert.equal(mutation.state.status, 'success')
        if (label.startsWith('Save')) {
            assert.deepEqual(requests, [
                { method: 'put', body: { expectedRevision: 1, settings: edgeSettings.settings } }
            ])
            assert.deepEqual(queryClient.getQueryData(edgeKey), { ...edgeSettings, revision: 2 })
        } else {
            assert.deepEqual(requests, [{ method: 'post', body: { forceRestart: true } }])
        }
    })

    test(`NodeEdge ${label} rejects an already accepted response after a session swap`, async () => {
        queryClient.setQueryData(edgeKey, edgeSettings)
        const tree = renderHook(() => NodeEdgeSettingsCard({ node: edgeNode }))
        const entered = deferred()
        const release = deferred()
        const interceptor = instance.interceptors.response.use(async (response) => {
            entered.resolve()
            await release.promise
            return response
        })
        instance.defaults.adapter = async (config) => ({
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { response: { ...edgeSettings, revision: 2 } }
        })
        try {
            findClick(tree, label)()
            const mutation = queryClient.getMutationCache().getAll()[0]
            await entered.promise
            setAuthorizationToken('replacement-session')
            release.resolve()
            await setImmediate()
            assert(axios.isCancel(mutation.state.error))
            assert.equal(queryClient.getQueryData(edgeKey), undefined)
        } finally {
            instance.interceptors.response.eject(interceptor)
        }
    })
}

test('NodeEdge reload must not restore the canceled refetch previous-data snapshot', async () => {
    queryClient.setQueryData(edgeKey, edgeSettings)
    const tree = renderHook(() => NodeEdgeSettingsCard({ node: edgeNode }))
    const entered = deferred()
    const release = deferred()
    let signal: AbortSignal | undefined
    instance.defaults.adapter = async (config) => {
        signal = config.signal as AbortSignal
        entered.resolve()
        await release.promise
        return {
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { response: edgeSettings }
        }
    }
    const originalClone = globalThis.structuredClone
    const restoredDrafts: unknown[] = []
    globalThis.structuredClone = <T>(value: T, options?: StructuredSerializeOptions): T => {
        restoredDrafts.push(value)
        return originalClone(value, options)
    }
    try {
        const reload = findClick(tree, 'Reload')()
        await entered.promise
        setAuthorizationToken('replacement-session')
        release.resolve()
        await reload
        assert.equal(signal?.aborted, true)
        assert.deepEqual(
            restoredDrafts,
            [],
            'Refetch cancellation can return its old cached data; do not load it'
        )
    } finally {
        globalThis.structuredClone = originalClone
    }
})
