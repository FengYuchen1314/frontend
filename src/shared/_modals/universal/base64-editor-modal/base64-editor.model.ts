import { decodeBase64, encodeBase64 } from '../../../utils/misc/base64.ts'

export const INVALID_BASE64_MESSAGE = 'Value is not valid base64'
export const BASE64_LANGUAGES = ['json', 'yaml', 'plaintext'] as const
export type Base64Language = (typeof BASE64_LANGUAGES)[number]
export interface Base64Draft {
    decoded: string
    encoded: string
    error: string | null
    language: Base64Language
}

export function detectBase64Language(value: string): Base64Language {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            JSON.parse(trimmed)
            return 'json'
        } catch {
            return 'plaintext'
        }
    }
    return 'plaintext'
}
export function createBase64Draft(encoded: string): Base64Draft {
    const decoded = decodeBase64(encoded)
    return {
        decoded: decoded ?? '',
        encoded,
        language: detectBase64Language(decoded ?? ''),
        error: decoded === null ? INVALID_BASE64_MESSAGE : null
    }
}
export function updateBase64Decoded(draft: Base64Draft, value: string | undefined): Base64Draft {
    const decoded = value ?? ''
    return { ...draft, decoded, encoded: encodeBase64(decoded), error: null }
}
export function updateBase64Encoded(draft: Base64Draft, value: string | undefined): Base64Draft {
    const encoded = (value ?? '').trim()
    const decoded = decodeBase64(encoded)
    return {
        ...draft,
        encoded,
        decoded: decoded ?? draft.decoded,
        error: decoded === null ? INVALID_BASE64_MESSAGE : null
    }
}
export function validateBase64Draft(draft: Base64Draft) {
    return decodeBase64(draft.encoded) !== null
}
