import type { HeroModalController } from '../../use-hero-modal'

import { toast } from '@heroui/react'
import * as contract from '@remnawave/backend-contract'
import { QueryClientProvider } from '@tanstack/react-query'
import { consola } from 'consola/browser'
import { createInstance } from 'i18next'
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'

import { createHeroModalLifecycle } from '../../use-hero-modal/modal-lifecycle'
import { mergeTagDraft, normalizeTags, tagsFormSchema } from '../edit-tags-modal/model/tags-draft'

Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})
const { instance, getSessionGeneration } = await import('../../../api/axios')
const { queryClient } = await import('../../../api/query-client')
const { removeToken, setToken } = await import('../../../../entities/auth/session-store')
const { renameDefinitions } = await import('./model/rename-definitions')
const { tagsDefinitions } = await import('../edit-tags-modal/model/tags-definitions')
const { useRenameForm } = await import('./model/use-rename-form')
const { useTagsForm } = await import('../edit-tags-modal/model/use-tags-form')
const { RenameDialogForm } = await import('./rename.drawer')
const { TagsDialogForm } = await import('../edit-tags-modal/edit-tags.modal')
const originalAdapter = instance.defaults.adapter
queryClient.setDefaultOptions({ queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } })
const i18n = createInstance()
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    initAsync: false
})
beforeEach((context) => {
    if ('mock' in context) {
        context.mock.method(consola, 'log', () => {})
        context.mock.method(toast, 'success', () => 'fixture-toast')
        context.mock.method(toast, 'danger', () => 'fixture-toast')
    }
    removeToken()
    queryClient.clear()
})
after(() => {
    instance.defaults.adapter = originalAdapter
    queryClient.clear()
    removeToken()
})

function renderHook<T>(useHook: () => T): T {
    let result!: T
    const expose = (value: T) => {
        result = value
    }
    function Harness() {
        expose(useHook())
        return null
    }
    renderToString(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness))
    )
    return result
}
function modalHarness() {
    const saved: unknown[] = []
    const nice = {
        visible: true,
        keepMounted: false,
        resolve: (value: unknown) => saved.push(value),
        hide: async () => {
            nice.visible = false
        },
        resolveHide: () => {},
        remove: () => {}
    }
    const lifecycle = createHeroModalLifecycle(() => nice, getSessionGeneration)
    lifecycle.sync('entity-a')
    const modal: HeroModalController = {
        isOpen: true,
        close: () => lifecycle.close(),
        onOpenChange: (open) => {
            if (!open) lifecycle.close()
        },
        resolveAndClose: lifecycle.close,
        afterClose: lifecycle.afterClose,
        capture: lifecycle.capture
    }
    return { modal, lifecycle, saved }
}
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((done, fail) => {
        resolve = done
        reject = fail
    })
    return { promise, resolve, reject }
}
const uuid = '11111111-1111-4111-8111-111111111111'
const renameCommands = {
    configProfile: contract.UpdateConfigProfileCommand,
    externalSquad: contract.UpdateExternalSquadCommand,
    internalSquad: contract.UpdateInternalSquadCommand,
    nodePlugin: contract.UpdateNodePluginCommand,
    passkey: contract.UpdatePasskeyCommand,
    subpageConfig: contract.UpdateSubpageConfigCommand,
    template: contract.UpdateSubscriptionTemplateCommand
}
const tagsCommands = {
    configProfile: contract.SetConfigProfileTagsCommand,
    externalSquad: contract.SetExternalSquadTagsCommand,
    internalSquad: contract.SetInternalSquadTagsCommand,
    nodePlugin: contract.SetNodePluginTagsCommand,
    subpageConfig: contract.SetSubpageConfigTagsCommand,
    template: contract.SetSubscriptionTemplateTagsCommand
}

