import type { QuickLinksContext } from '../../_modals/universal/quick-links-modal/quick-links.model'
import type { IQuickLauncherRoute, TQuickLink } from './quick-links.types'
import type { ComponentType } from 'react'

import * as hero from '@heroui/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as middleware from 'zustand/middleware'

import * as editor from '../../_modals/universal/quick-links-modal/quick-links.model.ts'
import * as launcher from './quick-launcher.model.ts'
import * as types from './quick-links.types.ts'

const require = createRequire(import.meta.url)
function production<T>(path: string, dependencies: Record<string, unknown> = {}): T {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', code)(
        (name: string) =>
            name === '@heroui/react'
                ? hero
                : Object.hasOwn(dependencies, name)
                  ? dependencies[name]
                  : require(name),
        module,
        module.exports
    )
    return module.exports as T
}

const dispatched: unknown[][] = []
const catalog = production<typeof import('./quick-links.catalog')>('./quick-links.catalog.tsx', {
    '@shared/_modals/show-modal': {
        showModal: (...args: unknown[]) => {
            dispatched.push(args)
        }
    }
})
const routes: IQuickLauncherRoute[] = [
    { href: '/dashboard/management/users', name: 'Users', icon: () => null },
    { href: '/dashboard/home', name: 'Home', icon: () => null }
]
const context: QuickLinksContext = {
    routes,
    flags: { quickLauncher: true, sshTerminal: true },
    modals: catalog.QUICK_MODALS
}
const ssh: TQuickLink = { kind: 'modal', id: 'sshTerminal' }
const snippets: TQuickLink = { kind: 'modal', id: 'snippets' }
const home: TQuickLink = { kind: 'route', path: '/dashboard/home' }
const external: TQuickLink = {
    kind: 'external',
    label: 'Example',
    url: 'https://example.com',
    icon: 'TbExternalLink'
}

test('production catalog retains both modal dispatches, all 41 icons, and current feature checks', () => {
    assert.equal(Object.keys(catalog.QUICK_ICONS).length, 41)
    assert.deepEqual(Object.keys(catalog.QUICK_MODALS), ['snippets', 'sshTerminal'])
    const navigate: string[] = []
    const opened: string[][] = []
    const run = (link: TQuickLink, flags = context.flags) =>
        launcher.runLauncherLink(
            link,
            routes,
            flags,
            catalog.QUICK_MODALS,
            (path) => navigate.push(path),
            (...args) => opened.push(args)
        )
    assert(run(snippets))
    assert(run(ssh))
    assert.deepEqual(dispatched.splice(0), [
        ['snippets_snippetsModal'],
        ['nodes_nodeSshTerminal', {}]
    ])
    assert.equal(run(ssh, { sshTerminal: false }), false)
    assert(run(home))
    assert.deepEqual(navigate, ['/dashboard/home'])
    assert.equal(run({ kind: 'route', path: '/not-in-catalog' }), false)
    assert(run(external))
    assert.deepEqual(opened, [['https://example.com', '_blank', 'noopener,noreferrer']])
    for (const url of [
        'http://example.com',
        'javascript:alert(1)',
        'data:text/html,test',
        'https://user:secret@example.com',
        '//example.com'
    ])
        assert.equal(run({ ...external, url }), false)
})

test('legacy preferences sanitize without deleting hidden SSH or unknown old routes', () => {
    const links = types.sanitizeQuickLinks([
        { kind: 'builtin', id: 'sshTerminal' },
        { kind: 'route', path: '/old-route' },
        { ...external, icon: 'old-icon', label: '  Old label  ' },
        { ...external, url: 'http://unsafe.test' }
    ])
    assert.deepEqual(links, [
        ssh,
        { kind: 'route', path: '/old-route' },
        { ...external, label: 'Old label' }
    ])
    const draft = editor.createQuickLinksDraft(links, true, 'one')
    assert.equal(
        editor.visibleQuickLinks(draft, { ...context, flags: { sshTerminal: false } }).length,
        2
    )
    assert.equal(draft.links.length, 3)
    assert.equal(
        links.filter((link) =>
            launcher.isLauncherLinkAvailable(link, routes, { sshTerminal: false }, context.modals)
        ).length,
        1
    )
})

