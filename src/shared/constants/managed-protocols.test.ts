import { SERVER_TYPES } from '@remnawave/backend-contract'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    createManagedProtocolConfig,
    getManagedProtocolCreationPresetsForServerType,
    isManagedProtocolCreationInboundForServerType
} from './managed-protocols.ts'

describe('managed protocol presets', () => {
    it('allows public direct servers to use VLESS or explicitly warned SOCKS5', () => {
        assert.deepEqual(
            getManagedProtocolCreationPresetsForServerType(SERVER_TYPES.PUBLIC_DIRECT).map(
                ({ id }) => id
            ),
            ['vless-reality-vision', 'vless-xhttp-reality-xmux', 'socks5-password']
        )
    })

    it('limits home broadband landing servers to SOCKS5', () => {
        assert.deepEqual(
            getManagedProtocolCreationPresetsForServerType(SERVER_TYPES.BROADBAND_LANDING).map(
                ({ id }) => id
            ),
            ['socks5-password']
        )
    })

    it('does not expose a managed protocol for leased lines yet', () => {
        assert.deepEqual(
            getManagedProtocolCreationPresetsForServerType(SERVER_TYPES.LEASED_LINE),
            []
        )
    })

    it('generates a password-authenticated SOCKS5 inbound without embedded users', () => {
        const config = createManagedProtocolConfig('socks5-password') as {
            inbounds: Array<{
                port: number
                protocol: string
                settings: { auth: string; udp: boolean; users: unknown[] }
            }>
        }

        assert.equal(config.inbounds.length, 1)
        assert.equal(config.inbounds[0]?.protocol, 'socks')
        assert.equal(config.inbounds[0]?.port, 1080)
        assert.deepEqual(config.inbounds[0]?.settings, {
            auth: 'password',
            users: [],
            udp: true
        })
    })

    it('only treats password-authenticated SOCKS5 as managed on supported server types', () => {
        const createInbound = (auth: string) =>
            ({
                type: 'socks',
                rawInbound: { protocol: 'socks', settings: { auth } }
            }) as never

        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('password'),
                SERVER_TYPES.BROADBAND_LANDING
            ),
            true
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('noauth'),
                SERVER_TYPES.BROADBAND_LANDING
            ),
            false
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('password'),
                SERVER_TYPES.PUBLIC_DIRECT
            ),
            true
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                { type: 'socks', rawInbound: { settings: { auth: 'password' } } } as never,
                SERVER_TYPES.PUBLIC_DIRECT
            ),
            false
        )
    })
})