for (const kind of Object.keys(renameCommands) as (keyof typeof renameCommands)[]) {
    test(`rename ${kind} uses its real contract route, method and ID field`, async () => {
        const requests: { url?: string; method?: string; data: unknown }[] = []
        instance.defaults.adapter = async (config) => {
            requests.push({ url: config.url, method: config.method, data: JSON.parse(config.data) })
            throw new Error('fixture transport stops after recording')
        }
        const definition = renameDefinitions[kind]
        assert.equal(definition.schema.safeParse({ name: '' }).success, false)
        assert.equal(definition.schema.safeParse({ name: 'Fixture-name' }).success, true)
        await assert.rejects(renderHook(definition.useSave).save(uuid, 'Fixture-name'))
        assert.equal(requests.length, 1)
        assert.equal(requests[0].url, renameCommands[kind].TSQ_url)
        assert.equal(
            requests[0].method,
            renameCommands[kind].endpointDetails.REQUEST_METHOD.toLowerCase()
        )
        assert.deepEqual(requests[0].data, {
            [kind === 'passkey' ? 'id' : 'uuid']: uuid,
            name: 'Fixture-name'
        })
    })
}

for (const kind of Object.keys(tagsCommands) as (keyof typeof tagsCommands)[]) {
    test(`tags ${kind} retains its contract endpoint and both invalidation keys`, async () => {
        const requests: { url?: string; data: unknown }[] = []
        instance.defaults.adapter = async (config) => {
            requests.push({ url: config.url, data: JSON.parse(config.data) })
            throw new Error('fixture transport stops after recording')
        }
        const definition = tagsDefinitions[kind]
        await assert.rejects(renderHook(definition.useSave).save(uuid, ['ENV:PROD']))
        assert.deepEqual(requests, [
            { url: tagsCommands[kind].TSQ_url, data: { uuid, tags: ['ENV:PROD'] } }
        ])
        assert.notDeepEqual(definition.queryKey, definition.tagsQueryKey)
        assert.equal(typeof definition.useKnownTags, 'function')
    })
}

test('tags normalize, split and deduplicate while preserving server validation and the ten-tag limit', () => {
    assert.deepEqual(normalizeTags([' env:prod ', 'ENV:PROD', '', 'region:sg']), [
        'ENV:PROD',
        'REGION:SG'
    ])
    assert.deepEqual(mergeTagDraft(['ENV:PROD'], 'env:prod,region:sg; tier:1\nrole:exit'), [
        'ENV:PROD',
        'REGION:SG',
        'TIER:1',
        'ROLE:EXIT'
    ])
    assert.equal(tagsFormSchema.safeParse({ tags: [], draft: '' }).success, true)
    assert.equal(
        tagsFormSchema.safeParse({
            tags: Array.from({ length: 11 }, (_, i) => `TAG:${i}`),
            draft: ''
        }).success,
        false
    )
    assert.equal(tagsFormSchema.safeParse({ tags: ['INVALID/TAG'], draft: '' }).success, false)
})

test('the actual HeroUI rename form preserves labels, placeholder, keyboard submit and cancel', () => {
    const h = modalHarness()
    const definition = {
        ...renameDefinitions.configProfile,
        useSave: () => ({ isPending: false, save: async () => {} })
    }
    const html = renderToString(
        createElement(
            I18nextProvider,
            { i18n },
            createElement(RenameDialogForm, {
                definition,
                uuid,
                name: 'Current name',
                modal: h.modal
            })
        )
    )
    assert.match(html, /<form\b/)
    assert.match(html, /placeholder="Current name"/)
    assert.match(html, /<label\b[^>]*for=/)
    assert.match(html, /type="submit"/)
    assert.match(html, /common.action.cancel/)
    assert.doesNotMatch(html, /mantine-/)
})

function tagsDefinition(save: (uuid: string, tags: string[]) => Promise<unknown>) {
    return {
        ...tagsDefinitions.configProfile,
        useSave: () => ({ isPending: false, save }),
        useKnownTags: () =>
            ({
                data: { tags: ['ENV:PROD', 'REGION:SG'] },
                isLoading: false,
                isError: false,
                refetch: async () => {}
            }) as unknown as ReturnType<typeof tagsDefinitions.configProfile.useKnownTags>
    }
}

test('the actual HeroUI tag editor renders removable tags, suggestions, clear, save and cancel', () => {
    const h = modalHarness()
    const html = renderToString(
        createElement(
            I18nextProvider,
            { i18n },
            createElement(TagsDialogForm, {
                definition: tagsDefinition(async () => {}),
                uuid,
                tags: ['ENV:PROD'],
                modal: h.modal
            })
        )
    )
    assert.match(html, /ENV:PROD/)
    assert.match(html, /<datalist\b/)
    assert.match(html, /<option value="REGION:SG"/)
    assert.match(html, /Clear all/)
    assert.match(html, /type="submit"/)
    assert.doesNotMatch(html, /mantine-/)
})

