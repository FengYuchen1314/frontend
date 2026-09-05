import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { inferMieruMappingMode, resolveMieruPortMapping } from './mieru-port-mapping.ts'

const listener = (uuid: string, port: number, transport = 'TCP') => ({
    uuid,
    port,
    type: 'mieru',
    rawInbound: { protocol: 'mieru', settings: { transport } }
})
const inbounds = [listener('ix-a', 24443), listener('ix-b', 34443)]

test('Mieru mapping derives legacy modes without changing persisted entry ports', () => {
    assert.equal(inferMieruMappingMode(24443, 24443), 'ONE_TO_ONE')
    assert.equal(inferMieruMappingMode(34443, 24443), 'MANUAL')
    assert.equal(inferMieruMappingMode(undefined, 24443), 'ONE_TO_ONE')
})

test('one-to-one resolves the entry port while manual IX selection preserves it', () => {
    const before = structuredClone(inbounds)
    assert.deepEqual(resolveMieruPortMapping(inbounds, 'ONE_TO_ONE', 34443, 24443), {
        valid: true,
        inboundUuid: 'ix-b',
        entryPort: 34443,
        ixPort: 34443
    })
    assert.deepEqual(resolveMieruPortMapping(inbounds, 'MANUAL', 18080, 24443), {
        valid: true,
        inboundUuid: 'ix-a',
        entryPort: 18080,
        ixPort: 24443
    })
    assert.deepEqual(resolveMieruPortMapping(inbounds, 'MANUAL', 18080, 34443), {
        valid: true,
        inboundUuid: 'ix-b',
        entryPort: 18080,
        ixPort: 34443
    })
    assert.deepEqual(inbounds, before, 'Do not mutate shared listener bindings')
})

test('incomplete, nonexistent, ambiguous and unsupported listener selections fail closed', () => {
    for (const value of ['', undefined, 0, -1, 65536, 1.5]) {
        assert.equal(resolveMieruPortMapping(inbounds, 'MANUAL', value, 24443).valid, false)
    }
    for (const value of ['', undefined, 443, 1024, 65536, 24443.5]) {
        assert.equal(resolveMieruPortMapping(inbounds, 'MANUAL', 18080, value).valid, false)
    }
    assert.deepEqual(resolveMieruPortMapping(inbounds, 'MANUAL', 18080, 44443), {
        valid: false,
        error: 'not-configured'
    })
    assert.equal(
        resolveMieruPortMapping([listener('udp', 24443, 'UDP')], 'MANUAL', 18080, 24443).valid,
        false
    )
    assert.equal(
        resolveMieruPortMapping([...inbounds, listener('duplicate', 24443)], 'MANUAL', 18080, 24443)
            .valid,
        false
    )
})

test('Host form exposes both mapping modes, manual IX input and guarded submission', () => {
    const page = readFileSync(new URL('./base-host-form.tsx', import.meta.url), 'utf8')
    assert.match(page, /Radio\.Group/)
    assert.match(page, /value="ONE_TO_ONE"/)
    assert.match(page, /value="MANUAL"/)
    assert.match(page, /label=\{t\('base-host-form\.mieru-ix-port'\)\}/)
    assert.match(page, /onSubmit=\{handleMappingSubmit\}/)
    assert.match(page, /mappingError/)
    assert.match(page, /!isBulkEdit \? \{ port: selected\?\.port \?\? 0 \} : \{\}/)
    assert.match(page, /currentInbound\?\.configProfileInboundUuid === inboundUuid/)
    // Default ports may only change on an explicit inbound selection, not on initialization.
    for (const relative of [
        '../../../../_modals/hosts/create-host-drawer/create-host.modal.tsx',
        '../../../../_modals/hosts/edit-host-modal/edit-host.modal.content.tsx'
    ]) {
        const modal = readFileSync(new URL(relative, import.meta.url), 'utf8')
        assert(!/form\.watch\('inbound\.configProfileInboundUuid'/.test(modal))
    }
})

test('mapping controls and safety messages have translations in every supported locale', () => {
    const required = [
        'mieru-mapping-mode',
        'mieru-one-to-one',
        'mieru-manual-ix',
        'mieru-ix-port',
        'mieru-forwarding-required',
        'mieru-listener-help',
        'mieru-edit-listeners',
        'mieru-mapping-error-entry-port',
        'mieru-mapping-error-ix-port',
        'mieru-mapping-error-not-configured',
        'mieru-mapping-error-ambiguous'
    ]
    for (const locale of ['en', 'zh', 'ru', 'fa']) {
        const messages = JSON.parse(
            readFileSync(
                new URL(
                    `../../../../../../public/locales/${locale}/remnawave.json`,
                    import.meta.url
                ),
                'utf8'
            )
        )['base-host-form']
        for (const key of required) assert(messages[key]?.length > 0, `${locale} ${key}`)
    }
})
