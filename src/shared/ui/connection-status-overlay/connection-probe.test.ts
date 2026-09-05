import { GetRemnawaveHealthCommand, GetStatusCommand } from '@remnawave/backend-contract'
import { onlineManager, QueryClient } from '@tanstack/react-query'
import { AxiosError, CanceledError, isCancel, type InternalAxiosRequestConfig } from 'axios'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'

Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } }
})
const { instance, getSessionGeneration, setAuthorizationToken } = await import('../../api/axios.ts')
const { connectionProbeOptions, connectionProbeRetryDelay } = await import('./connection-probe.ts')
const originalAdapter = instance.defaults.adapter

const response = (config: InternalAxiosRequestConfig) => ({
    config,
    data: {},
    status: 200,
    statusText: 'OK',
    headers: {}
})
const probe = (signal = new AbortController().signal) =>
    connectionProbeOptions(getSessionGeneration()).queryFn({ signal })

beforeEach(() => {
    setAuthorizationToken('')
    onlineManager.setOnline(false)
})
after(() => {
    instance.defaults.adapter = originalAdapter
    setAuthorizationToken('')
    onlineManager.setOnline(true)
})

test('public and signed-in probes preserve endpoint selection and 5-second timeout', async () => {
    for (const [token, endpoint] of [
        ['', GetStatusCommand.TSQ_url],
        ['fixture-token', GetRemnawaveHealthCommand.TSQ_url]
    ]) {
        setAuthorizationToken(token)
        instance.defaults.adapter = async (config) => {
            assert.equal(config.url, endpoint)
            assert.equal(config.timeout, 5_000)
            assert(config.signal)
            return response(config)
        }
        assert.equal(await probe(), true)
        assert.equal(onlineManager.isOnline(), true)
    }
})

test('network failures remain offline and retry until an actual HTTP response returns', async () => {
    let requests = 0
    const client = new QueryClient()
    instance.defaults.adapter = async (config) => {
        if (++requests < 3) throw new AxiosError('Fixture offline', 'ERR_NETWORK', config)
        return response(config)
    }
    try {
        assert.equal(
            await client.fetchQuery({
                ...connectionProbeOptions(getSessionGeneration()),
                retryDelay: 0
            }),
            true
        )
        assert.equal(requests, 3)
        assert.equal(onlineManager.isOnline(), true)
    } finally {
        client.clear()
    }
    assert.deepEqual(
        [0, 1, 4, 5, 100].map(connectionProbeRetryDelay),
        [1_000, 2_000, 16_000, 30_000, 30_000]
    )
})

test('HTTP failure proves reachability without replacing connectivity with an endless spinner', async () => {
    instance.defaults.adapter = async (config) => {
        throw new AxiosError('Fixture service error', 'ERR_BAD_RESPONSE', config, undefined, {
            ...response(config),
            status: 503
        })
    }
    assert.equal(await probe(), true)
    assert.equal(onlineManager.isOnline(), true)
})

test('canceled probes never retry or publish online state', async () => {
    const controller = new AbortController()
    controller.abort()
    instance.defaults.adapter = async () => assert.fail('An aborted probe must not dispatch')
    await assert.rejects(probe(controller.signal), isCancel)
    assert.equal(onlineManager.isOnline(), false)
    assert.equal(
        connectionProbeOptions(getSessionGeneration()).retry(0, new CanceledError()),
        false
    )
})

test('a late old-session response cannot mark the replacement session online', async () => {
    setAuthorizationToken('old-fixture-session')
    let release!: () => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
        started = resolve
    })
    const waiting = new Promise<void>((resolve) => {
        release = resolve
    })
    instance.defaults.adapter = async (config) => {
        started()
        await waiting
        return response(config)
    }
    const pending = probe()
    const rejected = assert.rejects(pending, isCancel)
    await entered
    setAuthorizationToken('new-fixture-session')
    release()
    await rejected
    assert.equal(onlineManager.isOnline(), false)
})
