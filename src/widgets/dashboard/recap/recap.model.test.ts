import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BG_STYLES, CARD_SECTIONS, MASKABLE_FIELDS, SWATCHES } from './recap.constants.ts'
import {
    createRecapExporter,
    createRecapPreferences,
    recapBackground,
    recapColorAlpha,
    recapColorHex,
    recapField,
    recapReducer,
    waitForRecapLayout,
    type RecapExportKind
} from './recap.model.ts'

test('all original sections, eight independent masks, background modes, presets and bounded note remain editable', () => {
    let state = createRecapPreferences()
    const fresh = createRecapPreferences()
    assert.notEqual(state.sections, fresh.sections)
    for (const section of CARD_SECTIONS) {
        state = recapReducer(state, { type: 'section', value: section.value, selected: false })
        assert.equal(state.sections.includes(section.value), false)
        state = recapReducer(state, { type: 'section', value: section.value, selected: true })
        state = recapReducer(state, { type: 'section', value: section.value, selected: true })
        assert.equal(state.sections.filter((value) => value === section.value).length, 1)
    }
    assert.equal(MASKABLE_FIELDS.length, 8)
    for (const field of MASKABLE_FIELDS) {
        state = recapReducer(state, { type: 'mask', value: field.value })
        assert.equal(recapField(state.maskedFields, field.value, 'private fixture'), '🙈')
        assert.equal(recapField(state.maskedFields, field.value, 0), '🙈')
        state = recapReducer(state, { type: 'mask', value: field.value })
        assert.equal(recapField(state.maskedFields, field.value, 0), 0)
    }
    for (const background of BG_STYLES) {
        state = recapReducer(state, { type: 'background', value: background.value })
        assert.equal(state.bgStyle, background.value)
        assert.equal(
            recapBackground(background.value, state.accent) === null,
            background.value === 'solid'
        )
    }
    for (const color of [...SWATCHES, '#aabbcc']) {
        state = recapReducer(state, { type: 'accent', value: color })
        assert.equal(state.accent, color)
    }
    for (const bad of ['url(https://invalid.example)', 'rgb(999, 1, 2)', 'invalid'])
        assert.equal(recapReducer(state, { type: 'accent', value: bad }), state)
    state = recapReducer(state, { type: 'note', value: 'x'.repeat(50) })
    assert.equal(state.customNote.length, 40)
    assert.equal(recapColorHex('rgb(21, 170, 191)'), '#15aabf')
    assert.equal(recapColorAlpha('#aabbcc', 0.12), 'rgba(170, 187, 204, 0.12)')
    assert.equal(recapColorAlpha('#aabbcc', 3), 'rgba(170, 187, 204, 1)')
})

function exportFixture() {
    let current = true
    let prepareResolve!: () => void
    const prepare = new Promise<void>((resolve) => {
        prepareResolve = resolve
    })
    const states: (RecapExportKind | null)[] = []
    const writes: string[] = []
    const errors: unknown[] = []
    const element = {} as HTMLElement
    const model = createRecapExporter({
        isCurrent: () => current,
        getElement: () => element,
        prepare: async () => prepare,
        copy: async (target, signal) => {
            writes.push('clipboard-start')
            assert.equal(await target(), element)
            signal.throwIfAborted()
            writes.push('clipboard-blob')
        },
        download: async (target, signal) => {
            signal.throwIfAborted()
            assert.equal(target, element)
            writes.push('download')
        },
        onState: (state) => states.push(state),
        onError: (error) => errors.push(error)
    })
    return {
        model,
        states,
        writes,
        errors,
        prepareResolve,
        invalidate: () => {
            current = false
        }
    }
}

test('copy preserves user activation, waits for layout and blocks duplicate exports until complete', async () => {
    const f = exportFixture()
    const copy = f.model.run('copy')
    assert.deepEqual(f.writes, ['clipboard-start'])
    assert.equal(await f.model.run('download'), false)
    assert.deepEqual(f.states, ['copy'])
    f.prepareResolve()
    assert.equal(await copy, true)
    assert.deepEqual(f.writes, ['clipboard-start', 'clipboard-blob'])
    assert.deepEqual(f.states, ['copy', null])
    assert.equal(await f.model.run('download'), true)
    assert.deepEqual(f.states, ['copy', null, 'download', null])
})

test('close/session change during either export cancels before producing data without stale toasts or setState', async () => {
    for (const kind of ['copy', 'download'] as const)
        for (const boundary of ['close', 'session'] as const) {
            const f = exportFixture()
            const exportTask = f.model.run(kind)
            if (boundary === 'close') f.model.dispose()
            else f.invalidate()
            f.prepareResolve()
            assert.equal(await exportTask, false)
            assert.deepEqual(f.writes, kind === 'copy' ? ['clipboard-start'] : [])
            assert.deepEqual(f.errors, [])
            assert.deepEqual(f.states, [kind])
            assert.equal(await f.model.run('download'), false)
        }
})

test('current render/export failures surface once and release busy state for retry', async () => {
    const errors: unknown[] = []
    const states: (RecapExportKind | null)[] = []
    let target: HTMLElement | null = null
    const model = createRecapExporter({
        isCurrent: () => true,
        getElement: () => target,
        prepare: async () => {},
        copy: async (getTarget) => {
            await getTarget()
        },
        download: async () => {},
        onState: (kind) => states.push(kind),
        onError: (error) => errors.push(error)
    })
    assert.equal(await model.run('download'), false)
    assert.match(String(errors[0]), /no longer available/)
    target = {} as HTMLElement
    assert.equal(await model.run('download'), true)
    assert.deepEqual(states, ['download', null, 'download', null])
    assert.equal(errors.length, 1)
})

test('layout waits for two animation frames and cancels a pending frame when the modal closes', async () => {
    const originalRequest = globalThis.requestAnimationFrame
    const originalCancel = globalThis.cancelAnimationFrame
    const frames = new Map<number, FrameRequestCallback>()
    let id = 0
    globalThis.requestAnimationFrame = (callback) => {
        frames.set(++id, callback)
        return id
    }
    globalThis.cancelAnimationFrame = (key) => {
        frames.delete(key)
    }
    const advance = () => {
        const callbacks = [...frames.values()]
        frames.clear()
        callbacks.forEach((callback) => callback(0))
    }
    try {
        const signal = new AbortController()
        let settled = false
        const ready = waitForRecapLayout(signal.signal).then(() => {
            settled = true
        })
        advance()
        await Promise.resolve()
        assert.equal(settled, false)
        advance()
        await ready
        assert.equal(settled, true)
        const cancel = new AbortController()
        const waiting = waitForRecapLayout(cancel.signal)
        advance()
        cancel.abort()
        await assert.rejects(waiting, { name: 'AbortError' })
        assert.equal(frames.size, 0)
        await assert.rejects(waitForRecapLayout(cancel.signal), { name: 'AbortError' })
    } finally {
        globalThis.requestAnimationFrame = originalRequest
        globalThis.cancelAnimationFrame = originalCancel
    }
})
