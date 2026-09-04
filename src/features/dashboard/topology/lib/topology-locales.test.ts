import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const localesRoot = new URL('../../../../../public/locales/', import.meta.url)

const readLocale = (locale: string) =>
    JSON.parse(readFileSync(new URL(`${locale}/remnawave.json`, localesRoot), 'utf8')) as Record<
        string,
        unknown
    >

const flattenKeys = (value: unknown, prefix = ''): string[] => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) =>
        flattenKeys(nestedValue, prefix ? `${prefix}.${key}` : key)
    )
}

describe('topology translations', () => {
    const locales = ['en', 'zh', 'ru', 'fa']
    const english = readLocale('en')
    const expectedKeys = flattenKeys({
        constants: { topology: (english.constants as Record<string, unknown>).topology },
        topology: english.topology
    }).sort()

    for (const locale of locales) {
        it(`${locale} contains the complete topology translation key set`, () => {
            const resource = readLocale(locale)
            const actualKeys = flattenKeys({
                constants: {
                    topology: (resource.constants as Record<string, unknown>).topology
                },
                topology: resource.topology
            }).sort()

            assert.deepEqual(actualKeys, expectedKeys)
            for (const key of actualKeys) {
                const value = key.split('.').reduce<unknown>((current, segment) => {
                    if (!current || typeof current !== 'object') return undefined
                    return (current as Record<string, unknown>)[segment]
                }, resource)
                assert.equal(typeof value, 'string')
                assert.ok((value as string).trim().length > 0)
            }
        })
    }
})
