import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

type ScreenshotApi = typeof import('./copy-screenshot.util.ts')

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

// Execute the production module with isolated DOM/canvas/OS fixtures. These tests
// verify cancellation boundaries, not browser clipboard permission behavior.
function fixture(
    options: {
        share?: boolean
        mobile?: boolean
        render?: Promise<{ width: number; height: number }>
        shareAction?: () => Promise<void>
        append?: () => void
    } = {}
) {
    const actions: string[] = []
    const blobs: Blob[] = []
    const png = new Blob(['fixture PNG'], { type: 'image/png' })
    let renders = 0
    const context = {
        fillRect() {},
        createRadialGradient: () => ({ addColorStop() {} }),
        save() {},
        beginPath() {},
        roundRect() {},
        clip() {},
        drawImage() {},
        restore() {}
    }
    const document = {
        body: {
            appendChild() {
                actions.push('append')
                options.append?.()
            }
        },
        createElement: (tag: string) =>
            tag === 'canvas'
                ? { getContext: () => context, toBlob: (callback: BlobCallback) => callback(png) }
                : { click: () => actions.push('download'), remove: () => actions.push('remove') }
    }
    class FixtureClipboardItem {
        constructor(public values: Record<string, Blob | Promise<Blob>>) {}
    }
    const navigator = {
        userAgent: options.mobile ? 'iPhone' : 'Chrome',
        maxTouchPoints: 0,
        canShare: () => Boolean(options.share),
        share: async () => {
            actions.push('share')
            await options.shareAction?.()
        },
        clipboard: {
            write: async (items: FixtureClipboardItem[]) => {
                actions.push('clipboard-start')
                for (const item of items) blobs.push(await item.values['image/png'])
                actions.push('clipboard-data')
            }
        }
    }
    const source = readFileSync(new URL('./copy-screenshot.util.ts', import.meta.url), 'utf8')
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const exports = {} as ScreenshotApi
    const require = (id: string) => {
        assert.equal(id, 'modern-screenshot')
        return {
            domToCanvas: async () => {
                renders++
                return options.render ?? { width: 100, height: 80 }
            }
        }
    }
    new Function(
        'exports',
        'require',
        'navigator',
        'document',
        'ClipboardItem',
        'URL',
        'setTimeout',
        code
    )(
        exports,
        require,
        navigator,
        document,
        FixtureClipboardItem,
        {
            createObjectURL: () => {
                actions.push('create-url')
                return 'blob:fixture'
            },
            revokeObjectURL: () => actions.push('revoke-url')
        },
        (callback: () => void) => {
            callback()
            return 1
        }
    )
    return {
        api: exports,
        actions,
        blobs,
        renders: () => renders,
        element: {} as HTMLElement,
        image: (decode = Promise.resolve()) =>
            ({ decode: () => decode, naturalWidth: 100, naturalHeight: 80 }) as HTMLImageElement
    }
}

test('default desktop screenshot and image paths still copy/download PNG data', async () => {
    const f = fixture()
    await f.api.copyScreenshotToClipboard(f.element)
    await f.api.downloadScreenshot(f.element, 'fixture.png')
    await f.api.copyImageScreenshotToClipboard(f.image(), 'image.png')
    await f.api.downloadImageScreenshot(f.image(), 'image.png')
    assert.equal(f.blobs.length, 2)
    assert.ok(f.blobs.every((blob) => blob.type === 'image/png'))
    assert.equal(f.actions.filter((action) => action === 'download').length, 2)
    assert.equal(f.actions.filter((action) => action === 'remove').length, 2)
    assert.equal(f.actions.filter((action) => action === 'revoke-url').length, 2)
})

test('all four APIs reject an already canceled export without starting browser work', async () => {
    const f = fixture()
    const signal = AbortSignal.abort()
    await assert.rejects(f.api.copyScreenshotToClipboard(f.element, 'fixture.png', signal), {
        name: 'AbortError'
    })
    await assert.rejects(f.api.downloadScreenshot(f.element, 'fixture.png', signal), {
        name: 'AbortError'
    })
    await assert.rejects(f.api.copyImageScreenshotToClipboard(f.image(), 'fixture.png', signal), {
        name: 'AbortError'
    })
    await assert.rejects(f.api.downloadImageScreenshot(f.image(), 'fixture.png', signal), {
        name: 'AbortError'
    })
    assert.deepEqual(f.actions, [])
    assert.equal(f.renders(), 0)
})

