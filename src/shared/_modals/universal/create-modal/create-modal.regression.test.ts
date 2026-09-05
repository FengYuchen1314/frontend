import type { HeroModalController } from '../../use-hero-modal'
import type { CreateKind, CreateValues, CreatedEntity } from './model/create-draft'
import type { CreationDefinition } from './model/create-mutations'

import { toast } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import * as contract from '@remnawave/backend-contract'
import { QueryClientProvider } from '@tanstack/react-query'
import { CanceledError, isCancel } from 'axios'
import { consola } from 'consola/browser'
import { createInstance } from 'i18next'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, beforeEach, test } from 'node:test'
import { Children, createElement, isValidElement, useMemo, useRef, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { Controller, useForm } from 'react-hook-form'
import { I18nextProvider } from 'react-i18next'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'

import { MANAGED_PROTOCOL_CREATION_WHITELIST } from '../../../constants/managed-protocols'
import { createHeroModalLifecycle } from '../../use-hero-modal/modal-lifecycle'
import {
    configCreationBody,
    creationDefaults,
    creationDestination,
    creationSchema,
    templateCreationBody
} from './model/create-draft'

Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
})
const { instance, getSessionGeneration, assertSessionGeneration } =
    await import('../../../api/axios')
const { queryClient } = await import('../../../api/query-client')
const { setToken, removeToken } = await import('../../../../entities/auth/session-store')
const { QueryKeys } = await import('../../../api/hooks/keys-factory')
const { creationDefinitions } = await import('./model/create-mutations')
const { useCreationForm } = await import('./model/use-creation-form')
const { CreationForm } = await import('./creation-form')
const { CreateTemplateContent } = await import('./create-template.content')
const { CreateExternalSquadContent } = await import('./create-external-squad.content')
const { CreateInternalSquadContent } = await import('./create-internal-squad.content')
const { CreateNodePluginContent } = await import('./create-node-plugin.content')
const { CreateSubpageConfigContent } = await import('./create-subpage-config.content')
const { CreateConfigProfileContent, ConfigProfileCreationForm } =
    await import('./create-сonfig-profile.content')
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

function render(node: ReactNode) {
    return renderToString(
        createElement(
            I18nextProvider,
            { i18n },
            createElement(QueryClientProvider, { client: queryClient }, node)
        )
    )
}
function renderHook<T>(useHook: () => T): T {
    let result!: T
    const expose = (value: T) => {
        result = value
    }
    function Harness() {
        expose(useHook())
        return null
    }
    render(createElement(Harness))
    return result
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
    lifecycle.sync('configProfile')
    const modal: HeroModalController = {
        presentationKey: 0,
        isOpen: true,
        close: () => lifecycle.close(),
        onOpenChange: (open) => {
            if (!open) lifecycle.close()
        },
        resolveAndClose: lifecycle.close,
        afterClose: lifecycle.afterClose,
        capture: lifecycle.capture
    }
    return {
        modal,
        lifecycle,
        saved,
        reopen: () => {
            lifecycle.close()
            lifecycle.sync('configProfile')
            nice.visible = true
            lifecycle.sync('configProfile')
        }
    }
}
const uuid = '11111111-1111-4111-8111-111111111111'
const templateType = contract.SUBSCRIPTION_TEMPLATE_TYPE.MIHOMO
const values = (): CreateValues => ({ ...creationDefaults(), name: 'Fixture-name' })
const anyTlsValues = (): CreateValues => ({
    ...values(),
    managedProtocolPreset: 'anytls-shadowtls',
    serverName: ' camo.example.org ',
    address: ' 192.0.2.9 '
})
const commands = {
    template: contract.CreateSubscriptionTemplateCommand,
    externalSquad: contract.CreateExternalSquadCommand,
    internalSquad: contract.CreateInternalSquadCommand,
    configProfile: contract.CreateConfigProfileCommand,
    nodePlugin: contract.CreateNodePluginCommand,
    subpageConfig: contract.CreateSubpageConfigCommand
}
const keys = {
    template: QueryKeys.subscriptionTemplate.getSubscriptionTemplates.queryKey,
    externalSquad: QueryKeys.externalSquads.getExternalSquads.queryKey,
    internalSquad: QueryKeys.internalSquads.getInternalSquads.queryKey,
    configProfile: QueryKeys.configProfiles.getConfigProfiles.queryKey,
    nodePlugin: QueryKeys.nodePlugins.getNodePlugins.queryKey,
    subpageConfig: QueryKeys.subpageConfigs.getSubpageConfigs.queryKey
}
const contents = {
    template: CreateTemplateContent,
    externalSquad: CreateExternalSquadContent,
    internalSquad: CreateInternalSquadContent,
    configProfile: CreateConfigProfileContent,
    nodePlugin: CreateNodePluginContent,
    subpageConfig: CreateSubpageConfigContent
}

