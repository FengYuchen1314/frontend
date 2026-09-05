import { QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import { consola } from 'consola/browser'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, afterEach, beforeEach, test } from 'node:test'
import { createContext, createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import ts from 'typescript'

const storage = new Map([
    ['sessionStore', JSON.stringify({ state: { token: 'persisted-fixture-token' }, version: 0 })]
])
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

const { setToken, removeToken, useSessionStore } =
    await import('../../../entities/auth/session-store/use-session-store.ts')
const { instance, getAuthorizationToken, getSessionGeneration } = await import('../../api/axios.ts')
const { clearQueryClient, queryClient } = await import('../../api/query-client.ts')
const { logoutEvents } = await import('../../emitters/emit-logout.ts')
const { create, resetAllStores } = await import('../store-wrapper/store-wrapper.ts')
const { ROUTES } = await import('../../constants/routes.ts')
const { logoutFromHeader } = await import('../../ui/header-buttons/header-controls.model.ts')
const { useLogin, useRegister, useOauth2Callback } =
    await import('../../api/hooks/auth/auth.hooks.ts')
const { toast } = await import('@heroui/react')
const originalAdapter = instance.defaults.adapter
const initialPersistedToken = useSessionStore.getState().token
const privateStore = create<{ record: string }>()(() => ({ record: '' }))
queryClient.setDefaultOptions({ queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } })
const cleanups: (() => void)[] = []

beforeEach((context) => {
    if ('mock' in context) context.mock.method(consola, 'log', () => {})
    removeToken()
    resetAllStores()
    queryClient.clear()
})
afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
})
after(() => {
    instance.defaults.adapter = originalAdapter
    removeToken()
    queryClient.clear()
})

type AuthValue = { isAuthenticated: boolean; isInitialized: boolean }

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
        {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                jsx: ts.JsxEmit.React,
                jsxFactory: 'createElement'
            }
        }
    ).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope))
}

// Execute the production provider with deterministic effect/state scheduling,
// real persisted Zustand token state, Axios authority, logout emitter and caches.
// This is a lifecycle regression harness, not a mounted DOM/browser assertion.
function provider(options: { reset?: () => void; hydrating?: boolean } = {}) {
    const slots: unknown[] = []
    const effectSlots = new Map<number, { deps: unknown[]; cleanup?: () => void }>()
    const pending: (() => void)[] = []
    let cursor = 0
    let hydrating = options.hydrating ?? false
    const component = compileFunction('./auth-provider.tsx', 'AuthProvider', {
        createElement,
        AuthContext: createContext<AuthValue | null>(null),
        useToken: () => useSessionStore.getState().token,
        removeToken,
        resetAllStores: options.reset ?? resetAllStores,
        clearQueryClient,
        logoutEvents,
        consola: { error: () => {} },
        subscribeInitialization: () => () => {},
        getClientInitialized: () => true,
        getServerInitialized: () => false,
        useSyncExternalStore: (
            _subscribe: unknown,
            getSnapshot: () => unknown,
            getServerSnapshot: () => unknown
        ) => (hydrating ? getServerSnapshot() : getSnapshot()),
        useState: (initial: unknown) => {
            const index = cursor++
            if (!(index in slots))
                slots[index] = typeof initial === 'function' ? initial() : initial
            return [
                slots[index],
                (value: unknown) => {
                    slots[index] = value
                }
            ]
        },
        useMemo: (compute: () => unknown) => {
            cursor++
            return compute()
        },
        useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
            const index = cursor++
            const previous = effectSlots.get(index)
            if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
                pending.push(() => {
                    previous?.cleanup?.()
                    effectSlots.set(index, { deps, cleanup: effect() ?? undefined })
                })
            }
        }
    }) as (props: { children: null }) => ReactElement<{ value: AuthValue }>
    const render = () => {
        cursor = 0
        return component({ children: null }).props.value
    }
    const commit = () => {
        pending.splice(0).forEach((effect) => effect())
        hydrating = false
        return render()
    }
    const cleanup = () => {
        effectSlots.forEach((effect) => effect.cleanup?.())
        effectSlots.clear()
    }
    cleanups.push(cleanup)
    return { render, commit, cleanup }
}

