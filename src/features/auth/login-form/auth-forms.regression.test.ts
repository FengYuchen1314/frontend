import { zodResolver } from '@hookform/resolvers/zod'
import { OAuth2CallbackCommand } from '@remnawave/backend-contract'
import { QueryClientProvider } from '@tanstack/react-query'
import { CanceledError, isCancel } from 'axios'
import { createInstance } from 'i18next'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement, useMemo, useRef } from 'react'
import { renderToString } from 'react-dom/server'
import { useForm } from 'react-hook-form'
import { I18nextProvider } from 'react-i18next'
import ts from 'typescript'

import {
    getAuthorizationUrl,
    InvalidAuthorizationUrlError,
    oauthProviders
} from '../oauth2-login-button/model/oauth-providers'
import {
    createRegistrationSchema,
    generateRegistrationPassword
} from '../register-form/model/registration'
import { applyAuthFormErrors, mapAuthFormErrors } from './model/auth-form-errors'
import { getAuthMethods } from './model/auth-methods'

const storage = new Map<string, string>()
Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } },
    localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
    }
})

const { queryClient } = await import('../../../shared/api/query-client')
const { loginFormSchema } = await import('./model/use-login-form')
const { LoginFormFeature } = await import('./login-form.feature')
const { RegisterFormFeature } = await import('../register-form/register-form.feature')
const i18n = createInstance()
await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    initAsync: false
})
queryClient.setDefaultOptions({ queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } })
after(() => queryClient.clear())

function compileFunction(relative: string, name: string, scope: Record<string, unknown>) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    const file = ts.createSourceFile(
        relative,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    const declaration = file.statements.find(
        (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === name
    )
    assert(declaration)
    const javascript = ts.transpileModule(
        `return ${declaration.getText(file).replace(/^export\s+/, '')}`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
    ).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope))
}

function renderHook<T>(hook: () => T): T {
    let value!: T
    function Harness() {
        value = hook()
        return null
    }
    renderToString(createElement(Harness))
    return value
}

function renderForm(component: typeof LoginFormFeature | typeof RegisterFormFeature) {
    return renderToString(
        createElement(
            I18nextProvider,
            { i18n },
            createElement(QueryClientProvider, { client: queryClient }, createElement(component))
        )
    )
}

test('the actual HeroUI login form renders native labeled credentials and a submit button', () => {
    const html = renderForm(LoginFormFeature)
    assert.match(html, /<form\b/)
    assert.match(html, /name="username"/)
    assert.match(html, /name="password"/)
    assert.match(html, /type="password"/)
    assert.match(html, /autoComplete="current-password"/i)
    assert.match(html, /<label\b[^>]*for=/)
    assert.match(html, /type="submit"/)
    assert.match(html, /aria-label="Show password"/)
    assert.doesNotMatch(html, /mantine-/)
})

test('the actual HeroUI registration form retains confirmation, generation and native new-password inputs', () => {
    const html = renderForm(RegisterFormFeature)
    assert.match(html, /name="confirmPassword"/)
    assert.equal((html.match(/type="password"/g) ?? []).length, 2)
    assert.equal((html.match(/autoComplete="new-password"/gi) ?? []).length, 2)
    assert.match(html, /register-form.feature.generate/)
    assert.match(html, /type="submit"/)
    assert.doesNotMatch(html, /mantine-/)
})

test('login schema requires both fields without imposing registration strength on existing passwords', () => {
    assert.equal(loginFormSchema.safeParse({ username: '', password: 'x' }).success, false)
    assert.equal(loginFormSchema.safeParse({ username: 'fixture', password: '' }).success, false)
    assert.equal(
        loginFormSchema.safeParse({ username: 'fixture', password: 'existing-password' }).success,
        true
    )
})

test('registration uses the backend password contract and attaches mismatch to confirmation', () => {
    const schema = createRegistrationSchema('Passwords must match')
    assert.equal(
        schema.safeParse({
            username: 'fixture',
            password: 'Short-123-aA',
            confirmPassword: 'Short-123-aA'
        }).success,
        false
    )
    const password = 'Fixture-Password-24-Characters-1'
    assert.equal(
        schema.safeParse({ username: 'fixture', password, confirmPassword: password }).success,
        true
    )
    const mismatch = schema.safeParse({
        username: 'fixture',
        password,
        confirmPassword: 'different'
    })
    assert.equal(mismatch.success, false)
    if (!mismatch.success)
        assert(
            mismatch.error.issues.some(
                (issue) =>
                    issue.path[0] === 'confirmPassword' && issue.message === 'Passwords must match'
            )
        )
})