for (const kind of Object.keys(commands) as CreateKind[]) {
    test(`${kind} preserves exact command endpoint, method, request body and list invalidation key`, async () => {
        const requests: { url?: string; method?: string; data: Record<string, unknown> }[] = []
        instance.defaults.adapter = async (config) => {
            requests.push({ url: config.url, method: config.method, data: JSON.parse(config.data) })
            throw new Error('Fixture transport stops after recording')
        }
        const input = kind === 'configProfile' ? anyTlsValues() : values()
        await assert.rejects(
            renderHook(creationDefinitions[kind].useCreate).create(input, templateType)
        )
        assert.equal(requests.length, 1)
        assert.equal(requests[0].url, commands[kind].TSQ_url)
        assert.equal(
            requests[0].method,
            commands[kind].endpointDetails.REQUEST_METHOD.toLowerCase()
        )
        assert.deepEqual(creationDefinitions[kind].queryKey, keys[kind])
        if (kind === 'template')
            assert.deepEqual(requests[0].data, { name: input.name, templateType })
        else if (kind === 'internalSquad')
            assert.deepEqual(requests[0].data, { name: input.name, inbounds: [] })
        else if (kind === 'configProfile') {
            assert.deepEqual(Object.keys(requests[0].data).sort(), ['config', 'name'])
            assert.equal(requests[0].data.name, input.name)
            const extension = contract.AnyTlsProfileExtensionSchema.parse(
                (requests[0].data.config as Record<string, unknown>).xboardAnyTls
            )
            assert.deepEqual(extension.listeners[0].camouflage, {
                serverName: 'camo.example.org',
                address: '192.0.2.9',
                port: 443
            })
            assert.equal(extension.listeners[0].innerPort, 16001)
            assert.equal(extension.listeners[0].wrapperPort, 14443)
        } else assert.deepEqual(requests[0].data, { name: input.name })
    })

    test(`${kind} uses server name validation, including the template-only 255 character limit`, () => {
        const schema = creationSchema(kind)
        for (const name of ['', 'x', 'Invalid/name', 'x'.repeat(256)])
            assert.equal(schema.safeParse({ ...values(), name }).success, false)
        assert.equal(schema.safeParse(values()).success, true)
        assert.equal(
            schema.safeParse({ ...values(), name: 'x'.repeat(31) }).success,
            kind === 'template'
        )
    })

    test(`${kind} actual content renders a native labelled form, keyboard submit and cancel`, () => {
        const html = render(
            createElement(contents[kind], {
                modal: modalHarness().modal,
                onCreated: () => {},
                templateType
            })
        )
        assert.match(html, /<form\b/)
        assert.match(html, /<label\b[^>]*for=/)
        assert.match(html, /name="name"/)
        assert.match(html, /type="submit"/)
        assert.match(html, /common.action.cancel/)
        assert.doesNotMatch(html, /mantine-/)
        if (kind === 'configProfile') assert.match(html, /managed-protocol/)
    })
}

for (const type of Object.values(contract.SUBSCRIPTION_TEMPLATE_TYPE)) {
    test(`template ${type} is retained as a fixed creation context and opens the returned editor type`, () => {
        assert.deepEqual(templateCreationBody(values(), type), {
            name: 'Fixture-name',
            templateType: type
        })
        assert.deepEqual(creationDestination('template', { uuid, templateType: type }), {
            type: 'navigate',
            to: `/dashboard/templates/${type}/${uuid}`
        })
    })
}
test('missing or invalid template types are never silently changed to a different format', () => {
    assert.throws(() => templateCreationBody(values()))
    assert.throws(() => creationDestination('template', { uuid }))
})

