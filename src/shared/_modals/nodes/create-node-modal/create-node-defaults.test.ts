import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const modal = readFileSync(new URL('./create-node.modal.tsx', import.meta.url), 'utf8')

test('node creation provides port and server type defaults in the initial form values', () => {
    const initialValues = modal.match(/initialValues:\s*\{([^}]+)\}/)?.[1]
    assert(initialValues, 'Initial form values must be explicit')
    assert.match(initialValues, /\bcreationMode\b/)
    assert.match(initialValues, /\bport:\s*2222\b/)
    assert.match(initialValues, /\bserverType:\s*SERVER_TYPES\.PUBLIC_DIRECT\b/)
})

test('node creation does not reset defaults on the unstable form object dependency', () => {
    assert.doesNotMatch(
        modal,
        /useEffect\(\(\)\s*=>\s*\{[\s\S]*?form\.setValues\([\s\S]*?\},\s*\[form\]\)/
    )
})