test('pending screenshot target is canceled before rendering and the clipboard promise receives no image', async () => {
    const f = fixture()
    const target = deferred<HTMLElement>()
    const controller = new AbortController()
    const copy = f.api.copyScreenshotToClipboard(
        () => target.promise,
        'fixture.png',
        controller.signal
    )
    assert.deepEqual(f.actions, ['clipboard-start'])
    controller.abort()
    target.resolve(f.element)
    await assert.rejects(copy, { name: 'AbortError' })
    assert.equal(f.renders(), 0)
    assert.deepEqual(f.blobs, [])
})

test('cancellation while rendering or decoding suppresses download, share and clipboard data', async () => {
    for (const mode of ['copy', 'download', 'image-copy', 'image-download'] as const) {
        const rendered = deferred<{ width: number; height: number }>()
        const decoded = deferred<void>()
        const f = fixture({ render: rendered.promise })
        const controller = new AbortController()
        const operation =
            mode === 'copy'
                ? f.api.copyScreenshotToClipboard(f.element, 'fixture.png', controller.signal)
                : mode === 'download'
                  ? f.api.downloadScreenshot(f.element, 'fixture.png', controller.signal)
                  : mode === 'image-copy'
                    ? f.api.copyImageScreenshotToClipboard(
                          f.image(decoded.promise),
                          'fixture.png',
                          controller.signal
                      )
                    : f.api.downloadImageScreenshot(
                          f.image(decoded.promise),
                          'fixture.png',
                          controller.signal
                      )
        await Promise.resolve()
        await Promise.resolve()
        controller.abort()
        rendered.resolve({ width: 100, height: 80 })
        decoded.resolve()
        await assert.rejects(operation, { name: 'AbortError' })
        assert.deepEqual(f.blobs, [])
        assert.equal(f.actions.includes('download'), false)
        assert.equal(f.actions.includes('share'), false)
    }
})

test('cancellation before the actual anchor click removes the link and revokes its URL', async () => {
    const controller = new AbortController()
    const f = fixture({ append: () => controller.abort() })
    await assert.rejects(f.api.downloadScreenshot(f.element, 'fixture.png', controller.signal), {
        name: 'AbortError'
    })
    assert.deepEqual(f.actions, ['create-url', 'append', 'remove', 'revoke-url'])
})

test('session cancellation during an already open native share never falls back to clipboard or download', async () => {
    for (const mode of ['copy', 'download'] as const) {
        const share = deferred<void>()
        const started = deferred<void>()
        const f = fixture({
            share: true,
            mobile: true,
            shareAction: () => {
                started.resolve()
                return share.promise
            }
        })
        const controller = new AbortController()
        const operation =
            mode === 'copy'
                ? f.api.copyScreenshotToClipboard(f.element, 'fixture.png', controller.signal)
                : f.api.downloadScreenshot(f.element, 'fixture.png', controller.signal)
        await started.promise
        controller.abort()
        share.resolve()
        await assert.rejects(operation, { name: 'AbortError' })
        assert.deepEqual(f.actions, ['share'])
    }
})

test('native share user cancellation remains a handled action, other failures preserve existing fallback', async () => {
    const canceled = fixture({
        share: true,
        mobile: true,
        shareAction: async () => {
            throw new DOMException('user canceled', 'AbortError')
        }
    })
    await canceled.api.downloadScreenshot(canceled.element, 'fixture.png')
    assert.deepEqual(canceled.actions, ['share'])
    const failed = fixture({
        share: true,
        shareAction: async () => {
            throw new Error('share unavailable')
        }
    })
    await failed.api.copyScreenshotToClipboard(failed.element)
    assert.deepEqual(failed.actions, ['share', 'clipboard-start', 'clipboard-data'])
})