test('all five original managed protocols remain selectable and no hidden legacy protocol is admitted', () => {
    assert.deepEqual(
        MANAGED_PROTOCOL_CREATION_WHITELIST.map((preset) => preset.id),
        [
            'vless-reality-vision',
            'vless-xhttp-reality-xmux',
            'socks5-password',
            'mieru-tcp',
            'anytls-shadowtls'
        ]
    )
    assert.equal(
        creationSchema('configProfile').safeParse({ ...values(), managedProtocolPreset: 'vmess' })
            .success,
        false
    )
    for (const preset of MANAGED_PROTOCOL_CREATION_WHITELIST) {
        const config = configCreationBody({ ...anyTlsValues(), managedProtocolPreset: preset.id })
            .config as Record<string, unknown>
        assert.equal(typeof config, 'object')
        if (preset.id === 'anytls-shadowtls') {
            assert.equal(
                contract.AnyTlsProfileExtensionSchema.safeParse(config.xboardAnyTls).success,
                true
            )
            assert.deepEqual(config.inbounds, [])
            assert.doesNotMatch(
                JSON.stringify(config),
                /skipCertVerify|insecure|wrapperPassword|privateKey/
            )
        } else if (preset.id === 'mieru-tcp') assert.equal(config.runtime, 'MIERU')
        else {
            const inbound = (
                config.inbounds as {
                    protocol: string
                    settings: Record<string, unknown>
                    streamSettings?: {
                        security: string
                        network: string
                        realitySettings: { privateKey: string }
                        xhttpSettings?: { extra: { xmux: unknown } }
                    }
                }[]
            )[0]
            if (preset.id === 'socks5-password')
                assert.deepEqual(inbound.settings, { auth: 'password', users: [], udp: false })
            else {
                assert.equal(inbound.protocol, 'vless')
                assert.equal(inbound.streamSettings?.security, 'reality')
                assert.equal(inbound.streamSettings?.realitySettings.privateKey.length, 43)
                if (preset.id === 'vless-reality-vision')
                    assert.equal(inbound.settings.flow, 'xtls-rprx-vision')
                else assert.ok(inbound.streamSettings?.xhttpSettings?.extra.xmux)
            }
        }
    }
})

for (const patch of [
    { serverName: '' },
    { serverName: '*.example.org' },
    { address: 'hostname.example.org' },
    { camouflagePort: 0 },
    { innerPort: 16001.5 },
    { wrapperPort: 65536 },
    { wrapperPort: 15999 },
    { wrapperPort: 16001 },
    { innerPort: NaN }
]) {
    test(`AnyTLS rejects ${Object.keys(patch)[0]} invalid values before network serialization`, () => {
        const input = { ...anyTlsValues(), ...patch }
        assert.equal(creationSchema('configProfile').safeParse(input).success, false)
        assert.throws(() => configCreationBody(input))
    })
}
test('switching away from AnyTLS ignores its preserved hidden incomplete draft', () => {
    const input = { ...values(), wrapperPort: NaN, innerPort: NaN, camouflagePort: NaN }
    assert.equal(creationSchema('configProfile').safeParse(input).success, true)
    assert.ok(configCreationBody(input).config)
    assert.equal(
        creationSchema('configProfile').safeParse({
            ...input,
            managedProtocolPreset: 'anytls-shadowtls'
        }).success,
        false
    )
})

test('the real AnyTLS form renders SNI, address and all three numeric ports without secret fields', () => {
    const h = modalHarness()
    function Harness() {
        const form = useForm<CreateValues>({ defaultValues: anyTlsValues() })
        return createElement(ConfigProfileCreationForm, {
            modal: h.modal,
            model: { form, isPending: false, submit: async () => {} }
        })
    }
    const html = render(createElement(Harness))
    for (const name of ['serverName', 'address', 'camouflagePort', 'wrapperPort', 'innerPort'])
        assert.match(html, new RegExp(`name="${name}"`))
    for (const port of ['443', '14443', '16001']) assert.match(html, new RegExp(`value="${port}"`))
    assert.match(html, /AnyTLS \+ ShadowTLS/)
    assert.doesNotMatch(html, /mantine-|name="(?:privateKey|password|tlsCertificate)"/)
})

function definition(
    kind: CreateKind,
    create: ReturnType<CreationDefinition['useCreate']>['create']
): CreationDefinition {
    return {
        queryKey: creationDefinitions[kind].queryKey,
        useCreate: () => ({ isPending: false, create })
    }
}