test('persisted token is restored while server/hydration initialization keeps the guard closed', () => {
    assert.equal(initialPersistedToken, 'persisted-fixture-token')
    setToken({ token: initialPersistedToken })
    const auth = provider({ hydrating: true })
    assert.equal(auth.render().isInitialized, false)
    assert.deepEqual(auth.commit(), { isAuthenticated: true, isInitialized: true })
})

test('the real provider SSR snapshot does not admit protected content before client initialization', async () => {
    const { AuthProvider } = await import('./auth-provider.tsx')
    const { useAuth } = await import('../../hooks/use-auth.ts')
    setToken({ token: 'first-fixture-token' })
    let value: AuthValue | undefined
    const expose = (snapshot: AuthValue) => {
        value = snapshot
    }
    function Snapshot() {
        expose(useAuth())
        return null
    }
    renderToString(createElement(AuthProvider, null, createElement(Snapshot)))
    assert(value)
    assert.equal(value.isInitialized, false)
    assert.equal(value.isInitialized && value.isAuthenticated, false)
})

test('direct token installation and replacement immediately drive provider authentication', () => {
    const auth = provider()
    auth.render()
    auth.commit()
    setToken({ token: 'first-fixture-token' })
    assert.equal(auth.render().isAuthenticated, true)
    const generation = getSessionGeneration()
    setToken({ token: 'replacement-fixture-token' })
    assert.equal(auth.render().isAuthenticated, true)
    assert.equal(getAuthorizationToken(), 'replacement-fixture-token')
    assert.equal(getSessionGeneration(), generation + 1)
    assert.equal('setIsAuthenticated' in auth.render(), false)
})

test('direct token removal hides authenticated UI without a second setter or logout event', () => {
    setToken({ token: 'first-fixture-token' })
    const auth = provider()
    auth.render()
    assert.equal(auth.commit().isAuthenticated, true)
    queryClient.setQueryData(['private'], 'first-session-record')
    removeToken()
    assert.equal(auth.render().isAuthenticated, false)
    assert.equal(queryClient.getQueryData(['private']), undefined)
    assert.equal(getAuthorizationToken(), '')
})

test('logout synchronously clears token, private stores and caches and resists reentrant logout', () => {
    let resets = 0
    const auth = provider({
        reset: () => {
            resets++
            if (resets === 1) logoutEvents.emit()
            resetAllStores()
        }
    })
    setToken({ token: 'first-fixture-token' })
    auth.render()
    auth.commit()
    privateStore.setState({ record: 'first-session-record' })
    queryClient.setQueryData(['private'], 'first-session-record')
    logoutEvents.emit()
    assert.equal(resets, 1)
    assert.equal(useSessionStore.getState().token, '')
    assert.equal(privateStore.getState().record, '')
    assert.equal(queryClient.getQueryData(['private']), undefined)
    assert.equal(auth.render().isAuthenticated, false)
})

test('unmount unsubscribes the provider and repeated mount does not duplicate logout cleanup', () => {
    let resets = 0
    const auth = provider({
        reset: () => {
            resets++
        }
    })
    auth.render()
    auth.commit()
    auth.cleanup()
    logoutEvents.emit()
    assert.equal(resets, 0)
    auth.render()
    auth.commit()
    logoutEvents.emit()
    assert.equal(resets, 1)
})

test('logout clears leftover caches even if the session token is already empty', () => {
    const auth = provider()
    auth.render()
    auth.commit()
    queryClient.setQueryData(['private'], 'leftover-record')
    privateStore.setState({ record: 'leftover-record' })
    logoutEvents.emit()
    assert.equal(queryClient.getQueryData(['private']), undefined)
    assert.equal(privateStore.getState().record, '')
})

test('storage persistence failure cannot skip in-memory logout cleanup', async (context) => {
    const { default: consola } = await import('consola/browser')
    context.mock.method(consola, 'error', () => {})
    setToken({ token: 'first-fixture-token' })
    const auth = provider()
    auth.render()
    auth.commit()
    privateStore.setState({ record: 'first-session-record' })
    queryClient.setQueryData(['private'], 'first-session-record')
    context.mock.method(localStorage, 'setItem', () => {
        throw new Error('fixture storage failure')
    })
    logoutEvents.emit()
    assert.equal(useSessionStore.getState().token, '')
    assert.equal(privateStore.getState().record, '')
    assert.equal(queryClient.getQueryData(['private']), undefined)
    assert.equal(auth.render().isAuthenticated, false)
})

