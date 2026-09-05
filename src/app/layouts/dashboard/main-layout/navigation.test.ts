import type { MenuItem } from './menu-sections/interfaces/menu-item.interface'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createInstance } from 'i18next'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test, { after } from 'node:test'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import ts from 'typescript'

import { parseColoredTextUtil } from '../../../../shared/utils/misc/parse-colored-text.ts'
import { resolveDashboardLayout } from './layout-model.ts'
import {
    flattenNavigationSection,
    isNavigationPathActive,
    isNavigationSectionActive,
    navigationSectionLanding,
    nextNavigationIndex
} from './navbar/navigation-model.ts'

// CSS names are preserved for SSR assertions, without compiling app CSS or claiming visual QA.
const cssLoader = registerHooks({
    load(url, context, nextLoad) {
        if (!url.endsWith('.css')) return nextLoad(url, context)
        const css = readFileSync(new URL(url), 'utf8')
        const names = Object.fromEntries(
            [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => [match[1], match[1]])
        )
        return {
            format: 'module',
            source: `export default ${JSON.stringify(names)}`,
            shortCircuit: true
        }
    }
})
after(() => cssLoader.deregister())

const { useDesktopMenuSections } = await import('./menu-sections/desktop-menu-sections')
const { useMobileMenuSections } = await import('./menu-sections/mobile-menu-sections')
const { DesktopNavigation } = await import('./navbar/desktop-navigation.layout')
const { MobileNavigation } = await import('./navbar/mobile-navigation.layout')
const { XrayLogo, MihomoLogo, SingboxLogo, StashLogo, YandexLogo, PocketidLogo } =
    await import('../../../../shared/ui/logos')
const i18n = createInstance()
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    initAsync: false
})

function render(component: ComponentType, pathname = '/dashboard/home') {
    return renderToStaticMarkup(
        createElement(
            I18nextProvider,
            { i18n },
            createElement(MemoryRouter, { initialEntries: [pathname] }, createElement(component))
        )
    )
}

function readMenu(useMenu: () => MenuItem[]) {
    let menu: MenuItem[] = []
    render(() => {
        menu = useMenu()
        return null
    })
    return menu
}

test('mobile takes precedence over both desktop layout preferences and HiDPI width', () => {
    for (const legacy of [false, true])
        for (const wide of [false, true]) {
            assert.equal(resolveDashboardLayout(true, legacy, wide), 'mobile')
        }
    assert.equal(resolveDashboardLayout(false, true, true), 'sidebar')
    assert.equal(resolveDashboardLayout(false, true, false), 'sidebar')
    assert.equal(resolveDashboardLayout(false, false, false), 'compact')
    assert.equal(resolveDashboardLayout(false, false, true), 'compact-wide')
})

test('native branding inherits foreground in both themes without rewriting explicit colors or legacy defaults', () => {
    assert.deepEqual(parseColoredTextUtil('{cyan}Fixture Panel', 'var(--foreground)'), [
        { text: 'Fixture', color: 'cyan' },
        { text: ' Panel', color: 'var(--foreground)' }
    ])
    assert.deepEqual(parseColoredTextUtil('{ffffff}White', 'var(--foreground)'), [
        { text: 'White', color: '#ffffff' }
    ])
    assert.deepEqual(parseColoredTextUtil('Legacy'), [{ text: 'Legacy', color: 'white' }])
})

test('active paths use route boundaries rather than substrings and exclude external links', () => {
    assert.equal(
        isNavigationPathActive('/dashboard/management/nodes/123', '/dashboard/management/nodes'),
        true
    )
    assert.equal(
        isNavigationPathActive(
            '/dashboard/management/nodes-metrics',
            '/dashboard/management/nodes'
        ),
        false
    )
    assert.equal(isNavigationPathActive('/dashboard/home', '/dashboard/home', true), false)
    assert.equal(
        isNavigationPathActive('/dashboard/home', 'https://example.com/dashboard/home'),
        false
    )
})