for (const boundary of ['close', 'new-show', 'reopen', 'session', 'unmount'] as const) {
    test(`async RHF validation cannot dispatch after ${boundary}`, async () => {
        const h = modalHarness()
        let dispatches = 0
        const model = renderHook(() =>
            useCreationForm(
                'nodePlugin',
                { modal: h.modal, onCreated: () => {} },
                definition('nodePlugin', async () => {
                    dispatches++
                    return { uuid }
                })
            )
        )
        model.form.setValue('name', 'Fixture-draft')
        const pending = model.submit()
        if (boundary === 'close') h.modal.close()
        if (boundary === 'new-show') h.lifecycle.sync('configProfile', {})
        if (boundary === 'reopen') h.reopen()
        if (boundary === 'session') setToken({ token: 'replacement-fixture-token' })
        if (boundary === 'unmount') h.lifecycle.dispose()
        await pending
        assert.equal(dispatches, 0)
    })
}

for (const outcome of [
    'success',
    'failure',
    'cancel',
    'closed-success',
    'reopened-success',
    'new-show-success',
    'unmounted-success',
    'replacement-session'
] as const) {
    test(`${outcome} preserves correct draft, query cache and post-create ownership`, async (context) => {
        const invalidations: unknown[] = []
        const notices: string[] = []
        const destinations: unknown[] = []
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
        const pending = deferred<CreatedEntity>()
        let dispatches = 0
        const model = renderHook(() =>
            useCreationForm(
                'nodePlugin',
                { modal: h.modal, onCreated: (destination) => destinations.push(destination) },
                definition('nodePlugin', async () => {
                    dispatches++
                    entered.resolve()
                    return pending.promise
                })
            )
        )
        model.form.setValue('name', 'Fixture-draft')
        const submit = model.submit()
        await entered.promise
        await model.submit()
        assert.equal(dispatches, 1, 'double submit cannot create two entities')
        if (outcome === 'closed-success') h.modal.close()
        if (outcome === 'reopened-success') h.reopen()
        if (outcome === 'new-show-success') h.lifecycle.sync('configProfile', {})
        if (outcome === 'unmounted-success') h.lifecycle.dispose()
        if (outcome === 'replacement-session') setToken({ token: 'replacement-fixture-token' })
        const resolvesBeforeReply = h.saved.length
        if (outcome === 'failure') pending.reject(new Error('Fixture server rejected creation'))
        else if (outcome === 'cancel') pending.reject(new CanceledError('Fixture ordinary abort'))
        else pending.resolve({ uuid })
        await submit
        const serverCreated = !['failure', 'cancel', 'replacement-session'].includes(outcome)
        assert.deepEqual(invalidations, serverCreated ? [keys.nodePlugin] : [])
        assert.deepEqual(
            notices,
            outcome === 'success' ? ['success'] : outcome === 'failure' ? ['failure'] : []
        )
        assert.deepEqual(
            destinations,
            outcome === 'success' ? [creationDestination('nodePlugin', { uuid })] : []
        )
        assert.equal(h.saved.length, resolvesBeforeReply + (outcome === 'success' ? 1 : 0))
        if (outcome === 'failure') {
            assert.equal(
                (
                    model.form.getFieldState('root.server' as never) as {
                        error?: { message?: string }
                    }
                ).error?.message,
                'Fixture server rejected creation'
            )
            let retriedName = ''
            await model.form.handleSubmit((input) => {
                retriedName = input.name
            })()
            assert.equal(retriedName, 'Fixture-draft', 'server failure keeps the submitted draft')
        }
    })
}

test('the real template hook validates a successful server response, invalidates the list and navigates', async (context) => {
    const invalidations: unknown[] = []
    const destinations: unknown[] = []
    context.mock.method(
        queryClient,
        'invalidateQueries',
        async (options?: { queryKey?: readonly unknown[] }) => {
            invalidations.push(options?.queryKey)
        }
    )
    instance.defaults.adapter = async (config) => ({
        config,
        status: 201,
        statusText: 'Created',
        headers: {},
        data: {
            response: {
                uuid,
                name: 'Fixture-name',
                viewPosition: 0,
                tags: [],
                templateType,
                templateJson: null,
                encodedTemplateYaml: null
            }
        }
    })
    const h = modalHarness()
    const model = renderHook(() =>
        useCreationForm('template', {
            modal: h.modal,
            templateType,
            onCreated: (destination) => destinations.push(destination)
        })
    )
    model.form.setValue('name', 'Fixture-name')
    await model.submit()
    assert.deepEqual(invalidations, [keys.template])
    assert.deepEqual(destinations, [creationDestination('template', { uuid, templateType })])
    assert.equal(h.saved.length, 1)
})

