import * as hero from '@heroui/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createElement, type ReactElement, type Ref } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

import { createPageHeaderCopy } from './page-header-copy.model.ts'

function deferred() {
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const promise = new Promise<void>((done, fail) => {
        resolve = done
        reject = fail
    })
    return { promise, resolve, reject }
}

function fixture() {
    const pending = deferred()
    let current = true
    const writes: string[] = []
    const successes: string[] = []
    const failures: unknown[] = []
    const model = createPageHeaderCopy({
        value: 'fixture description',
        isCurrent: () => current,
        write: (value) => {
            writes.push(value)
            return pending.promise
        },
        success: (value) => successes.push(value),
        failure: (error) => failures.push(error)
    })
    return {
        model,
        pending,
        writes,
        successes,
        failures,
        invalidate: () => {
            current = false
        }
    }
}

test('copy waits for clipboard success before claiming copied and preserves the exact description', async () => {
    const f = fixture()
    const operation = f.model.copy('fixture description')
    assert.deepEqual(f.writes, ['fixture description'])
    assert.deepEqual(f.successes, [])
    f.pending.resolve()
    assert.equal(await operation, true)
    assert.deepEqual(f.successes, ['fixture description'])
    assert.deepEqual(f.failures, [])
})

test('empty, obsolete-description and obsolete-session actions cannot write to the clipboard', async () => {
    const f = fixture()
    for (const value of [undefined, '', 'previous description'])
        assert.equal(await f.model.copy(value), false)
    f.invalidate()
    assert.equal(await f.model.copy('fixture description'), false)
    assert.deepEqual(f.writes, [])
})

test('duplicate presses do not issue concurrent writes and the action becomes reusable after completion', async () => {
    const f = fixture()
    const operation = f.model.copy('fixture description')
    assert.equal(await f.model.copy('fixture description'), false)
    assert.equal(f.writes.length, 1)
    f.pending.resolve()
    await operation
    assert.equal(await f.model.copy('fixture description'), true)
    assert.equal(f.writes.length, 2)
})

test('clipboard rejection or a missing API yields failure, never a false success, and allows retry', async () => {
    const f = fixture()
    const operation = f.model.copy('fixture description')
    const denied = new Error('fixture clipboard permission denied')
    f.pending.reject(denied)
    assert.equal(await operation, false)
    assert.deepEqual(f.successes, [])
    assert.deepEqual(f.failures, [denied])
    assert.equal(await f.model.copy('fixture description'), false)
    assert.equal(f.writes.length, 2)
    const failures: unknown[] = []
    const unsupported = createPageHeaderCopy({
        value: 'fixture',
        isCurrent: () => true,
        write: () => {
            throw new TypeError('clipboard unavailable')
        },
        success: () => assert.fail('No false success'),
        failure: (error) => failures.push(error)
    })
    assert.equal(await unsupported.copy('fixture'), false)
    assert.equal(failures.length, 1)
})

test('unmount, description change and session replacement suppress both late success and error notifications', async () => {
    for (const boundary of ['unmount', 'description', 'session'])
        for (const result of ['resolve', 'reject'] as const) {
            const f = fixture()
            const operation = f.model.copy('fixture description')
            if (boundary === 'session') f.invalidate()
            else f.model.dispose()
            if (result === 'resolve') f.pending.resolve()
            else f.pending.reject(new Error('late failure'))
            assert.equal(await operation, false)
            assert.deepEqual(f.successes, [])
            assert.deepEqual(f.failures, [])
        }
})

const require = createRequire(import.meta.url)
const translation = { useTranslation: () => ({ t: (key: string) => key }) }
function production<T>(
    path: string,
    dependencies: Record<string, unknown>,
    navigator?: unknown
): T {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const code = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    const module = { exports: {} }
    // Keep the production component and native HeroUI intact. Only CSS loading,
    // translation and external I/O are fixtures; this is not a browser test.
    new Function('require', 'module', 'exports', 'navigator', code)(
        (id: string) =>
            Object.hasOwn(dependencies, id)
                ? dependencies[id]
                : id === '@heroui/react'
                  ? hero
                  : id === 'react-i18next'
                    ? translation
                    : require(id),
        module,
        module.exports,
        navigator
    )
    return module.exports as T
}
const classes = new Proxy({}, { get: (_target, key) => String(key) })
let copies = 0
const component = production<typeof import('./page-header.shared.tsx')>(
    './page-header.shared.tsx',
    {
        './page-header.module.css': { __esModule: true, default: classes },
        './use-page-header-copy': {
            usePageHeaderCopy: () => async () => {
                copies++
                return true
            }
        }
    }
)

