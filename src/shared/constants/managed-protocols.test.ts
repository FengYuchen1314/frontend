import { NODE_CREATION_MODES, SERVER_TYPES } from '@remnawave/backend-contract'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    createManagedProtocolConfig,
    getManagedProtocolCreationPresetsForServerType,
    isManagedProtocolCreationInboundForServerType,
    shouldRestrictNodeCreationToManagedProtocols
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

    it('generates a TCP-only password-authenticated SOCKS5 inbound without embedded users', () => {
        const config = createManagedProtocolConfig('socks5-password') as {
            inbounds: Array<{
                port: number
                protocol: string
                settings: { auth: string; udp: boolean; users: unknown[] }
                sniffing: { destOverride: string[]; enabled: boolean }
            }>
        }

        assert.equal(config.inbounds.length, 1)
        assert.equal(config.inbounds[0]?.protocol, 'socks')
        assert.equal(config.inbounds[0]?.port, 1080)
        assert.deepEqual(config.inbounds[0]?.settings, {
            auth: 'password',
            users: [],
            udp: false
        })
        assert.deepEqual(config.inbounds[0]?.sniffing.destOverride, ['http', 'tls'])
    })

    it('only treats explicitly TCP-only password SOCKS5 as managed on supported server types', () => {
        const createInbound = (auth: string, udp?: boolean) =>
            ({
                type: 'socks',
                rawInbound: {
                    protocol: 'socks',
                    settings: { auth, ...(udp === undefined ? {} : { udp }) }
                }
            }) as never

        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('password', false),
                SERVER_TYPES.BROADBAND_LANDING
            ),
            true
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('password', true),
                SERVER_TYPES.BROADBAND_LANDING
            ),
            false
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('password', undefined),
                SERVER_TYPES.BROADBAND_LANDING
            ),
            false
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('noauth', false),
                SERVER_TYPES.BROADBAND_LANDING
            ),
            false
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('password', false),
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

    it('restricts only managed creation while external import can select existing inbounds', () => {
        assert.equal(
            shouldRestrictNodeCreationToManagedProtocols(NODE_CREATION_MODES.MANAGED),
            true
        )
        assert.equal(
            shouldRestrictNodeCreationToManagedProtocols(NODE_CREATION_MODES.EXTERNAL_IMPORT),
            false
        )
    })
})