test('generated passwords always satisfy all server requirements', () => {
    const schema = createRegistrationSchema('mismatch')
    const passwords = new Set<string>()
    for (let i = 0; i < 100; i++) {
        const password = generateRegistrationPassword()
        assert.equal(password.length, 32)
        assert.match(password, /[A-Z]/)
        assert.match(password, /[a-z]/)
        assert.match(password, /[0-9]/)
        assert.equal(
            schema.safeParse({ username: 'fixture', password, confirmPassword: password }).success,
            true
        )
        passwords.add(password)
    }
    assert.equal(passwords.size, 100)
})

test('password sampling retries rejected integers instead of introducing modulo bias', () => {
    let calls = 0
    const password = generateRegistrationPassword((bytes) => {
        bytes[0] = calls++ === 0 ? 0xffffffff : 0
        return bytes
    })
    assert.equal(calls, 64)
    assert.match(password, /A/)
    assert.match(password, /a/)
    assert.match(password, /0/)
})

test('auth errors map Zod fields and wrapped server details without serializing submitted values', () => {
    const error = {
        cause: {
            issues: [
                { path: ['username'], message: 'Already exists', input: 'private-credential' },
                { path: ['unknown'], message: 'Form issue' }
            ]
        }
    }
    assert.deepEqual(mapAuthFormErrors(error, ['username']), {
        fieldErrors: { username: 'Already exists' },
        formErrors: ['Form issue']
    })
    assert(!JSON.stringify(mapAuthFormErrors(error, ['username'])).includes('private-credential'))
    assert.deepEqual(
        mapAuthFormErrors(
            {
                cause: {
                    fieldErrors: { password: ['Too short', 'Missing class'] },
                    formErrors: ['Denied', 'Denied']
                }
            },
            ['password']
        ),
        { fieldErrors: { password: 'Too short, Missing class' }, formErrors: ['Denied'] }
    )
})

test('canceled session errors stay silent and field mapping never sets unknown form paths', () => {
    assert.deepEqual(mapAuthFormErrors(new CanceledError(), ['username']), {
        fieldErrors: {},
        formErrors: []
    })
    const calls: unknown[] = []
    applyAuthFormErrors(
        { errors: { fieldErrors: { username: 'Invalid', privilegedFlag: 'Denied' } } },
        (...args) => {
            calls.push(args)
        },
        ['username']
    )
    assert.deepEqual(calls, [
        ['username', { type: 'server', message: 'Invalid' }, { shouldFocus: true }],
        ['root.server', { type: 'server', message: 'Denied' }]
    ])
})

test('all six OAuth providers remain available and only safe authorization URL schemes can redirect', () => {
    assert.deepEqual(
        oauthProviders.map((provider) => provider.id),
        ['telegram', 'pocketid', 'github', 'yandex', 'keycloak', 'generic']
    )
    assert.equal(
        getAuthorizationUrl('https://identity.example/login?state=fixture'),
        'https://identity.example/login?state=fixture'
    )
    assert.equal(getAuthorizationUrl('http://localhost/login'), 'http://localhost/login')
    for (const value of [undefined, '', '/login', 'javascript:alert(1)', 'data:text/html,x'])
        assert.throws(() => getAuthorizationUrl(value), InvalidAuthorizationUrlError)
})

test('missing server auth status cannot enable a login method', () => {
    assert.deepEqual(getAuthMethods(undefined), {
        isPasswordEnabled: false,
        isPasskeyEnabled: false,
        isOAuth2Enabled: false,
        hasPrimaryMethods: false,
        hasAlternativeMethods: false,
        isRegister: false
    })
})