test('native PageHeader SSR preserves title, copy description, actions, children and merged DOM attributes', () => {
    const markup = renderToStaticMarkup(
        createElement(
            component.PageHeaderShared,
            {
                title: createElement('span', {}, 'Fixture title'),
                description: 'fixture UUID',
                icon: createElement('svg', { 'data-fixture-icon': 'default' }),
                actions: createElement(hero.Button, {}, 'Save fixture'),
                className: 'custom-header',
                id: 'fixture-header',
                'aria-label': 'Fixture header',
                wrapActions: true
            },
            createElement('p', {}, 'Additional header slot')
        )
    )
    assert.match(markup, /<div[^>]*id="fixture-header"[^>]*aria-label="Fixture header"/)
    assert.match(markup, /class="[^"]*card[^"]*custom-header/)
    assert.match(markup, /<h4 class="title"><span>Fixture title<\/span><\/h4>/)
    assert.match(
        markup,
        /<button[^>]*type="button"[^>]*aria-label="common.action.copy: fixture UUID"/
    )
    assert.match(markup, /data-fixture-icon="default"/)
    assert.match(markup, /data-wrap="true"/)
    assert.match(markup, /Save fixture/)
    assert.match(markup, /Additional header slot/)
    assert.doesNotMatch(markup, /mantine|withBorder|padding="md"/)
})

test('custom icon slot takes precedence and absent description/actions do not render phantom controls', () => {
    const markup = renderToStaticMarkup(
        createElement(component.PageHeaderShared, {
            title: 'Title only',
            icon: createElement('span', {}, 'Hidden default'),
            customThemeIcon: createElement(
                'span',
                { role: 'img', 'aria-label': 'Custom icon' },
                'Custom fixture'
            ),
            description: ''
        })
    )
    assert.match(markup, /Custom fixture/)
    assert.match(markup, /aria-label="Custom icon"/)
    assert.doesNotMatch(markup, /Hidden default|<button|actionsSection/)
})

test('copy is wired to a native press action and the root forwards the native div ref', () => {
    type TreeProps = {
        children?: ReactElement<TreeProps>[] | ReactElement<TreeProps>
        onPress?: () => void
        ref?: Ref<HTMLDivElement>
    }
    const ref = { current: null }
    const render = component.PageHeaderShared as unknown as {
        render(
            props: { title: string; description: string },
            ref: Ref<HTMLDivElement>
        ): ReactElement<TreeProps>
    }
    const tree = render.render({ title: 'Fixture', description: 'copy target' }, ref)
    assert.equal(tree.type, hero.Card)
    assert.equal(tree.props.ref, ref)
    let press: (() => void) | undefined
    function find(node: ReactElement<TreeProps> | undefined) {
        if (!node || typeof node !== 'object') return
        if (node.type === hero.Button) press = node.props.onPress
        const children = node.props?.children
        if (Array.isArray(children)) children.forEach(find)
        else find(children)
    }
    find(tree)
    assert.ok(press)
    const before = copies
    press()
    assert.equal(copies, before + 1)
})

test('production copy hook cancels old description callbacks at commit and binds new writes to the new session', async () => {
    let session = 1
    const pending = deferred()
    const writes: string[] = []
    const events: string[] = []
    const lifecycle = { current: null }
    let commit: () => () => void = () => () => {}
    const hook = production<typeof import('./use-page-header-copy.ts')>(
        './use-page-header-copy.ts',
        {
            '@heroui/react': {
                toast: { success: () => events.push('success'), danger: () => events.push('error') }
            },
            '@shared/api/axios': {
                getSessionGeneration: () => session,
                subscribeSessionChanges() {}
            },
            react: {
                useSyncExternalStore: (_subscribe: unknown, snapshot: () => number) => snapshot(),
                useRef: () => lifecycle,
                useLayoutEffect: (effect: () => () => void) => {
                    commit = effect
                }
            },
            './page-header-copy.model': { createPageHeaderCopy }
        },
        {
            clipboard: {
                writeText: (value: string) => {
                    writes.push(value)
                    return pending.promise
                }
            }
        }
    )
    const oldCopy = hook.usePageHeaderCopy('old fixture')
    const cleanupOld = commit()
    const oldWrite = oldCopy()
    const freshCopy = hook.usePageHeaderCopy('new fixture')
    cleanupOld()
    const cleanupFresh = commit()
    pending.resolve()
    assert.equal(await oldWrite, false)
    assert.deepEqual(events, [])
    assert.equal(await oldCopy(), false)
    assert.equal(await freshCopy(), true)
    assert.deepEqual(writes, ['old fixture', 'new fixture'])
    session++
    assert.equal(await freshCopy(), false)
    const replacementCopy = hook.usePageHeaderCopy('new fixture')
    cleanupFresh()
    const cleanupReplacement = commit()
    assert.equal(await replacementCopy(), true)
    cleanupReplacement()
    assert.equal(await replacementCopy(), false)
})

test('native CSS keeps long text wrapping, optional action wrapping, narrow-screen actions and logical RTL alignment', () => {
    const css = readFileSync(new URL('./page-header.module.css', import.meta.url), 'utf8')
    assert.doesNotMatch(css, /mantine/)
    assert.match(css, /overflow-wrap: anywhere/)
    assert.match(css, /\.actions\[data-wrap='true'\]\s*\{\s*min-width: 0;\s*flex-wrap: wrap/)
    assert.match(css, /min-width: max-content/)
    assert.match(css, /@media \(max-width: 40rem\)/)
    assert.match(css, /overflow-x: auto/)
    assert.match(css, /margin-inline-start: auto/)
})
