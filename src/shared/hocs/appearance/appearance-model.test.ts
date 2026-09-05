import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseThemePreference, resolveTheme } from './appearance-model.ts'

test('native appearance preserves saved light/dark and legacy system preference', () => {
    assert.equal(parseThemePreference('light'), 'light')
    assert.equal(parseThemePreference('dark'), 'dark')
    assert.equal(parseThemePreference('auto'), 'system')
    assert.equal(parseThemePreference('system'), 'system')
    assert.equal(parseThemePreference(null), 'dark')
    assert.equal(parseThemePreference('malformed'), 'dark')
})

test('only a system preference responds to system appearance changes', () => {
    assert.equal(resolveTheme('light', true), 'light')
    assert.equal(resolveTheme('dark', false), 'dark')
    assert.equal(resolveTheme('system', true), 'dark')
    assert.equal(resolveTheme('system', false), 'light')
})
