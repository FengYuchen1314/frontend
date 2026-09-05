import { Link } from '@heroui/react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { HeaderLink } from '../../../../shared/ui/header-buttons/HeaderControl'
import { DashboardRouting } from './dashboard-routing'

function renderLinks(href: string, header = false) {
    const router = createMemoryRouter(
        [
            {
                path: '/dashboard/*',
                element: createElement(
                    DashboardRouting,
                    null,
                    header
                        ? createElement(HeaderLink, { href }, 'Fixture external')
                        : createElement(Link, { href }, 'Fixture link')
                )
            }
        ],
        { basename: '/panel', initialEntries: ['/panel/dashboard/management/nodes'] }
    )
    try {
        return renderToStaticMarkup(createElement(RouterProvider, { router }))
    } finally {
        router.dispose()
    }
}

for (const url of [
    'https://github.com/remnawave/panel',
    'https://t.me/remnawave',
    'https://docs.rw/docs/donate',
    'http://example.com/path?q=1#guide'
]) {
    test(`actual HeaderLink retains external URL under nested Aria + React Router: ${url}`, () => {
        const html = renderLinks(url, true)
        assert(html.includes(`href="${url}"`), html)
        assert.match(html, /target="_blank"/)
        assert.match(html, /rel="noopener noreferrer"/)
        assert.doesNotMatch(html, /href="\/panel\/dashboard\/https?:/)
    })
}

test('internal links preserve the React Router basename and route-relative semantics', () => {
    assert.match(renderLinks('/dashboard/home'), /href="\/panel\/dashboard\/home"/)
    assert.match(renderLinks('stats'), /href="\/panel\/dashboard\/management\/nodes\/stats"/)
})

test('Aria protocol-relative and mail links are not rewritten as dashboard paths', () => {
    assert.match(renderLinks('//example.com/help'), /href="\/\/example.com\/help"/)
    assert.match(renderLinks('mailto:help@example.com'), /href="mailto:help@example.com"/)
})
