import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
    beginNavigationProgress,
    getNavigationProgressSnapshot,
    getServerNavigationProgressSnapshot,
    setRouteNavigationPending,
    subscribeNavigationProgress
} from './navigation-progress.ts'
import { formatPageTitle } from './page-title.ts'

test('concurrent progress owners release only their own idempotent token', () => {
    const first = beginNavigationProgress()
    const second = beginNavigationProgress()
    try {
        assert.equal(getNavigationProgressSnapshot(), true)
        first()
        first()
        assert.equal(getNavigationProgressSnapshot(), true)
        second()
        assert.equal(getNavigationProgressSnapshot(), false)
    } finally {
        first()
        second()
    }
})

test('idle/error/quick-return route completion does not clear a pending loading task', () => {
    setRouteNavigationPending(true)
    const finish = beginNavigationProgress()
    try {
        setRouteNavigationPending(false)
        assert.equal(getNavigationProgressSnapshot(), true)
        setRouteNavigationPending(true)
        finish()
        assert.equal(getNavigationProgressSnapshot(), true)
        setRouteNavigationPending(false)
        assert.equal(getNavigationProgressSnapshot(), false)
    } finally {
        finish()
        setRouteNavigationPending(false)
    }
})

test('subscriptions emit only observable transitions and unsubscribe without affecting owners', () => {
    const changes: boolean[] = []
    const unsubscribe = subscribeNavigationProgress(() =>
        changes.push(getNavigationProgressSnapshot())
    )
    const finish = beginNavigationProgress()
    try {
        setRouteNavigationPending(true)
        finish()
        assert.deepEqual(changes, [true])
        setRouteNavigationPending(false)
        assert.deepEqual(changes, [true, false])
        unsubscribe()
        setRouteNavigationPending(true)
        assert.deepEqual(changes, [true, false])
        assert.equal(getServerNavigationProgressSnapshot(), false)
    } finally {
        unsubscribe()
        finish()
        setRouteNavigationPending(false)
    }
})

test('page title retains branding text while removing color annotations', () => {
    assert.equal(
        formatPageTitle('Nodes', '{ff0000}My {blue}Panel', 'Remnawave'),
        'Nodes | My Panel'
    )
    assert.equal(formatPageTitle('Login', undefined, 'Remnawave'), 'Login | Remnawave')
    assert.equal(formatPageTitle('Login', null, 'Remnawave'), 'Login | Remnawave')
    assert.equal(formatPageTitle('节点', '', 'Remnawave'), '节点 | Remnawave')
})

test('Page renders native div attributes, children and the branded document title', async () => {
    // Initialize Motion in SSR mode before the API-only window-origin fixture.
    await import('motion/react')
    Object.assign(globalThis, {
        __DOMAIN_BACKEND__: 'https://panel.example',
        __NODE_ENV__: 'production',
        __DOMAIN_OVERRIDE__: '0',
        window: { location: { origin: 'https://panel.example' } }
    })
    const { Page } = await import('./page.tsx')
    const { authQueryKeys } = await import('../../api/hooks/auth/auth.query.hooks.ts')
    Reflect.deleteProperty(globalThis, 'window')
    const client = new QueryClient()
    client.setQueryData(authQueryKeys.getAuthStatus.queryKey, {
        branding: { title: '{cyan}Fixture Panel' }
    })
    try {
        const pageProps = {
            title: 'Nodes',
            id: 'fixture-page',
            className: 'native-page',
            'aria-label': 'Node management',
            children: createElement('p', {}, 'Fixture children')
        }
        const markup = renderToStaticMarkup(
            createElement(QueryClientProvider, { client }, createElement(Page, pageProps))
        )
        assert.match(markup, /<title>Nodes \| Fixture Panel<\/title>/)
        assert.match(
            markup,
            /<div id="fixture-page" class="native-page" aria-label="Node management">/
        )
        assert.match(markup, /<p>Fixture children<\/p>/)
    } finally {
        client.clear()
    }
})