test('the production RHF login workflow validates before dispatch and retains field-error callbacks', async () => {
    const calls: { variables: unknown }[] = []
    const hook = compileFunction('./model/use-login-form.ts', 'useLoginForm', {
        useForm,
        zodResolver,
        loginFormSchema,
        applyAuthFormErrors,
        useLogin: () => ({
            isPending: false,
            mutate: (request: { variables: unknown }) => calls.push(request)
        })
    }) as typeof import('./model/use-login-form').useLoginForm
    const model = renderHook(hook)
    await model.submit()
    assert.equal(calls.length, 0)
    model.form.setValue('username', 'fixture')
    model.form.setValue('password', 'existing-password')
    await model.submit()
    assert.deepEqual(calls, [{ variables: { username: 'fixture', password: 'existing-password' } }])
})

function registrationHarness(copy: (password: string) => Promise<void>) {
    const calls: { variables: unknown }[] = []
    const notices: string[] = []
    let cleanup = () => {}
    let generation = 0
    const hook = compileFunction(
        '../register-form/model/use-registration-form.ts',
        'useRegistrationForm',
        {
            useForm,
            zodResolver,
            createRegistrationSchema,
            applyAuthFormErrors,
            useMemo,
            useRef,
            useEffect: (effect: () => () => void) => {
                cleanup = effect()
            },
            useTranslation: () => ({ t: (key: string) => key }),
            useRegister: () => ({
                isPending: false,
                mutate: (request: { variables: unknown }) => calls.push(request)
            }),
            getSessionGeneration: () => generation,
            generateRegistrationPassword,
            navigator: { clipboard: { writeText: copy } },
            toast: { success: () => notices.push('success'), danger: () => notices.push('error') }
        }
    ) as typeof import('../register-form/model/use-registration-form').useRegistrationForm
    return {
        model: renderHook(hook),
        calls,
        notices,
        cleanup: () => cleanup(),
        replaceSession: () => {
            generation++
        }
    }
}

test('production registration generation fills both RHF fields and submits no confirmation field', async () => {
    let copied = ''
    const harness = registrationHarness(async (password) => {
        copied = password
    })
    harness.model.form.setValue('username', 'fixture')
    await harness.model.generatePassword()
    assert.equal(copied.length, 32)
    await harness.model.submit()
    assert.deepEqual(harness.calls, [{ variables: { username: 'fixture', password: copied } }])
    assert.deepEqual(harness.notices, ['success'])
})

test('clipboard rejection preserves a usable generated password and gives an error notice', async () => {
    const harness = registrationHarness(async () => {
        throw new Error('clipboard denied')
    })
    harness.model.form.setValue('username', 'fixture')
    await harness.model.generatePassword()
    await harness.model.submit()
    assert.equal(harness.calls.length, 1)
    assert.deepEqual(harness.notices, ['error'])
})

for (const boundary of ['unmount', 'session', 'new-copy'] as const) {
    test(`late clipboard completion after ${boundary} cannot show an obsolete notice`, async () => {
        const resolvers: (() => void)[] = []
        const harness = registrationHarness(
            () =>
                new Promise<void>((resolve) => {
                    resolvers.push(resolve)
                })
        )
        const old = harness.model.generatePassword()
        let current: Promise<void> | undefined
        if (boundary === 'unmount') harness.cleanup()
        if (boundary === 'session') harness.replaceSession()
        if (boundary === 'new-copy') current = harness.model.generatePassword()
        resolvers[0]()
        await old
        assert.deepEqual(harness.notices, [])
        if (current) {
            resolvers[1]()
            await current
            assert.deepEqual(harness.notices, ['success'])
        }
    })
}