for (const kind of ['rename', 'tags'] as const) {
    for (const boundary of ['entity', 'session', 'close'] as const) {
        test(`${kind} async form validation cannot dispatch after ${boundary} changes`, async () => {
            const h = modalHarness()
            let saves = 0
            const save = async () => {
                saves++
            }
            const rename =
                kind === 'rename'
                    ? renderHook(() =>
                          useRenameForm(
                              {
                                  ...renameDefinitions.configProfile,
                                  useSave: () => ({ isPending: false, save })
                              },
                              uuid,
                              h.modal
                          )
                      )
                    : undefined
            const tags =
                kind === 'tags'
                    ? renderHook(() =>
                          useTagsForm(tagsDefinition(save), uuid, ['ENV:PROD'], h.modal)
                      )
                    : undefined
            rename?.form.setValue('name', 'Old draft')
            const pending = rename ? rename.submit() : tags!.submit()
            if (boundary === 'entity') h.lifecycle.sync('entity-b')
            if (boundary === 'session') setToken({ token: 'replacement-fixture-token' })
            if (boundary === 'close') h.modal.close()
            await pending
            assert.equal(saves, 0)
        })
    }
    for (const outcome of [
        'success',
        'failure',
        'closed-success',
        'entity-success',
        'replacement-session'
    ] as const) {
        test(`${kind} ${outcome} preserves correct draft/cache/dialog ownership`, async (context) => {
            const invalidations: unknown[] = []
            const notices: string[] = []
            context.mock.method(
                queryClient,
                'invalidateQueries',
                async (options?: { queryKey?: readonly unknown[] }) => {
                    invalidations.push(options?.queryKey)
                }
            )
            context.mock.method(toast, 'success', () => {
                notices.push('success')
                return 'fixture'
            })
            context.mock.method(toast, 'danger', () => {
                notices.push('failure')
                return 'fixture'
            })
            const h = modalHarness()
            const entered = deferred<void>()
            const pending = deferred<void>()
            const save = async () => {
                entered.resolve()
                return pending.promise
            }
            const nameModel =
                kind === 'rename'
                    ? renderHook(() =>
                          useRenameForm(
                              {
                                  ...renameDefinitions.configProfile,
                                  useSave: () => ({ isPending: false, save })
                              },
                              uuid,
                              h.modal
                          )
                      )
                    : undefined
            const tagsModel =
                kind === 'tags'
                    ? renderHook(() =>
                          useTagsForm(tagsDefinition(save), uuid, ['ENV:PROD'], h.modal)
                      )
                    : undefined
            nameModel?.form.setValue('name', 'Unsaved draft')
            const submit = nameModel ? nameModel.submit() : tagsModel!.submit()
            await entered.promise
            if (outcome === 'closed-success') h.modal.close()
            if (outcome === 'entity-success') h.lifecycle.sync('entity-b')
            if (outcome === 'replacement-session') setToken({ token: 'replacement-fixture-token' })
            if (outcome === 'failure') pending.reject(new Error('Server rejected changes'))
            else pending.resolve()
            await submit
            if (outcome === 'replacement-session') {
                assert.deepEqual(invalidations, [])
                assert.deepEqual(notices, [])
            } else if (outcome === 'failure') {
                assert.deepEqual(invalidations, [])
                assert.deepEqual(notices, ['failure'])
                assert.equal(h.saved.length, 0)
                assert.equal(
                    (
                        (nameModel
                            ? nameModel.form.getFieldState('root.server' as never)
                            : tagsModel!.form.getFieldState('root.server' as never)) as {
                            error?: { message?: string }
                        }
                    ).error?.message,
                    'Server rejected changes'
                )
            } else {
                const expected =
                    kind === 'rename'
                        ? [renameDefinitions.configProfile.queryKey]
                        : [
                              tagsDefinitions.configProfile.queryKey,
                              tagsDefinitions.configProfile.tagsQueryKey
                          ]
                assert.deepEqual(invalidations, expected)
                assert.deepEqual(notices, outcome === 'success' ? ['success'] : [])
                if (outcome === 'entity-success') assert.equal(h.saved.length, 0)
            }
        })
    }
}