test('flattening preserves exact route order, subgroup labels and globally unique child IDs', () => {
    const icon = () => null
    const section: MenuItem = {
        section: [
            { id: 'before', name: 'Before', href: '/before', icon },
            {
                id: 'group-a',
                name: 'A',
                href: '/a',
                icon,
                dropdownItems: [{ id: 'child', name: 'Child A', href: '/a/child' }]
            },
            { id: 'middle', name: 'Middle', href: '/middle', icon },
            {
                id: 'group-b',
                name: 'B',
                href: '/b',
                icon,
                dropdownItems: [{ id: 'child', name: 'Child B', href: '/b/child' }]
            },
            { id: 'external', name: 'External', href: 'https://example.com', icon, newTab: true }
        ]
    }
    const links = flattenNavigationSection(section)
    assert.deepEqual(
        links.map((link) => link.id),
        ['before', 'group-a/child', 'middle', 'group-b/child', 'external']
    )
    assert.deepEqual(
        links.map((link) => link.href),
        ['/before', '/a/child', '/middle', '/b/child', 'https://example.com']
    )
    assert.deepEqual(
        links.map((link) => link.group),
        [undefined, 'A', undefined, 'B', undefined]
    )
    assert.equal(links[4].newTab, true)
    assert.equal(isNavigationSectionActive('/b/child/editor', section), true)
    assert.equal(isNavigationSectionActive('/b-other', section), false)
    assert.equal(navigationSectionLanding(section), '/before')
    assert.equal(
        navigationSectionLanding({ section: [section.section[4], section.section[1]] }),
        '/a/child'
    )
    assert.equal(navigationSectionLanding({ section: [section.section[4]] }), undefined)
})

test('both actual production menu catalogs retain the same complete destination set', () => {
    const desktop = readMenu(useDesktopMenuSections).flatMap(flattenNavigationSection)
    const mobile = readMenu(useMobileMenuSections).flatMap(flattenNavigationSection)
    const destinations = (links: typeof desktop) =>
        [...new Set(links.map((link) => link.href))].sort()
    assert.deepEqual(destinations(desktop), destinations(mobile))
    for (const required of [
        '/dashboard/home',
        '/dashboard/management/topology',
        '/dashboard/management/nodes',
        '/dashboard/management/users',
        '/dashboard/tools/quick-open',
        '/dashboard/subpage',
        '/dashboard/crm/infra-billing'
    ]) {
        assert(
            desktop.some((link) => link.href === required),
            required
        )
    }
    assert.equal(desktop.filter((link) => link.href.startsWith('/dashboard/templates/')).length, 5)
})

test('navigation arrow keys wrap and reverse in RTL; unrelated keys are not swallowed', () => {
    assert.equal(nextNavigationIndex('ArrowRight', 3, 4, false), 0)
    assert.equal(nextNavigationIndex('ArrowLeft', 0, 4, false), 3)
    assert.equal(nextNavigationIndex('ArrowRight', 0, 4, true), 3)
    assert.equal(nextNavigationIndex('ArrowLeft', 3, 4, true), 0)
    assert.equal(nextNavigationIndex('Home', 2, 4, true), 0)
    assert.equal(nextNavigationIndex('End', 2, 4, true), 3)
    assert.equal(nextNavigationIndex('Enter', 2, 4, false), null)
    assert.equal(nextNavigationIndex('Tab', 2, 4, false), null)
    assert.equal(nextNavigationIndex('Home', 0, 0, false), null)
})

