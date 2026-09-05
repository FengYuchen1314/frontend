import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

import { isMieruProfileConfig } from './config-profile-runtime.ts'

test('Mieru editor selection works before effects, including cached profile responses', () => {
    assert.equal(isMieruProfileConfig({ runtime: 'MIERU', listeners: [] }), true)
    for (const config of [
        null,
        undefined,
        [],
        'MIERU',
        {},
        { runtime: 'XRAY' },
        { runtime: 'mieru' }
    ]) {
        assert.equal(isMieruProfileConfig(config), false)
    }
})

test('the profile query connector gates the Xray loader after resolving the runtime', () => {
    // Structural regression guard, not a substitute for blocked-WASM browser acceptance.
    const source = readFileSync(
        new URL(
            '../../pages/dashboard/config-profiles/connectors/config-profile-by-uuid.page.connector.tsx',
            import.meta.url
        ),
        'utf8'
    )
    const file = ts.createSourceFile(
        'connector.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    const connector = file.statements.find(
        (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === 'ConfigProfileByUuidPageConnector'
    )!
    const text = connector.getText(file)
    assert.match(text, /isMieruProfileConfig\(configProfile\.config\)/)
    assert(!/initWasm|window\.Go|fetchWithProgress/.test(text))
    assert(text.indexOf('isMieruProfileConfig(') < text.indexOf('<XrayConfigProfileEditor'))
    assert.match(text, /<XrayConfigProfileEditor\s+key=\{configProfile\.uuid\}/)
    assert.match(text, /<ConfigProfileByUuidPageComponent\s+key=\{configProfile\.uuid\}/)
})