test('actual Zustand store rehydrates v1, retains position/columns/hidden preferences and persists edits', () => {
    let persisted = JSON.stringify({
        version: 1,
        state: {
            layoutStyle: 'sidebar',
            launcherPosition: { x: 22, y: 33 },
            launcherColumns: 4,
            experimental: { quickLauncher: true, sshTerminal: false },
            quickLinks: [{ kind: 'builtin', id: 'sshTerminal' }, home]
        }
    })
    const memory = {
        getItem: () => persisted,
        setItem: (_key: string, value: string) => {
            persisted = value
        },
        removeItem: () => {
            persisted = ''
        }
    }
    const enums = production(
        '../../../entities/dashboard/view-preferences-store/interfaces/enums.ts'
    )
    const storeModule = production<
        typeof import('../../../entities/dashboard/view-preferences-store/use-view-preferences-store')
    >('../../../entities/dashboard/view-preferences-store/use-view-preferences-store.ts', {
        'zustand/middleware': {
            ...middleware,
            createJSONStorage: () => middleware.createJSONStorage(() => memory)
        },
        '@shared/ui/quick-launcher/quick-links.types': types,
        './interfaces': enums
    })
    const store = storeModule.useViewPreferencesStore
    assert.deepEqual(store.getState().launcherPosition, { x: 22, y: 33 })
    assert.equal(store.getState().launcherColumns, 4)
    assert.equal(store.getState().experimental.legacyLayoutStyle, true)
    assert.equal(store.getState().experimental.sshTerminal, false)
    assert.deepEqual(store.getState().quickLinks, [ssh, home])
    store.getState().actions.setLauncherColumns(2)
    store.getState().actions.setLauncherPosition({ x: 44, y: 55 })
    store.getState().actions.setQuickLinks([home, ssh, external])
    const saved = JSON.parse(persisted)
    assert.equal(saved.version, 2)
    assert.equal(saved.state.launcherColumns, 2)
    assert.deepEqual(saved.state.launcherPosition, { x: 44, y: 55 })
    assert.deepEqual(saved.state.quickLinks, [home, ssh, external])
})

test('launcher geometry clamps viewport and column preferences, including narrow/small windows', () => {
    assert.equal(launcher.launcherColumns(null, 12, 1024), 3)
    assert.equal(launcher.launcherColumns(12, 12, 180), 3)
    assert.equal(launcher.launcherColumns(12, 2, 1024), 2)
    assert.equal(launcher.launcherColumns(null, 0, 20), 1)
    assert.equal(launcher.resizeLauncherColumns(1000, 500, 700), 3)
    assert.equal(launcher.resizeLauncherColumns(-10, 0, 700), 1)
    assert.deepEqual(
        launcher.clampLauncherPosition(
            { x: 900, y: -2 },
            { width: 176, height: 100 },
            { width: 500, height: 400 }
        ),
        { x: 324, y: 0 }
    )
    assert.deepEqual(
        launcher.clampLauncherPosition(
            { x: Infinity, y: 100 },
            { width: 176, height: 100 },
            { width: 20, height: 40 }
        ),
        { x: 0, y: 0 }
    )
})

test('long press/drag uses pointer ownership, cancels early movement, suppresses only the completed drag click', () => {
    const gesture = launcher.createLauncherGesture()
    const size = { width: 100, height: 100 },
        viewport = { width: 500, height: 400 }
    assert(gesture.begin(1, 20, 30, { x: 10, y: 10 }, false))
    assert.equal(gesture.begin(2, 0, 0, { x: 0, y: 0 }, false), false)
    assert.equal(gesture.activate(2), false)
    assert.equal(gesture.move(1, 30, 40, size, viewport), null)
    assert.equal(gesture.activate(1), false)
    assert.equal(gesture.finish(1), false)
    assert.equal(gesture.shouldSuppressClick(), false)
    gesture.begin(3, 20, 30, { x: 10, y: 10 }, false)
    assert(gesture.activate(3))
    assert(gesture.shouldSuppressClick())
    assert.deepEqual(gesture.move(3, 999, 999, size, viewport), { x: 400, y: 300 })
    assert(gesture.finish(3))
    assert.equal(
        gesture.hasPointer(3),
        false,
        'normal lostpointercapture must not cancel completed-click suppression'
    )
    assert(gesture.shouldSuppressClick())
    gesture.clearSuppressedClick()
    assert.equal(gesture.shouldSuppressClick(), false)
    gesture.begin(4, 0, 0, { x: 0, y: 0 }, true)
    assert(gesture.shouldSuppressClick())
    gesture.cancel()
    assert.equal(
        gesture.activate(4),
        false,
        'a delayed hold cannot restart a closed/disabled launcher'
    )
    assert.equal(gesture.shouldSuppressClick(), false)
})

