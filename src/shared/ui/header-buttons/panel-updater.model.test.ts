import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    canRequestPanelUpdate,
    createPanelUpdateLifecycle,
    sameUpdateTarget,
    type PanelUpdateEvent,
    type PanelUpdateStatus
} from './panel-updater.model.ts'

const status = (change: Partial<PanelUpdateStatus> = {}): PanelUpdateStatus => ({
    configured: true,
    reachable: true,
    channel: 'xboard-dev',
    state: 'IDLE',
    currentVersion: '1.0.0',
    targetVersion: '1.0.1',
    updateAvailable: true,
    lastError: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...change
})
const accepted = async () => ({
    accepted: true as const,
    channel: 'xboard-dev' as const,
    state: 'QUEUED' as const,
    operationId: 'fixture-operation',
    message: 'fixture accepted'
})
function fixture() {
    let current = true
    let reloads = 0
    const events: PanelUpdateEvent[] = []
    const timers: { callback(): void; delay: number; canceled: boolean }[] = []
    const model = createPanelUpdateLifecycle({
        isCurrent: () => current,
        notify: (event) => events.push(event),
        reload: () => {
            reloads++
        },
        schedule: (callback, delay) => {
            const timer = { callback, delay, canceled: false }
            timers.push(timer)
            return () => {
                timer.canceled = true
            }
        }
    })
    return {
        model,
        events,
        timers,
        invalidate: () => {
            current = false
        },
        reloads: () => reloads
    }
}

test('updater eligibility preserves configuration, reachability, fresh status and busy gates', () => {
    assert.equal(canRequestPanelUpdate(status()), true)
    for (const value of [
        undefined,
        status({ configured: false }),
        status({ reachable: false }),
        status({ updateAvailable: false }),
        status({ state: 'UPDATING' })
    ])
        assert.equal(canRequestPanelUpdate(value), false)
    assert.equal(canRequestPanelUpdate(status(), true), false)
    assert.equal(canRequestPanelUpdate(status(), false, new Error('offline')), false)
    assert.equal(sameUpdateTarget(status(), status({ updatedAt: 'new timestamp' })), true)
    for (const value of [
        undefined,
        status({ targetVersion: '2.0.0' }),
        status({ currentVersion: '0.9.0' })
    ])
        assert.equal(sameUpdateTarget(status(), value), false)
})

test('only one request can run; an unchanged old terminal status does not complete a new request', async () => {
    const f = fixture()
    let resolve!: (value: Awaited<ReturnType<typeof accepted>>) => void
    let triggers = 0
    const pending = f.model.request(status({ state: 'SUCCEEDED' }), () => {
        triggers++
        return new Promise((done) => {
            resolve = done
        })
    })
    assert.equal(
        await f.model.request(status(), async () => {
            triggers++
            return accepted()
        }),
        false
    )
    assert.equal(triggers, 1)
    resolve(await accepted())
    assert.equal(await pending, true)
    f.model.observe(status({ state: 'SUCCEEDED' }))
    assert.deepEqual(f.events, [{ type: 'accepted' }])
    f.model.observe(status({ state: 'SUCCEEDED', updatedAt: '2026-01-01T00:00:01Z' }))
    f.model.observe(status({ state: 'SUCCEEDED', updatedAt: '2026-01-01T00:00:02Z' }))
    assert.deepEqual(
        f.events.map((event) => event.type),
        ['accepted', 'succeeded']
    )
    assert.equal(f.timers.length, 1)
    assert.equal(f.timers[0].delay, 1_200)
    f.timers[0].callback()
    assert.equal(f.reloads(), 1)
    f.model.dispose()
    assert.equal(f.timers[0].canceled, true)
})

test('observed running state allows completion even when server timestamp precision is unchanged', async () => {
    const f = fixture()
    await f.model.request(status(), accepted)
    f.model.observe(status({ state: 'UPDATING' }))
    f.model.observe(status({ state: 'FAILED', lastError: 'fixture rollback failed' }))
    f.model.observe(status({ state: 'FAILED', lastError: 'duplicate' }))
    assert.deepEqual(f.events, [
        { type: 'accepted' },
        { type: 'failed', message: 'fixture rollback failed' }
    ])
    assert.equal(f.timers.length, 0)
})

test('rejection and transport failure are surfaced, and a later retry still works', async () => {
    const f = fixture()
    assert.equal(
        await f.model.request(status(), async () => ({
            accepted: false,
            channel: 'xboard-dev',
            state: 'UPDATING',
            operationId: null,
            message: 'already running'
        })),
        false
    )
    assert.equal(
        await f.model.request(status(), async () => {
            throw new Error('fixture network failure')
        }),
        false
    )
    assert.equal(await f.model.request(status(), accepted), true)
    assert.deepEqual(f.events, [
        { type: 'rejected', message: 'already running' },
        { type: 'request-failed', message: 'fixture network failure' },
        { type: 'accepted' }
    ])
})

test('closing or changing session while the POST is pending suppresses all later effects', async () => {
    for (const invalidate of ['dispose', 'session'] as const) {
        const f = fixture()
        let resolve!: (value: Awaited<ReturnType<typeof accepted>>) => void
        const pending = f.model.request(
            status(),
            () =>
                new Promise((done) => {
                    resolve = done
                })
        )
        if (invalidate === 'dispose') f.model.dispose()
        else f.invalidate()
        resolve(await accepted())
        assert.equal(await pending, false)
        f.model.observe(status({ state: 'SUCCEEDED', updatedAt: 'new' }))
        assert.deepEqual(f.events, [])
        assert.equal(f.timers.length, 0)
        assert.equal(await f.model.request(status(), accepted), false)
    }
})

test('a pending success reload cannot escape close or account replacement', async () => {
    for (const invalidate of ['dispose', 'session'] as const) {
        const f = fixture()
        await f.model.request(status(), accepted)
        f.model.observe(status({ state: 'SUCCEEDED', updatedAt: 'new' }))
        if (invalidate === 'dispose') f.model.dispose()
        else f.invalidate()
        f.timers[0].callback()
        assert.equal(f.reloads(), 0)
    }
})