test('actual desktop navigation renders real home links and accessible native dropdown buttons', () => {
    const html = render(DesktopNavigation)
    assert.match(html, /<nav aria-label="Main navigation"/)
    assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/dashboard\/home"/)
    assert.match(html, /<button[^>]*aria-haspopup="(?:menu|true)"[^>]*aria-expanded="false"/)
    assert.doesNotMatch(html, /mantine-/)
    let depth = 0
    for (const match of html.matchAll(/<\/?button\b[^>]*>/g)) {
        depth += match[0].startsWith('</') ? -1 : 1
        assert(depth >= 0 && depth <= 1, 'buttons must not be nested')
    }
    assert.equal(depth, 0)
})

test('actual mobile navigation exposes the active subgroup and complete main links', () => {
    const html = render(MobileNavigation, '/dashboard/management/plugins/example')
    assert.match(html, /<nav aria-label="Main navigation"/)
    assert.match(html, /<button[^>]*aria-expanded="true"/)
    assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/dashboard\/management\/plugins"/)
    assert.match(html, /href="\/dashboard\/management\/topology"/)
    assert.doesNotMatch(html, /mantine-/)
})

test('all protocol and authentication logos are native SVG and keep caller sizing/color', () => {
    for (const Logo of [XrayLogo, MihomoLogo, SingboxLogo, StashLogo, YandexLogo, PocketidLogo]) {
        const html = renderToStaticMarkup(
            createElement(Logo, { size: 24, color: 'rebeccapurple', 'aria-label': 'Fixture' })
        )
        assert.match(html, /^<svg\b/)
        assert.match(html, /width:24px;height:24px/)
        assert.match(html, /color="rebeccapurple"/)
        assert.match(html, /aria-label="Fixture"/)
        assert.doesNotMatch(html, /mantine-/)
    }
})

