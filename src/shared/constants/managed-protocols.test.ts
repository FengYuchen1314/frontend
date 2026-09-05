import { NODE_CREATION_MODES, SERVER_TYPES } from '@remnawave/backend-contract'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    createManagedProtocolConfig,
    getManagedAnyTlsPresetError,
    getManagedProtocolCreationPreset,
    getManagedProtocolCreationPresetsForServerType,
    isManagedProtocolCreationInboundForServerType,
    shouldRestrictNodeCreationToManagedProtocols
} from './managed-protocols.ts'

describe('managed protocol presets', () => {
    it('allows public direct servers to use VLESS, encrypted AnyTLS or explicitly warned SOCKS5', () => {
        assert.deepEqual(
            getManagedProtocolCreationPresetsForServerType(SERVER_TYPES.PUBLIC_DIRECT).map(
                ({ id }) => id
            ),
            [
                'vless-reality-vision',
                'vless-xhttp-reality-xmux',
                'socks5-password',
                'anytls-shadowtls'
            ]
        )
    })

    it('creates strict encrypted AnyTLS extensions without identities or raw Xray AnyTLS inbounds', () => {
        const options = {
            wrapperPort: 14443,
            innerPort: 16001,
            camouflage: { serverName: 'fixture.example.com', address: '192.0.2.50', port: 443 }
        }
        assert.equal(getManagedAnyTlsPresetError(options), null)
        const config = createManagedProtocolConfig('anytls-shadowtls', options) as {
            inbounds: unknown[]
            xboardAnyTls: { version: number; listeners: Array<typeof options & { tag: string }> }
        }
        assert.deepEqual(config.inbounds, [])
        assert.equal(config.xboardAnyTls.version, 1)
        assert.equal(config.xboardAnyTls.listeners.length, 1)
        const listener = config.xboardAnyTls.listeners[0]
        assert.match(listener.tag, /^ANYTLS_SHADOWTLS_[a-f0-9]{16}$/)
        assert.deepEqual(listener, { ...options, tag: listener.tag })
        const inbound = {
            tag: listener.tag,
            type: 'anytls',
            network: 'tcp',
            security: 'tls',
            port: 443,
            rawInbound: { tag: listener.tag, protocol: 'anytls', settings: listener }
        } as never
        assert.equal(getManagedProtocolCreationPreset(inbound)?.id, 'anytls-shadowtls')
        assert.equal(
            isManagedProtocolCreationInboundForServerType(inbound, SERVER_TYPES.PUBLIC_DIRECT),
            true
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(inbound, SERVER_TYPES.LEASED_LINE),
            false
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(inbound, SERVER_TYPES.BROADBAND_LANDING),
            false
        )
        assert(getManagedAnyTlsPresetError({ ...options, innerPort: options.wrapperPort }))
        assert(getManagedAnyTlsPresetError({ ...options, wrapperPort: 443 }))
        assert(
            getManagedAnyTlsPresetError({
                ...options,
                camouflage: { ...options.camouflage, address: '' }
            })
        )
        assert.throws(() => createManagedProtocolConfig('anytls-shadowtls'))
        for (const patch of [{ users: [] }, { tls: { insecure: true } }, { tag: 'OTHER' }]) {
            assert.equal(
                getManagedProtocolCreationPreset({
                    ...(inbound as object),
                    rawInbound: {
                        tag: listener.tag,
                        protocol: 'anytls',
                        settings: { ...listener, ...patch }
                    }
                } as never),
                null
            )
        }
    })

    it('limits home broadband landing servers to SOCKS5', () => {
        assert.deepEqual(
            getManagedProtocolCreationPresetsForServerType(SERVER_TYPES.BROADBAND_LANDING).map(
                ({ id }) => id
            ),
            ['socks5-password']
        )
    })

    it('limits leased lines to Mieru over TCP', () => {
        assert.deepEqual(
            getManagedProtocolCreationPresetsForServerType(SERVER_TYPES.LEASED_LINE).map(
                ({ id }) => id
            ),
            ['mieru-tcp']
        )
    })

    it('generates the managed Mieru profile envelope expected by the backend', () => {
        const config = createManagedProtocolConfig('mieru-tcp') as {
            runtime: string
            listeners: Array<{ tag: string; port: number; protocol: string }>
            mtu: number
            multiplexing: string
            handshakeMode: string
            userHintIsMandatory: boolean
            metricsLoggingInterval: string
            loggingLevel: string
        }

        assert.equal(config.runtime, 'MIERU')
        assert(
            config.listeners.every(({ port }) => port >= 1025 && port <= 65535),
            'Generated Mieru listeners must satisfy both editor and backend unprivileged-port validation'
        )
        assert.match(config.listeners[0]?.tag ?? '', /^MIERU_TCP_[a-f0-9]{16}$/)
        assert.deepEqual(config.listeners[0], {
            tag: config.listeners[0]?.tag,
            port: 24443,
            protocol: 'TCP'
        })
        assert.equal(config.mtu, 1400)
        assert.equal(config.multiplexing, 'MULTIPLEXING_LOW')
        assert.equal(config.handshakeMode, 'HANDSHAKE_STANDARD')
        assert.equal(config.userHintIsMandatory, true)
        assert.equal(config.metricsLoggingInterval, '1m')
        assert.equal(config.loggingLevel, 'INFO')
    })

    it('recognizes only TCP Mieru inbounds as managed leased-line inbounds', () => {
        const createInbound = (transport: string, network?: string) =>
            ({
                type: 'mieru',
                network,
                rawInbound: {
                    protocol: 'mieru',
                    settings: { transport }
                }
            }) as never

        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('TCP'),
                SERVER_TYPES.LEASED_LINE
            ),
            true
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('UDP'),
                SERVER_TYPES.LEASED_LINE
            ),
            false
        )
        assert.equal(
            isManagedProtocolCreationInboundForServerType(
                createInbound('TCP'),
                SERVER_TYPES.PUBLIC_DIRECT
            ),
            false
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
