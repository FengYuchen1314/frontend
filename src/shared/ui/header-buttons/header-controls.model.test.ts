import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { GithubControl } from './GithubControl.tsx'
import {
    createDialogOperationScope,
    logoutFromHeader,
    refreshFromHeader,
    safeExternalUrl,
    versionPresentation
} from './header-controls.model.ts'

test('dialog close aborts immediately before exit unmount, and rapid reopen cannot revive an old operation', () => {
    const scope = createDialogOperationScope()
    const first = scope.open()
    assert.equal(first.signal.aborted, false)
    scope.close()
    assert.equal(first.signal.aborted, true)
    const second = scope.open()
    assert.equal(second.signal.aborted, false)
    assert.equal(second.generation, first.generation + 1)
    assert.equal(first.signal.aborted, true)
    const third = scope.open()
    assert.equal(second.signal.aborted, true)
    assert.equal(third.signal.aborted, false)
    scope.close()
    assert.equal(third.signal.aborted, true)
})
import { HeaderControl, HeaderLink } from './HeaderControl.tsx'

test('version controls handle development and malformed metadata without crashing', () => {
    assert.deepEqual(versionPresentation('1.0.0', '1.0.1', 'main'), {
        isDev: false,
        isNewVersionAvailable: true
    })
    assert.deepEqual(versionPresentation('1.0.0-dev.2', '1.0.0', 'xboard-dev'), {
        isDev: true,
        isNewVersionAvailable: true
    })
    for (const value of [undefined, 'unknown', 'vNext', '', '0.9.9'])
        assert.equal(versionPresentation('1.0.0', value, 'main').isNewVersionAvailable, false)
    assert.equal(versionPresentation('unknown', '2.0.0', 'main').isNewVersionAvailable, false)
})

test('external links accept only absolute web URLs', () => {
    assert.equal(safeExternalUrl('https://github.com/remnawave'), 'https://github.com/remnawave')
    for (const url of [
        undefined,
        '',
        '/logout',
        'javascript:alert(1)',
        'data:text/html,fixture',
        'file:///fixture',
        '//example.com'
    ])
        assert.equal(safeExternalUrl(url), undefined)
    const markup = renderToStaticMarkup(
        createElement(HeaderLink, { href: 'javascript:alert(1)' }, 'Unsafe fixture')
    )
    assert.doesNotMatch(markup, /href=/)
    assert.match(markup, /aria-disabled="true"/)
})

test('logout uses the unified cleanup boundary before routing, refresh preserves cleanup order', () => {
    const actions: string[] = []
    logoutFromHeader(
        () => actions.push('logout'),
        () => actions.push('login')
    )
    refreshFromHeader(
        () => actions.push('reset'),
        () => actions.push('clear'),
        () => actions.push('reload')
    )
    assert.deepEqual(actions, ['logout', 'login', 'reset', 'clear', 'reload'])
})

test('native header controls render a real disabled button and accessible external GitHub link including zero stars', () => {
    const button = renderToStaticMarkup(
        createElement(HeaderControl, { isDisabled: true, 'aria-label': 'Fixture action' }, 'Action')
    )
    assert.match(button, /<button/)
    assert.match(button, /disabled=""/)
    const link = renderToStaticMarkup(
        createElement(GithubControl, { link: 'https://github.com/remnawave', stars: 0 })
    )
    assert.match(link, /href="https:\/\/github.com\/remnawave"/)
    assert.match(link, /rel="noopener noreferrer"/)
    assert.match(link, />0<\/span>/)
    const loading = renderToStaticMarkup(
        createElement(GithubControl, { link: 'https://github.com/remnawave', isLoading: true })
    )
    assert.match(loading, /Loading GitHub stars/)
})
