import assert from 'node:assert/strict'
import test from 'node:test'

import { createHeroModalLifecycle } from './modal-lifecycle'

function harness(keepMounted = false) {
    const events: unknown[] = []
    let session = 0
    const handler = {
        visible: true,
        keepMounted,
        resolve: (value: unknown) => events.push(['resolve', value]),
        hide: async () => {
            events.push('hide')
            handler.visible = false
        },
        resolveHide: () => events.push('resolveHide'),
        remove: () => events.push('remove')
    }
    const lifecycle = createHeroModalLifecycle(
        () => handler,
        () => session
    )
    lifecycle.sync('first')
    return {
        lifecycle,
        events,
        handler,
        replaceSession: () => {
            session++
        }
    }
}

test('cancel resolves show once, invalidates work immediately, and removes only after exit', () => {
    const h = harness()
    const lease = h.lifecycle.capture()
    h.lifecycle.close()
    h.lifecycle.close()
    assert.equal(lease.isCurrent(), false)
    assert.deepEqual(h.events, [['resolve', undefined], 'hide'])
    h.lifecycle.sync('first')
    h.lifecycle.afterClose()
    h.lifecycle.afterClose()
    assert.deepEqual(h.events, [['resolve', undefined], 'hide', 'resolveHide', 'remove'])
})

test('save resolves its payload and keepMounted still resolves hide without removing', () => {
    const h = harness(true)
    h.lifecycle.close({ saved: true })
    h.lifecycle.sync('first')
    h.lifecycle.afterClose()
    assert.deepEqual(h.events, [['resolve', { saved: true }], 'hide', 'resolveHide'])
})

test('StrictMode presence cleanup cannot remove an open dialog', () => {
    const h = harness()
    const lease = h.lifecycle.capture()
    h.lifecycle.afterClose()
    h.lifecycle.mount()
    assert.equal(
        lease.isCurrent(),
        true,
        'first effect mounting must not invalidate a child effect lease'
    )
    assert.deepEqual(h.events, [])
})

test('StrictMode child effect replay can capture before its parent remount effect', () => {
    const h = harness()
    const old = h.lifecycle.capture()
    h.lifecycle.dispose()
    const replayedChild = h.lifecycle.capture()
    h.lifecycle.mount()
    assert.equal(old.isCurrent(), false)
    assert.equal(replayedChild.isCurrent(), true)
})

test('external NiceModal hide settles both promises on the real exit boundary', () => {
    const h = harness()
    h.handler.visible = false
    h.lifecycle.sync('first')
    h.lifecycle.afterClose()
    assert.deepEqual(h.events, [['resolve', undefined], 'resolveHide', 'remove'])
})

test('a reopened modal cannot be removed by an older exit completion', () => {
    const h = harness()
    h.lifecycle.close()
    h.lifecycle.sync('first')
    h.handler.visible = true
    h.lifecycle.sync('first')
    h.lifecycle.afterClose()
    assert.equal(h.lifecycle.capture().isCurrent(), true)
    assert.deepEqual(h.events, [['resolve', undefined], 'hide'])
})

test('a new NiceModal show invocation invalidates the prior lease even with the same entity', () => {
    const h = harness()
    const old = h.lifecycle.capture()
    h.lifecycle.sync('first', {})
    assert.equal(old.isCurrent(), false)
    assert.equal(h.lifecycle.capture().isCurrent(), true)
})

test('entity changes, session replacement and unmount independently invalidate work', () => {
    const h = harness()
    const entity = h.lifecycle.capture()
    h.lifecycle.sync('second')
    assert.equal(entity.isCurrent(), false)
    const session = h.lifecycle.capture()
    h.replaceSession()
    assert.equal(session.isCurrent(), false)
    const mounted = h.lifecycle.capture()
    h.lifecycle.dispose()
    assert.equal(mounted.isCurrent(), false)
    h.lifecycle.afterClose()
    assert.deepEqual(h.events, [])
    h.lifecycle.mount()
    assert.equal(mounted.isCurrent(), false)
    assert.equal(h.lifecycle.capture().isCurrent(), true)
})