test('invalid names and invalid AnyTLS options never dispatch through the actual form submit', async () => {
    for (const input of [
        { ...values(), name: '' },
        { ...anyTlsValues(), wrapperPort: 16001 }
    ]) {
        let dispatches = 0
        const model = renderHook(() =>
            useCreationForm(
                'configProfile',
                { modal: modalHarness().modal, onCreated: () => {} },
                definition('configProfile', async () => {
                    dispatches++
                    return { uuid }
                })
            )
        )
        for (const [name, value] of Object.entries(input))
            model.form.setValue(name as keyof CreateValues, value)
        await model.submit()
        assert.equal(dispatches, 0)
    }
})

/** Execute the real NiceModal callback without a browser portal. Marker components
 * expose only wiring; native form HTML is separately rendered above. */
function rootDialogHarness(
    kind: CreateKind,
    presentationKey: number,
    options?: { navigate?: (to: string) => void; templateType?: contract.TSubscriptionTemplateType }
) {
    const source = readFileSync(new URL('./create.modal.tsx', import.meta.url), 'utf8')
    const ast = ts.createSourceFile(
        'create.modal.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    const declaration = ast.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => [...statement.declarationList.declarations])
        .find((node) => node.name.getText(ast) === 'CreateModal')
    assert(declaration?.initializer && ts.isCallExpression(declaration.initializer))
    const callback = declaration.initializer.arguments[0]
    const code = ts.transpileModule(`const Component = ${callback.getText(ast)}`, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText
    const FormMarker = () => null
    const parts = Object.assign(() => null, {
        Backdrop: () => null,
        Container: () => null,
        Dialog: () => null,
        CloseTrigger: () => null,
        Header: () => null,
        Heading: () => null,
        Body: () => null
    })
    const modal = modalHarness().modal
    const navigations: unknown[] = []
    const drawers: unknown[] = []
    const dependencies = {
        exports: {},
        useModal: () => ({}),
        useHeroModal: () => ({ ...modal, presentationKey }),
        useTranslation: () => ({ t: (key: string) => key }),
        Modal: parts,
        Alert: Object.assign(() => null, {
            Indicator: () => null,
            Content: () => null,
            Description: () => null
        }),
        Button: () => null,
        HeroModalPresence: () => null,
        TbNewSection: () => null,
        contents: Object.fromEntries(Object.keys(contents).map((name) => [name, FormMarker])),
        showModal: (...args: unknown[]) => {
            drawers.push(args)
        }
    }
    const component = new Function(
        'require',
        ...Object.keys(dependencies),
        `${code}; return Component`
    )(
        (name: string) => {
            assert.equal(name, 'react/jsx-runtime')
            return jsxRuntime
        },
        ...Object.values(dependencies)
    )
    const tree = component({
        createFrom: kind,
        contentOptions: options ?? { navigate: (to: string) => navigations.push(to), templateType }
    })
    let form:
        | {
              key: string | null
              props: {
                  onCreated: (destination: ReturnType<typeof creationDestination>) => void
                  templateType?: contract.TSubscriptionTemplateType
              }
          }
        | undefined
    const visit = (node: ReactNode) =>
        Children.forEach(node, (child) => {
            if (!isValidElement<{ children?: ReactNode }>(child)) return
            if (child.type === FormMarker) form = child as unknown as typeof form
            visit(child.props.children)
        })
    visit(tree)
    return { form, navigations, drawers }
}

for (const kind of Object.keys(contents) as CreateKind[]) {
    test(`${kind} actual modal keys each new presentation and continues to the original editor or drawer`, () => {
        const first = rootDialogHarness(kind, 3)
        const next = rootDialogHarness(kind, 4)
        assert(first.form)
        assert(next.form)
        assert.equal(first.form.key, '3')
        assert.equal(next.form.key, '4')
        assert.equal(rootDialogHarness(kind, 3).form?.key, first.form.key)
        first.form.props.onCreated(creationDestination(kind, { uuid, templateType }))
        if (kind === 'externalSquad')
            assert.deepEqual(first.drawers, [['externalSquads_externalSquadsDrawer', { uuid }]])
        else if (kind === 'internalSquad')
            assert.deepEqual(first.drawers, [
                ['internalSquads_internalSquadsInboundsDrawer', { squadUuid: uuid }]
            ])
        else {
            assert.equal(first.navigations.length, 1)
            assert.deepEqual(first.drawers, [])
        }
        if (kind === 'template') assert.equal(first.form.props.templateType, templateType)
    })
}

test('missing template type or navigation context shows no submittable creation form', () => {
    assert.equal(rootDialogHarness('template', 0, {}).form, undefined)
    assert.equal(rootDialogHarness('template', 0, { navigate: () => {} }).form, undefined)
    assert.equal(rootDialogHarness('configProfile', 0, {}).form, undefined)
    assert.equal(rootDialogHarness('nodePlugin', 0, {}).form, undefined)
    assert.equal(rootDialogHarness('subpageConfig', 0, {}).form, undefined)
    assert.ok(rootDialogHarness('internalSquad', 0, {}).form)
    assert.ok(rootDialogHarness('externalSquad', 0, {}).form)
})

function contentUnmountHarness() {
    const source = readFileSync(new URL('./model/use-creation-form.ts', import.meta.url), 'utf8')
    const ast = ts.createSourceFile('use-creation-form.ts', source, ts.ScriptTarget.Latest, true)
    const declaration = ast.statements.find(
        (statement) =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === 'useCreationForm'
    )
    assert(declaration)
    const code = ts.transpileModule(declaration.getText(ast), {
        compilerOptions: { module: ts.ModuleKind.CommonJS }
    }).outputText
    const cleanups: (() => void)[] = []
    const dependencies = {
        exports: {},
        useMemo,
        useRef,
        useForm,
        zodResolver,
        creationSchema,
        creationDefaults,
        creationDefinitions,
        getSessionGeneration,
        assertSessionGeneration,
        queryClient,
        creationDestination,
        toast,
        isCancel,
        useTranslation: () => ({ t: (key: string) => key }),
        useLayoutEffect: (setup: () => () => void) => {
            cleanups.push(setup())
        }
    }
    const useInstrumentedCreationForm = new Function(
        ...Object.keys(dependencies),
        `${code}; return useCreationForm`
    )(...Object.values(dependencies)) as typeof useCreationForm
    return { useInstrumentedCreationForm, unmount: () => cleanups.forEach((cleanup) => cleanup()) }
}

for (const phase of ['validation', 'response'] as const) {
    test(`content-only unmount during ${phase} invalidates the production form even while the parent modal remains open`, async (context) => {
        const h = modalHarness()
        const content = contentUnmountHarness()
        const entered = deferred<void>()
        const pending = deferred<CreatedEntity>()
        const destinations: unknown[] = []
        const invalidations: unknown[] = []
        context.mock.method(
            queryClient,
            'invalidateQueries',
            async (options?: { queryKey?: readonly unknown[] }) => {
                invalidations.push(options?.queryKey)
            }
        )
        let dispatches = 0
        const model = renderHook(() =>
            content.useInstrumentedCreationForm(
                'nodePlugin',
                { modal: h.modal, onCreated: (destination) => destinations.push(destination) },
                definition('nodePlugin', async () => {
                    dispatches++
                    entered.resolve()
                    return pending.promise
                })
            )
        )
        model.form.setValue('name', 'Fixture-draft')
        const submit = model.submit()
        if (phase === 'response') await entered.promise
        content.unmount()
        assert.equal(h.modal.capture().isCurrent(), true)
        pending.resolve({ uuid })
        await submit
        assert.equal(dispatches, phase === 'validation' ? 0 : 1)
        assert.deepEqual(invalidations, phase === 'validation' ? [] : [keys.nodePlugin])
        assert.deepEqual(destinations, [])
        assert.deepEqual(h.saved, [])
    })
}

test('a rejected creation can be corrected and retried without losing the draft or retaining submit lock', async () => {
    const inputs: string[] = []
    const h = modalHarness()
    const model = renderHook(() =>
        useCreationForm(
            'nodePlugin',
            { modal: h.modal, onCreated: () => {} },
            definition('nodePlugin', async (input) => {
                inputs.push(input.name)
                if (inputs.length === 1) throw new Error('Fixture duplicate name')
                return { uuid }
            })
        )
    )
    model.form.setValue('name', 'First-name')
    await model.submit()
    model.form.setValue('name', 'Corrected-name')
    await model.submit()
    assert.deepEqual(inputs, ['First-name', 'Corrected-name'])
    assert.equal(h.saved.length, 1)
    assert.equal(
        (model.form.getFieldState('root.server' as never) as { error?: unknown }).error,
        undefined
    )
})

test('a new click in a still-visible previous-account dialog cannot acquire the new session', async () => {
    const h = modalHarness()
    let dispatches = 0
    const model = renderHook(() =>
        useCreationForm(
            'nodePlugin',
            { modal: h.modal, onCreated: () => {} },
            definition('nodePlugin', async () => {
                dispatches++
                return { uuid }
            })
        )
    )
    model.form.setValue('name', 'Old-account-draft')
    setToken({ token: 'replacement-fixture-token' })
    await model.submit()
    assert.equal(dispatches, 0)
    assert.deepEqual(h.saved, [])
})

function findElements(
    node: ReactNode,
    predicate: (element: { type: unknown; props: Record<string, unknown> }) => boolean
) {
    const result: { type: unknown; props: Record<string, unknown> }[] = []
    const visit = (current: ReactNode) =>
        Children.forEach(current, (child) => {
            if (!isValidElement<Record<string, unknown> & { children?: ReactNode }>(child)) return
            if (predicate(child)) result.push(child)
            visit(child.props.children)
        })
    visit(node)
    return result
}

test('the real HeroUI form connects keyboard submit, pending state and native cancel to its owner', () => {
    const h = modalHarness()
    const model = renderHook(() =>
        useCreationForm(
            'nodePlugin',
            { modal: h.modal, onCreated: () => {} },
            definition('nodePlugin', async () => ({ uuid }))
        )
    )
    const tree = renderHook(() =>
        CreationForm({
            model: { ...model, isPending: true },
            modal: h.modal,
            nameLabel: 'Name',
            namePlaceholder: 'Fixture'
        })
    )
    assert.equal(tree.props.onSubmit, model.submit)
    const cancel = findElements(tree, (element) => element.props.type === 'button')[0]
    const submit = findElements(tree, (element) => element.props.type === 'submit')[0]
    assert.equal(submit.props.isPending, true)
    assert.equal(cancel.props.onPress, h.modal.close)
    ;(cancel.props.onPress as () => void)()
    assert.equal(h.modal.capture().isCurrent(), false)
    assert.equal(h.saved.length, 1)
})

test('the real native protocol selector forwards only the five whitelisted values and cannot be deselected', () => {
    const h = modalHarness()
    const form = renderHook(() => useForm<CreateValues>({ defaultValues: values() }))
    const tree = renderHook(() =>
        ConfigProfileCreationForm({
            modal: h.modal,
            model: { form, isPending: false, submit: async () => {} }
        })
    )
    const controller = findElements(
        tree,
        (element) => element.type === Controller && element.props.name === 'managedProtocolPreset'
    )[0]
    assert(controller)
    const accepted: unknown[] = []
    const select = (
        controller.props.render as (input: unknown) => {
            props: { value: unknown; onChange: (value: unknown) => void; children: ReactNode }
        }
    )({
        field: {
            name: 'managedProtocolPreset',
            value: values().managedProtocolPreset,
            onChange: (value: unknown) => accepted.push(value),
            onBlur: () => {},
            ref: () => {}
        },
        fieldState: {}
    })
    assert.equal(select.props.value, 'vless-reality-vision')
    for (const preset of MANAGED_PROTOCOL_CREATION_WHITELIST) select.props.onChange(preset.id)
    select.props.onChange(null)
    select.props.onChange('vmess')
    assert.deepEqual(
        accepted,
        MANAGED_PROTOCOL_CREATION_WHITELIST.map((preset) => preset.id)
    )
    assert.deepEqual(
        findElements(
            select.props.children,
            (element) => typeof element.props.textValue === 'string'
        ).map((element) => element.props.id),
        accepted
    )
})