// Run the production OAuth lifecycle with controlled promises. This does not
// claim a real redirect to an external identity provider or browser navigation.
function oauthHarness() {
    const redirects: string[] = []
    const loading: unknown[] = []
    const notices: string[] = []
    const pending: ((value: { authorizationUrl: string }) => void)[] = []
    let generation = 0
    let cleanup = () => {}
    let listener: (() => void) | undefined
    const hook = compileFunction(
        '../oauth2-login-button/model/use-oauth2-login.ts',
        'useOAuth2Login',
        {
            useState: () => [null, (value: unknown) => loading.push(value)],
            useRef: (value: unknown) => ({ current: value }),
            useEffect: (effect: () => () => void) => {
                cleanup = effect()
            },
            getSessionGeneration: () => generation,
            assertSessionGeneration: (expected: number) => {
                if (generation !== expected) throw new CanceledError()
            },
            subscribeSessionChanges: (callback: () => void) => {
                listener = callback
                return () => {
                    listener = undefined
                }
            },
            useOAuth2Authorize: () => ({
                mutateAsync: () =>
                    new Promise<{ authorizationUrl: string }>((resolve) => pending.push(resolve))
            }),
            window: { location: { assign: (url: string) => redirects.push(url) } },
            isCancel,
            getAuthorizationUrl,
            InvalidAuthorizationUrlError,
            toast: { danger: () => notices.push('error') }
        }
    ) as typeof import('../oauth2-login-button/model/use-oauth2-login').useOAuth2Login
    return {
        model: hook(),
        redirects,
        loading,
        notices,
        pending,
        cleanup: () => cleanup(),
        replaceSession: () => {
            generation++
            listener?.()
        }
    }
}

test('production OAuth authorization redirects a current attempt and clears its loading', async () => {
    const harness = oauthHarness()
    const login = harness.model.login('github')
    harness.pending[0]({ authorizationUrl: 'https://identity.example/login' })
    await login
    assert.deepEqual(harness.redirects, ['https://identity.example/login'])
    assert.deepEqual(harness.loading, ['github', null])
})

for (const boundary of ['unmount', 'session', 'new-attempt'] as const) {
    test(`production OAuth authorization cannot redirect after ${boundary}`, async () => {
        const harness = oauthHarness()
        const old = harness.model.login('github')
        let current: Promise<void> | undefined
        if (boundary === 'unmount') harness.cleanup()
        if (boundary === 'session') harness.replaceSession()
        if (boundary === 'new-attempt') current = harness.model.login('keycloak')
        const loadingBeforeOldCompletes = [...harness.loading]
        harness.pending[0]({ authorizationUrl: 'https://old.example/login' })
        await old
        assert.deepEqual(harness.redirects, [])
        assert.deepEqual(harness.loading, loadingBeforeOldCompletes)
        if (current) {
            harness.pending[1]({ authorizationUrl: 'https://current.example/login' })
            await current
            assert.deepEqual(harness.redirects, ['https://current.example/login'])
            assert.equal(harness.loading.at(-1), null)
        }
    })
}

test('production OAuth authorization rejects an unsafe URL with a visible error and loading cleanup', async () => {
    const harness = oauthHarness()
    const login = harness.model.login('generic')
    harness.pending[0]({ authorizationUrl: 'javascript:alert(1)' })
    await login
    assert.deepEqual(harness.redirects, [])
    assert.deepEqual(harness.notices, ['error'])
    assert.equal(harness.loading.at(-1), null)
})

test('production callback workflow rejects missing parameters and deduplicates StrictMode effect replay', () => {
    for (const valid of [false, true]) {
        const calls: unknown[] = []
        let effect = () => {}
        const hook = compileFunction(
            '../oauth2-login-button/model/use-oauth2-callback.ts',
            'useOAuth2CallbackFlow',
            {
                useParams: () => ({ provider: 'github' }),
                useSearchParams: () => [
                    new URLSearchParams(valid ? 'code=fixture&state=fixture' : 'code=fixture')
                ],
                useNavigate: () => () => {},
                useMemo: (compute: () => unknown) => compute(),
                useRef: (value: unknown) => ({ current: value }),
                useEffect: (callback: () => void) => {
                    effect = callback
                },
                useOauth2Callback: () => ({
                    isSuccess: false,
                    mutate: (request: unknown) => calls.push(request)
                }),
                OAuth2CallbackCommand,
                toast: { danger: () => {} },
                logoutEvents: { emit: () => {} },
                consumeReturnTo: () => null,
                ROUTES: { AUTH: { LOGIN: '/auth/login' }, DASHBOARD: { HOME: '/' } }
            }
        ) as typeof import('../oauth2-login-button/model/use-oauth2-callback').useOAuth2CallbackFlow
        const model = hook()
        effect()
        effect()
        assert.equal(model.isValid, valid)
        assert.equal(calls.length, valid ? 1 : 0)
    }
})