test('the production guard keeps initialization closed and follows direct token changes', () => {
    const auth = provider({ hydrating: true })
    let value = auth.render()
    const location = { pathname: ROUTES.DASHBOARD.HOME, search: '?fixture=true' }
    const returnPaths: string[] = []
    const guard = compileFunction('../guards/auth-guard.tsx', 'AuthGuard', {
        createElement,
        useAuth: () => value,
        useLocation: () => location,
        useGetAuthStatus: () => ({ isLoading: false }),
        useUpdatesStoreActions: () => ({ getRemnawaveInfo: () => {} }),
        useLayoutEffect: () => {},
        LoadingProgress: 'fixture-loader',
        Outlet: 'fixture-outlet',
        Navigate: 'fixture-navigate',
        saveReturnTo: (path: string) => returnPaths.push(path),
        consumeReturnTo: () => null,
        ROUTES
    }) as () => ReactElement<{ to?: string }>
    assert.equal(guard().type, 'fixture-loader')
    value = auth.commit()
    assert.equal(guard().props.to, ROUTES.AUTH.LOGIN)
    assert.deepEqual(returnPaths, [ROUTES.DASHBOARD.HOME + '?fixture=true'])
    setToken({ token: 'first-fixture-token' })
    value = auth.render()
    assert.equal(guard().type, 'fixture-outlet')
    removeToken()
    value = auth.render()
    assert.equal(guard().props.to, ROUTES.AUTH.LOGIN)
})

function renderHook<T>(useHook: () => T): T {
    let value!: T
    const expose = (result: T) => {
        value = result
    }
    function Harness() {
        expose(useHook())
        return null
    }
    renderToString(
        createElement(QueryClientProvider, { client: queryClient }, createElement(Harness))
    )
    return value
}

const credentials = { username: 'fixture-admin', password: 'Fixture-Password-24-Characters-1' }
const successfulLogins = [
    {
        name: 'password',
        invoke: () => renderHook(useLogin).mutateAsync({ variables: credentials })
    },
    {
        name: 'registration',
        invoke: () => renderHook(useRegister).mutateAsync({ variables: credentials })
    },
    {
        name: 'OAuth',
        invoke: () =>
            renderHook(useOauth2Callback).mutateAsync({
                variables: { provider: 'github', code: 'fixture-code', state: 'fixture-state' }
            })
    }
]

for (const login of successfulLogins) {
    test(`${login.name} real mutation authenticates through the token store without a UI setter`, async (context) => {
        context.mock.method(toast, 'success', () => 'fixture-notification')
        context.mock.method(toast, 'danger', () => 'fixture-notification')
        const auth = provider()
        auth.render()
        auth.commit()
        instance.defaults.adapter = async (config) => ({
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { response: { accessToken: 'verified-fixture-token' } }
        })
        await login.invoke()
        assert.equal(useSessionStore.getState().token, 'verified-fixture-token')
        assert.equal(auth.render().isAuthenticated, true)
        assert.equal('setIsAuthenticated' in auth.render(), false)
    })
    test(`${login.name} failure leaves the provider anonymous`, async (context) => {
        context.mock.method(toast, 'success', () => 'fixture-notification')
        context.mock.method(toast, 'danger', () => 'fixture-notification')
        const auth = provider()
        auth.render()
        auth.commit()
        instance.defaults.adapter = async () => {
            throw new Error('fixture request failed')
        }
        await assert.rejects(login.invoke())
        assert.equal(useSessionStore.getState().token, '')
        assert.equal(auth.render().isAuthenticated, false)
    })
}

function oauthCallbacks(navigations: string[]) {
    const source = readFileSync(
        new URL(
            '../../../features/auth/oauth2-login-button/model/use-oauth2-callback.ts',
            import.meta.url
        ),
        'utf8'
    )
    const file = ts.createSourceFile(
        'oauth.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    let options: ts.Expression | undefined
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(file) === 'useOauth2Callback')
            options = node.arguments[0]
        ts.forEachChild(node, visit)
    }
    visit(file)
    assert(options)
    const scope = {
        logoutEvents,
        toast: { danger: () => {} },
        navigate: (path: string) => navigations.push(path),
        consumeReturnTo: () => ROUTES.DASHBOARD.MANAGEMENT.USERS,
        ROUTES
    }
    const javascript = ts.transpileModule(`return (${options.getText(file)})`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope)) as Parameters<
        typeof useOauth2Callback
    >[0]
}

