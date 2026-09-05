import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { prepareManagedXrayValidation } from './managed-xray-validation.ts'

const extension = {
    version: 1,
    listeners: [
        {
            tag: 'FIXTURE',
            wrapperPort: 14443,
            innerPort: 16001,
            camouflage: { serverName: 'fixture.example.com', address: '192.0.2.50', port: 443 }
        }
    ]
}

test('native Xray validation receives no encrypted extension and the saved input is unchanged', () => {
    const input = {
        inbounds: [],
        outbounds: [{ tag: 'DIRECT', protocol: 'freedom' }],
        xboardAnyTls: extension
    }
    const original = structuredClone(input)
    const prepared = prepareManagedXrayValidation(input)
    assert.equal(prepared.hasAnyTls, true)
    assert.deepEqual(prepared.nativeConfig, {
        inbounds: [],
        outbounds: [{ tag: 'DIRECT', protocol: 'freedom' }]
    })
    assert.deepEqual(input, original)
    assert.equal(prepareManagedXrayValidation({ inbounds: [] }).hasAnyTls, false)
})

test('invalid or insecure encrypted extensions never pass native-only validation', () => {
    for (const config of [
        null,
        [],
        { xboardAnyTls: null },
        { xboardAnyTls: { ...extension, insecure: true } }
    ]) {
        assert.throws(() => prepareManagedXrayValidation(config))
    }
    for (const patch of [
        { tls: { insecure: true } },
        { users: [] },
        { innerPort: 14443 },
        { wrapperPort: 443 }
    ]) {
        assert.throws(() =>
            prepareManagedXrayValidation({
                inbounds: [],
                xboardAnyTls: { version: 1, listeners: [{ ...extension.listeners[0], ...patch }] }
            })
        )
    }
})

test('editor wiring validates the extension before snippets and protects it from root snippets', () => {
    const source = readFileSync(
        new URL(
            '../../features/dashboard/config-profiles/config-validation/config-validation.feature.tsx',
            import.meta.url
        ),
        'utf8'
    )
    assert(
        source.indexOf('prepareManagedXrayValidation(clonedCurrentValue)') <
            source.indexOf('replaceSnippetsInRoot(clonedCurrentValue, snippetsMap)')
    )
    assert.match(source, /PROTECTED_ROOT_KEYS = new Set\([^)]*'xboardAnyTls'/)
    assert.match(source, /clonedCurrentValue = prepared.nativeConfig/)
})