test('outside release/blur cancels pending hold; normal capture release preserves suppression and cleanup detaches listeners', () => {
    const target = new EventTarget()
    const gesture = launcher.createLauncherGesture()
    let cancelled = 0
    const cleanup = launcher.observeLauncherPointerEnd(target, gesture, () => cancelled++)
    const pointerUp = (pointerId: number) => {
        const event = new Event('pointerup')
        Object.assign(event, { pointerId })
        target.dispatchEvent(event)
    }
    gesture.begin(1, 0, 0, { x: 0, y: 0 }, false)
    pointerUp(2)
    assert.equal(cancelled, 0)
    pointerUp(1)
    assert.equal(cancelled, 1)
    assert.equal(gesture.activate(1), false)
    gesture.begin(3, 0, 0, { x: 0, y: 0 }, true)
    gesture.finish(3)
    pointerUp(3)
    assert.equal(cancelled, 1)
    assert(gesture.shouldSuppressClick())
    target.dispatchEvent(new Event('blur'))
    assert.equal(cancelled, 2)
    assert.equal(gesture.shouldSuppressClick(), false)
    cleanup()
    target.dispatchEvent(new Event('blur'))
    assert.equal(cancelled, 2)
})

test('same open draft survives preference refresh and save failure; cancel/reopen and new-show scope reset', () => {
    let draft = editor.createQuickLinksDraft([home], true, 'show-1')
    draft = { ...draft, links: [home, external], label: 'unfinished' }
    assert.equal(editor.syncQuickLinksDraft(draft, [snippets], true, 'show-1'), draft)
    let closed = 0
    const failed = editor.saveQuickLinksDraft(
        draft,
        () => {
            throw new Error('quota')
        },
        () => {
            closed++
        }
    )
    assert.equal(closed, 0)
    assert.deepEqual(failed.links, draft.links)
    assert.equal(failed.label, 'unfinished')
    assert(failed.error)
    let saved: TQuickLink[] = []
    editor.saveQuickLinksDraft(
        failed,
        (links) => {
            saved = links
        },
        () => {
            closed++
        }
    )
    assert.equal(closed, 1)
    assert.deepEqual(saved, [home, external])
    const hidden = editor.syncQuickLinksDraft(draft, [snippets], false, 'show-1')
    assert.deepEqual(editor.syncQuickLinksDraft(hidden, [home], true, 'show-1').links, [home])
    const reopened = editor.syncQuickLinksDraft(draft, [snippets], true, 'show-2')
    assert.deepEqual(reopened.links, [snippets])
    assert.equal(reopened.label, '')
})

test('add validates live flags/catalog, uniqueness, safe URL and maximum count; switching clears editor fields', () => {
    let draft = editor.createQuickLinksDraft([], true, null)
    draft = { ...draft, modalId: 'sshTerminal' }
    assert.equal(editor.addQuickLink(draft, { ...context, flags: { sshTerminal: false } }), draft)
    draft = editor.addQuickLink(draft, context)
    assert.deepEqual(draft.links, [ssh])
    assert.equal(draft.modalId, null)
    assert.equal(editor.pendingQuickLink({ ...draft, modalId: 'sshTerminal' }, context), null)
    draft = { ...editor.switchQuickLinkKind(draft, 'route'), routePath: '/missing' }
    assert.equal(editor.addQuickLink(draft, context), draft)
    draft = editor.addQuickLink({ ...draft, routePath: home.path }, context)
    assert.deepEqual(draft.links, [ssh, home])
    draft = {
        ...editor.switchQuickLinkKind(draft, 'external'),
        label: ' Example ',
        url: ' https://example.com '
    }
    draft = editor.addQuickLink(draft, context)
    assert.deepEqual(draft.links, [ssh, home, external])
    assert.equal(draft.url, '')
    assert.equal(
        editor.pendingQuickLink(
            { ...draft, label: 'Duplicate', url: 'https://example.com/' },
            context
        ),
        null
    )
    for (const url of [
        'http://example.test',
        'https://root:secret@example.test',
        'javascript:alert(1)'
    ])
        assert.equal(editor.pendingQuickLink({ ...draft, label: 'bad', url }, context), null)
    const full = {
        ...draft,
        links: Array.from({ length: 12 }, () => external),
        label: 'new',
        url: 'https://other.example'
    }
    assert.equal(editor.pendingQuickLink(full, context), null)
    const switched = editor.switchQuickLinkKind(
        { ...draft, label: 'x', url: 'x', icon: 'TbBolt', routeSearch: 'find' },
        'modal'
    )
    assert.equal(switched.label + switched.url + switched.routeSearch, '')
    assert.equal(switched.icon, types.DEFAULT_QUICK_ICON)
    const searched = editor.searchQuickLinkRoutes(
        { ...switched, kind: 'route', routePath: home.path },
        'Users'
    )
    assert.equal(searched.routePath, null)
    assert.equal(editor.pendingQuickLink(searched, context), null)
})