test('OAuth success preserves return-to navigation and failure clears its own session before login navigation', async () => {
    const auth = provider()
    auth.render()
    auth.commit()
    const navigations: string[] = []
    const callback = oauthCallbacks(navigations)
    const body = { provider: 'github' as const, code: 'fixture-code', state: 'fixture-state' }
    instance.defaults.adapter = async (config) => ({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { response: { accessToken: 'verified-fixture-token' } }
    })
    await renderHook(() => useOauth2Callback(callback)).mutateAsync({ variables: body })
    assert.equal(auth.render().isAuthenticated, true)
    assert.deepEqual(navigations, [ROUTES.DASHBOARD.MANAGEMENT.USERS])
    instance.defaults.adapter = async () => {
        throw new Error('fixture callback failed')
    }
    await assert.rejects(
        renderHook(() => useOauth2Callback(callback)).mutateAsync({ variables: body })
    )
    assert.equal(auth.render().isAuthenticated, false)
    assert.equal(getAuthorizationToken(), '')
    assert.deepEqual(navigations, [ROUTES.DASHBOARD.MANAGEMENT.USERS, ROUTES.AUTH.LOGIN])
})

test('a stale OAuth error cannot clear or navigate away from a replacement session', async () => {
    const auth = provider()
    auth.render()
    auth.commit()
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
        entered = resolve
    })
    let reject!: (error: Error) => void
    instance.defaults.adapter = async () => {
        entered()
        return new Promise((_resolve, fail) => {
            reject = fail
        })
    }
    const navigations: string[] = []
    const result = renderHook(() => useOauth2Callback(oauthCallbacks(navigations)))
        .mutateAsync({
            variables: { provider: 'github', code: 'fixture-code', state: 'fixture-state' }
        })
        .catch((error: unknown) => error)
    await started
    setToken({ token: 'replacement-fixture-token' })
    reject(new Error('late old-session failure'))
    assert(axios.isCancel(await result))
    assert.equal(getAuthorizationToken(), 'replacement-fixture-token')
    assert.equal(auth.render().isAuthenticated, true)
    assert.deepEqual(navigations, [])
})

for (const relative of [
    '../../../features/ui/dashboard/header-buttons/header-buttons.feature.tsx',
    '../../ui/header-buttons/LogoutControl.tsx'
]) {
    test(`${relative} routes logout through the provider exactly once`, () => {
        const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
        const file = ts.createSourceFile(
            relative,
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
        )
        let expression: ts.Expression | undefined
        const visit = (node: ts.Node) => {
            if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleLogout')
                expression = node.initializer
            ts.forEachChild(node, visit)
        }
        visit(file)
        assert(expression)
        let resets = 0
        const auth = provider({
            reset: () => {
                resets++
                resetAllStores()
            }
        })
        setToken({ token: 'first-fixture-token' })
        auth.render()
        auth.commit()
        privateStore.setState({ record: 'first-session-record' })
        queryClient.setQueryData(['private'], 'first-session-record')
        const navigations: string[] = []
        const scope = {
            logoutEvents,
            logoutFromHeader,
            navigate: (path: string) => navigations.push(path),
            ROUTES
        }
        const javascript = ts.transpileModule(`return ${expression.getText(file)}`, {
            compilerOptions: { target: ts.ScriptTarget.ES2022 }
        }).outputText
        const click = new Function(...Object.keys(scope), javascript)(
            ...Object.values(scope)
        ) as () => void
        click()
        assert.equal(resets, 1)
        assert.equal(getAuthorizationToken(), '')
        assert.equal(privateStore.getState().record, '')
        assert.equal(queryClient.getQueryData(['private']), undefined)
        assert.equal(auth.render().isAuthenticated, false)
        assert.deepEqual(navigations, [ROUTES.AUTH.LOGIN])
    })
}

