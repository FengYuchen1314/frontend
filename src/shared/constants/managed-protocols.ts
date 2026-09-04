import type { GetConfigProfilesCommand } from '@remnawave/backend-contract'

import { encodeURLSafe } from '@stablelib/base64'
import { generateKeyPair } from '@stablelib/x25519'

type ConfigProfileInbound =
    GetConfigProfilesCommand.Response['response']['configProfiles'][number]['inbounds'][number]

export const MANAGED_PROTOCOL_CREATION_WHITELIST = [
    {
        id: 'vless-reality-vision',
        label: 'VLESS + REALITY + Vision',
        badgeLabel: 'VLESS · REALITY · Vision'
    },
    {
        id: 'vless-xhttp-reality-xmux',
        label: 'VLESS + XHTTP + REALITY + XMUX',
        badgeLabel: 'VLESS · XHTTP · XMUX'
    }
] as const

export type ManagedProtocolCreationPresetId =
    (typeof MANAGED_PROTOCOL_CREATION_WHITELIST)[number]['id']

export const DEFAULT_MANAGED_PROTOCOL_CREATION_PRESET: ManagedProtocolCreationPresetId =
    'vless-reality-vision'

const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

const getRawStreamSettings = (inbound: ConfigProfileInbound) => {
    const rawInbound = asRecord(inbound.rawInbound)
    return asRecord(rawInbound?.streamSettings)
}

const hasXmuxSettings = (inbound: ConfigProfileInbound) => {
    const xhttpSettings = asRecord(getRawStreamSettings(inbound)?.xhttpSettings)
    const extra = asRecord(xhttpSettings?.extra)
    return asRecord(extra?.xmux) !== null
}

const hasVisionFlow = (inbound: ConfigProfileInbound) => {
    const rawInbound = asRecord(inbound.rawInbound)
    const settings = asRecord(rawInbound?.settings)
    const explicitFlow = settings?.flow

    return explicitFlow === undefined || explicitFlow === 'xtls-rprx-vision'
}

export const getManagedProtocolCreationPreset = (inbound: ConfigProfileInbound) => {
    if (inbound.type.toLowerCase() !== 'vless') return null

    const streamSettings = getRawStreamSettings(inbound)
    const network = (inbound.network ?? streamSettings?.network)?.toString().toLowerCase()
    const security = (inbound.security ?? streamSettings?.security)?.toString().toLowerCase()

    if (security !== 'reality') return null

    if ((network === 'raw' || network === 'tcp') && hasVisionFlow(inbound)) {
        return MANAGED_PROTOCOL_CREATION_WHITELIST[0]
    }

    if (network === 'xhttp' && hasXmuxSettings(inbound)) {
        return MANAGED_PROTOCOL_CREATION_WHITELIST[1]
    }

    return null
}

export const isManagedProtocolCreationInbound = (inbound: ConfigProfileInbound) =>
    getManagedProtocolCreationPreset(inbound) !== null

const randomHex = (byteLength: number) => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(byteLength))
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const generateRealityPrivateKey = () => {
    const { secretKey } = generateKeyPair()
    return encodeURLSafe(secretKey).replace(/=/g, '').replace(/\n/g, '')
}

export const createManagedProtocolConfig = (
    presetId: ManagedProtocolCreationPresetId
): Record<string, unknown> => {
    const shortId = randomHex(8)
    const path = randomHex(8)
    const isVision = presetId === 'vless-reality-vision'

    return {
        log: {
            loglevel: 'info'
        },
        inbounds: [
            {
                tag: isVision ? `VLESS_REALITY_VISION_${shortId}` : `VLESS_XHTTP_XMUX_${shortId}`,
                port: 443,
                protocol: 'vless',
                settings: {
                    clients: [],
                    decryption: 'none',
                    ...(isVision ? { flow: 'xtls-rprx-vision' } : {})
                },
                streamSettings: {
                    network: isVision ? 'raw' : 'xhttp',
                    security: 'reality',
                    realitySettings: {
                        show: false,
                        target: 'www.microsoft.com:443',
                        xver: 0,
                        serverNames: ['www.microsoft.com'],
                        privateKey: generateRealityPrivateKey(),
                        shortIds: [shortId]
                    },
                    ...(!isVision
                        ? {
                              xhttpSettings: {
                                  path: `/${path}`,
                                  mode: 'auto',
                                  extra: {
                                      headers: {},
                                      xPaddingBytes: '100-1000',
                                      noGRPCHeader: false,
                                      scMaxEachPostBytes: 1_000_000,
                                      scMinPostsIntervalMs: 30,
                                      scStreamUpServerSecs: '20-80',
                                      xmux: {
                                          maxConcurrency: '16-32',
                                          maxConnections: 0,
                                          cMaxReuseTimes: 0,
                                          hMaxRequestTimes: '600-900',
                                          hMaxReusableSecs: '1800-3000',
                                          hKeepAlivePeriod: 0
                                      }
                                  }
                              }
                          }
                        : {})
                },
                sniffing: {
                    enabled: true,
                    destOverride: ['http', 'tls', 'quic']
                }
            }
        ],
        outbounds: [
            {
                protocol: 'freedom',
                tag: 'DIRECT'
            },
            {
                protocol: 'blackhole',
                tag: 'BLOCK'
            }
        ],
        routing: {
            rules: []
        }
    }
}
