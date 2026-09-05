import { createInstance } from 'i18next'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import { LoadingScreen } from './loading-screen.tsx'

const i18n = createInstance()
await i18n.init({
    lng: 'en',
    resources: { en: { translation: { common: { message: { loading: 'Loading' } } } } }
})

function render(props: Parameters<typeof LoadingScreen>[0]) {
    return renderToStaticMarkup(
        createElement(I18nextProvider, { i18n }, createElement(LoadingScreen, props))
    )
}

test('unknown loading is an accessible native HeroUI indeterminate progress bar', () => {
    const markup = render({})
    assert.match(markup, /role="progressbar"/)
    assert.match(markup, /aria-label="Loading"/)
    assert.doesNotMatch(markup, /aria-valuenow=/)
    assert.match(markup, /100dvh/)
})

test('real download progress preserves 0 and 42 percent with caller height and text', () => {
    for (const value of [0, 42]) {
        const markup = render({ value, height: '60vh', text: 'Downloading module' })
        assert.match(markup, new RegExp(`aria-valuenow="${value}"`))
        assert.match(markup, /aria-label="Downloading module"/)
        assert.match(markup, /60vh/)
    }
})

test('invalid progress remains indeterminate and out-of-range values are clamped', () => {
    for (const value of [NaN, Infinity]) assert.doesNotMatch(render({ value }), /aria-valuenow=/)
    assert.match(render({ value: -20 }), /aria-valuenow="0"/)
    assert.match(render({ value: 120 }), /aria-valuenow="100"/)
})