for (const [name, useAuthentication] of [
    ['password', useLogin],
    ['registration', useRegister]
] as const) {
    test(`${name} owned authentication preserves a current token handoff and configured success callback`, async (context) => {
        context.mock.method(toast, 'success', () => 'fixture-notification')
        let observed = 0
        const generation = getSessionGeneration()
        instance.defaults.adapter = async (config) => ({
            config,
            status: 200,
            statusText: 'OK',
            headers: {},
            data: { response: { accessToken: 'owned-fixture-token' } }
        })
        const authentication = renderHook(() =>
            useAuthentication({
                captureOwnership: () => ({
                    isCurrent: () => getSessionGeneration() === generation
                }),
                mutationFns: {
                    onSuccess: () => {
                        observed++
                    }
                }
            })
        )
        await authentication.mutateAsync({ variables: credentials })
        assert.equal(useSessionStore.getState().token, 'owned-fixture-token')
        assert.equal(
            observed,
            1,
            'its own token installation must not cancel the admitted success batch'
        )
    })

    test(`${name} ownership invalidated before dispatch never reaches the adapter`, async () => {
        let requests = 0
        instance.defaults.adapter = async () => {
            requests++
            throw new Error('must not dispatch')
        }
        const authentication = renderHook(() =>
            useAuthentication({ captureOwnership: () => ({ isCurrent: () => false }) })
        )
        const outcome = await authentication
            .mutateAsync({ variables: credentials })
            .catch((error: unknown) => error)
        assert(axios.isCancel(outcome))
        assert.equal(requests, 0)
        assert.equal(useSessionStore.getState().token, '')
    })

    test(`${name} canceled UI cannot commit a late successful response or show global notices`, async (context) => {
        const notices: string[] = []
        context.mock.method(toast, 'success', () => {
            notices.push('success')
            return 'fixture'
        })
        context.mock.method(toast, 'danger', () => {
            notices.push('error')
            return 'fixture'
        })
        let active = true
        let entered!: () => void
        const started = new Promise<void>((resolve) => {
            entered = resolve
        })
        let respond!: () => void
        instance.defaults.adapter = async (config) => {
            entered()
            await new Promise<void>((resolve) => {
                respond = resolve
            })
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: { accessToken: 'late-fixture-token' } }
            }
        }
        const authentication = renderHook(() =>
            useAuthentication({ captureOwnership: () => ({ isCurrent: () => active }) })
        )
        const outcome = authentication
            .mutateAsync({ variables: credentials })
            .catch((error: unknown) => error)
        await started
        active = false
        respond()
        assert(axios.isCancel(await outcome))
        assert.equal(useSessionStore.getState().token, '')
        assert.deepEqual(notices, [])
    })

    test(`${name} reused variables retain separate authentication owners for concurrent attempts`, async (context) => {
        context.mock.method(toast, 'success', () => 'fixture-notification')
        let currentAttempt = 1
        const responders: (() => void)[] = []
        let entered!: () => void
        const started = new Promise<void>((resolve) => {
            entered = resolve
        })
        let enteredFirst!: () => void
        const firstStarted = new Promise<void>((resolve) => {
            enteredFirst = resolve
        })
        instance.defaults.adapter = async (config) => {
            await new Promise<void>((resolve) => {
                responders.push(resolve)
                if (responders.length === 1) enteredFirst()
                if (responders.length === 2) entered()
            })
            return {
                config,
                status: 200,
                statusText: 'OK',
                headers: {},
                data: { response: { accessToken: 'current-fixture-token' } }
            }
        }
        const authentication = renderHook(() =>
            useAuthentication({
                captureOwnership: () => {
                    const attempt = currentAttempt
                    return { isCurrent: () => attempt === currentAttempt }
                }
            })
        )
        const reused = { variables: credentials }
        const old = authentication.mutateAsync(reused).catch((error: unknown) => error)
        // Let the first attempt enter transport before replacing it.
        await firstStarted
        currentAttempt++
        const current = authentication.mutateAsync(reused)
        await started
        responders[0]()
        assert(axios.isCancel(await old))
        assert.equal(useSessionStore.getState().token, '')
        responders[1]()
        await current
        assert.equal(useSessionStore.getState().token, 'current-fixture-token')
    })
}