test('visible reorder and remove preserve hidden SSH entries and original link data', () => {
    const hidden = { ...context, flags: { sshTerminal: false } }
    const draft = editor.createQuickLinksDraft([home, ssh, external, snippets], true, null)
    const moved = editor.moveQuickLink(draft, 0, 2, hidden)
    assert.deepEqual(moved.links, [ssh, external, snippets, home])
    assert.deepEqual(draft.links, [home, ssh, external, snippets])
    assert.equal(editor.moveQuickLink(draft, -1, 0, hidden), draft)
    const visible = editor.visibleQuickLinks(moved, hidden)
    const removed = editor.removeQuickLink(moved, visible[0].index)
    assert.deepEqual(removed.links, [ssh, snippets, home])
})

const i18n = { useTranslation: () => ({ t: (key: string) => key }) }
const preferences = {
    useExperimentalFeature: () => true,
    useExperimentalFeatures: () => context.flags,
    useLauncherColumns: () => 3,
    useLauncherPosition: () => null,
    useQuickLinks: () => [ssh, home, external],
    useViewPreferencesStoreActions: () => ({
        setLauncherColumns: () => {},
        setLauncherPosition: () => {}
    })
}
test('production launcher SSR retains labeled native buttons and feature-hidden entries do not render', () => {
    const dependencies = {
        'react-i18next': i18n,
        'react-router': { useNavigate: () => () => {} },
        '@shared/_modals/show-modal': { showModal: () => {} },
        '@shared/utils/scroll-lock-shards': { registerScrollLockShard: () => () => {} },
        '@entities/dashboard/view-preferences-store': preferences,
        './quick-links.catalog': catalog,
        './quick-links.types': types,
        './quick-launcher.model': launcher,
        './QuickLauncher.module.css': {}
    }
    const { QuickLauncher } = production<{
        QuickLauncher: ComponentType<{ routes: IQuickLauncherRoute[] }>
    }>('./quick-launcher.tsx', dependencies)
    const html = renderToStaticMarkup(createElement(QuickLauncher, { routes }))
    assert.match(html, /aria-label="node-ssh.title"/)
    assert.match(html, /aria-label="Home"/)
    assert.match(html, /aria-label="Example"/)
    assert.match(html, /<button/)
    const hidden = production<{ QuickLauncher: ComponentType<{ routes: IQuickLauncherRoute[] }> }>(
        './quick-launcher.tsx',
        {
            ...dependencies,
            '@entities/dashboard/view-preferences-store': {
                ...preferences,
                useExperimentalFeatures: () => ({ sshTerminal: false })
            }
        }
    )
    assert.doesNotMatch(
        renderToStaticMarkup(createElement(hidden.QuickLauncher, { routes })),
        /node-ssh.title/
    )
    const disabled = production<{
        QuickLauncher: ComponentType<{ routes: IQuickLauncherRoute[] }>
    }>('./quick-launcher.tsx', {
        ...dependencies,
        '@entities/dashboard/view-preferences-store': {
            ...preferences,
            useExperimentalFeature: () => false
        }
    })
    assert.equal(renderToStaticMarkup(createElement(disabled.QuickLauncher, { routes })), '')
})

test('production M07 SSR renders all three native tab workflows, accessible reorder/removal, and save failure', () => {
    const { QuickLinksEditor } = production<
        typeof import('../../_modals/universal/quick-links-modal/quick-links.modal')
    >('../../_modals/universal/quick-links-modal/quick-links.modal.tsx', {
        'react-i18next': i18n,
        '@shared/_modals/use-hero-modal': {},
        '@shared/ui/quick-launcher': { ...catalog, ...types },
        '@shared/ui/quick-launcher/quick-launcher.model': launcher,
        '@entities/dashboard/view-preferences-store': {},
        './quick-links.model': editor
    })
    for (const kind of ['modal', 'route', 'external'] as const) {
        const draft = {
            ...editor.createQuickLinksDraft([home, external, ssh], true, null),
            kind,
            error: 'Save failed'
        }
        const html = renderToStaticMarkup(
            createElement(QuickLinksEditor, {
                draft,
                context,
                setDraft: () => {},
                onSave: () => {},
                onCancel: () => {}
            })
        )
        assert.match(html, /role="tablist"/)
        assert.match(html, /aria-label="Move up: Home"/)
        assert.match(html, /aria-label="Move down: Example"/)
        assert.match(html, /aria-label="common.action.delete: Example"/)
        assert.match(html, /role="alert">Save failed/)
        assert.match(html, /common.action.save/)
        assert.match(html, /common.action.cancel/)
        if (kind === 'route') assert.match(html, /type="search"/)
        if (kind === 'external') {
            assert.match(html, /HTTPS URL/)
            assert.match(html, /Choose quick link icon/)
            assert.match(html, /maxLength="40"/i)
        }
    }
})