function loadHook(name: string, relative: string, scope: Record<string, unknown>) {
    const code = readFileSync(new URL(relative, import.meta.url), 'utf8')
    const file = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true)
    const fn = file.statements.find(
        (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    assert(fn)
    const js = ts.transpileModule(`return ${fn.getText(file).replace(/^export\s+/, '')}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText
    return new Function(...Object.keys(scope), js)(...Object.values(scope))
}

test('native media subscriptions use the actual query, SSR snapshot and paired cleanup', () => {
    let subscription!: (listener: () => void) => () => void
    let snapshot!: () => boolean
    let serverSnapshot!: () => boolean
    let listener: (() => void) | undefined
    let matches = false
    const media = {
        get matches() {
            return matches
        },
        addEventListener: (_: string, next: () => void) => {
            listener = next
        },
        removeEventListener: (_: string, next: () => void) => {
            assert.equal(next, listener)
            listener = undefined
        }
    }
    const hook = loadHook('useMediaQuery', '../../../../shared/hooks/use-media-query.ts', {
        useCallback: (callback: unknown) => callback,
        useSyncExternalStore: (
            subscribe: typeof subscription,
            get: typeof snapshot,
            server: typeof serverSnapshot
        ) => {
            subscription = subscribe
            snapshot = get
            serverSnapshot = server
            return get()
        },
        window: {
            matchMedia: (query: string) => {
                assert.equal(query, '(min-width: 2048px)')
                return media
            }
        }
    })
    assert.equal(hook('(min-width: 2048px)', true), false)
    assert.equal(serverSnapshot(), true)
    let notifications = 0
    const cleanup = subscription(() => notifications++)
    matches = true
    listener?.()
    assert.equal(snapshot(), true)
    assert.equal(notifications, 1)
    cleanup()
    assert.equal(listener, undefined)
})

test('hover close cannot close a newer section and unmount cancels its timer', () => {
    let current: string | null = null
    const timers = new Map<number, () => void>()
    let id = 0
    let cleanup!: () => void
    const hook = loadHook('useNavigationMenu', './navbar/use-navigation-menu.ts', {
        useState: () => [
            current,
            (update: (value: string | null) => string | null) => {
                current = update(current)
            }
        ],
        useRef: () => ({ current: undefined }),
        useEffect: (effect: () => () => void) => {
            cleanup = effect()
        },
        setTimeout: (fn: () => void) => {
            timers.set(++id, fn)
            return id
        },
        clearTimeout: (timerId: number) => timers.delete(timerId)
    })
    const menu = hook()
    menu.setOpen('nodes', true)
    menu.scheduleClose('nodes')
    const stale = [...timers.values()][0]
    menu.setOpen('tools', true)
    assert.equal(timers.size, 0)
    stale()
    assert.equal(current, 'tools')
    menu.scheduleClose('tools')
    menu.cancelClose()
    assert.equal(timers.size, 0)
    menu.scheduleClose('tools')
    cleanup()
    assert.equal(timers.size, 0)
})

test('actual compact and desktop sidebar shells retain main outlet, branding and collapse semantics', async () => {
    Object.assign(globalThis, {
        __DOMAIN_BACKEND__: 'https://panel.example',
        __NODE_ENV__: 'production',
        __DOMAIN_OVERRIDE__: '0',
        window: { location: { origin: 'https://panel.example' } }
    })
    const { CompactLayout } = await import('./layout-variants/compact.layout')
    const { SidebarShellLayout } = await import('./layout-variants/sidebar-shell.layout')
    const { authQueryKeys } = await import('../../../../shared/api/hooks/auth/auth.query.hooks')
    Reflect.deleteProperty(globalThis, 'window')
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    client.setQueryData(authQueryKeys.getAuthStatus.queryKey, {
        branding: { title: '{cyan}Fixture Panel' }
    })
    const controls = createElement('button', {}, 'Fixture action')
    const cases = [
        {
            element: createElement(CompactLayout, {
                headerControls: controls,
                isHiResDesktop: false
            }),
            layout: 'compact',
            sidebar: false
        },
        {
            element: createElement(CompactLayout, {
                headerControls: controls,
                isHiResDesktop: true
            }),
            layout: 'compact-wide',
            sidebar: false
        },
        {
            element: createElement(SidebarShellLayout, {
                headerControls: controls,
                mode: 'desktop',
                opened: true,
                onOpenChange: () => {}
            }),
            layout: 'desktop',
            sidebar: true
        },
        {
            element: createElement(SidebarShellLayout, {
                headerControls: controls,
                mode: 'desktop',
                opened: false,
                onOpenChange: () => {}
            }),
            layout: 'desktop',
            sidebar: false
        },
        {
            element: createElement(SidebarShellLayout, {
                headerControls: controls,
                mode: 'mobile',
                opened: false,
                onOpenChange: () => {}
            }),
            layout: 'mobile',
            sidebar: false
        }
    ]
    try {
        for (const entry of cases) {
            const router = createMemoryRouter(
                [
                    {
                        path: '/dashboard',
                        element: entry.element,
                        children: [
                            { path: 'home', element: createElement('p', {}, 'Fixture outlet') }
                        ]
                    }
                ],
                { initialEntries: ['/dashboard/home'] }
            )
            try {
                const html = renderToStaticMarkup(
                    createElement(
                        I18nextProvider,
                        { i18n },
                        createElement(
                            QueryClientProvider,
                            { client },
                            createElement(RouterProvider, { router })
                        )
                    )
                )
                assert.match(html, new RegExp(`data-layout="${entry.layout}"`))
                assert.match(html, /<main[^>]*id="dashboard-main"/)
                assert.match(html, /Fixture outlet/)
                assert.match(html, /Fixture action/)
                assert.match(html, /href="#dashboard-main"/)
                assert.equal(html.includes('<aside'), entry.sidebar)
                assert.doesNotMatch(html, /mantine-/)
                if (entry.sidebar || entry.layout.startsWith('compact')) {
                    assert.match(html.replace(/<[^>]+>/g, ''), /Fixture Panel/)
                    assert.match(html, /aria-label="Home"/)
                }
            } finally {
                router.dispose()
            }
        }
    } finally {
        client.clear()
    }
})
