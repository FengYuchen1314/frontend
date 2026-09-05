import type { TOAuth2ProvidersKeys } from '@remnawave/backend-contract'

export const oauthProviders: { id: TOAuth2ProvidersKeys; label: string; color: string }[] = [
    { id: 'telegram', label: 'Telegram', color: '#0088cc' },
    { id: 'pocketid', label: 'PocketID', color: '#27272a' },
    { id: 'github', label: 'GitHub', color: '#24292e' },
    { id: 'yandex', label: 'Yandex', color: '#000000' },
    { id: 'keycloak', label: 'Keycloak', color: '#000000' },
    { id: 'generic', label: 'OAuth2', color: '#27272a' }
]

export class InvalidAuthorizationUrlError extends Error {
    constructor() {
        super('The provider did not return a valid authorization URL')
    }
}

export function getAuthorizationUrl(value: unknown) {
    if (typeof value !== 'string') throw new InvalidAuthorizationUrlError()
    try {
        const url = new URL(value)
        if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
    } catch {
        /* Invalid backend response; do not execute an arbitrary URL scheme. */
    }
    throw new InvalidAuthorizationUrlError()
}
