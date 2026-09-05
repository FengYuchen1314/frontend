import { isCancel } from 'axios'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

import { InactiveSessionError } from '@shared/api/session-request-boundary'

import { createPasskeyLoginFlow } from './passkey-login-flow'

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

// Execute the production click handler against controlled network/credential boundaries.
// This deliberately does not claim to exercise a real hardware authenticator or a DOM.
function handler(scope: Record<string, unknown>): () => Promise<void> {
    const getGeneration = scope.getSessionGeneration as () => number
    scope.flow = createPasskeyLoginFlow({
        getGeneration,
        assertGeneration: (expected) => {
            if (expected !== getGeneration()) throw new InactiveSessionError()
        }
    })
    scope.isCancel = isCancel
    scope.setToken ??= () => {}
    const source = readFileSync(
        new URL('./passkey-login-button.feature.tsx', import.meta.url),
        'utf8'
    )
    const file = ts.createSourceFile(
        'passkey.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    let declaration: ts.VariableDeclaration | undefined
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handlePasskeyLogin')
            declaration = node
        ts.forEachChild(node, visit)
    }
    visit(file)
    assert(declaration?.initializer)
    const javascript = ts.transpileModule(`return ${declaration.initializer.getText(file)}`, {
        compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 }
    }).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope))
}

test('a session change during the authenticator prompt must not submit its old assertion', async () => {
    const entered = deferred<void>()
    const credentials = deferred<object>()
    let generation = 0
    let verified = 0
    const click = handler({
        setIsLoading: () => {},
        refetch: async () => ({ data: { challenge: 'fixture' }, isError: false }),
        startAuthentication: async () => {
            entered.resolve()
            return credentials.promise
        },
        verifyAuthentication: async () => {
            verified++
            return { accessToken: 'fixture-token' }
        },
        notifications: { show: () => {} },
        getSessionGeneration: () => generation,
        assertSessionGeneration: (expected: number) => {
            assert.equal(expected, generation)
        }
    })
    const pending = click()
    await entered.promise
    generation++
    credentials.resolve({ id: 'old-credential' })
    await pending
    assert.equal(verified, 0, 'the old WebAuthn assertion crossed into the replacement session')
})

test('failed options refetch must not reuse cached options or open the authenticator', async () => {
    let opened = 0
    const click = handler({
        setIsLoading: () => {},
        refetch: async () => ({
            data: { challenge: 'previous-challenge' },
            isError: true,
            error: new Error('network failed')
        }),
        startAuthentication: async () => {
            opened++
            return { id: 'fixture' }
        },
        verifyAuthentication: async () => ({ accessToken: 'fixture-token' }),
        notifications: { show: () => {} },
        getSessionGeneration: () => 0,
        assertSessionGeneration: () => {}
    })
    await click()
    assert.equal(opened, 0, 'a failed query reused a cached WebAuthn challenge')
})

test('a current successful production click commits its verified token exactly once', async () => {
    const events: string[] = []
    let generation = 0
    const click = handler({
        setIsLoading: (value: boolean) => events.push(`loading:${value}`),
        refetch: async () => ({ data: { challenge: 'fixture' }, isError: false }),
        startAuthentication: async () => ({ id: 'fixture' }),
        verifyAuthentication: async () => ({ accessToken: 'verified-token' }),
        setToken: ({ token }: { token: string }) => {
            generation++
            events.push(token)
        },
        notifications: { show: () => events.push('success-notice') },
        getSessionGeneration: () => generation
    })
    await click()
    assert.deepEqual(events, [
        'loading:true',
        'loading:false',
        'verified-token',
        'success-notice',
        'loading:false'
    ])
})

for (const stage of ['options', 'authenticator', 'verification'] as const) {
    test(`unmount or workflow invalidation during ${stage} cannot publish credentials`, async () => {
        const pending = deferred<object>()
        const entered = deferred<void>()
        const flow = createPasskeyLoginFlow({ getGeneration: () => 0, assertGeneration: () => {} })
        const events: string[] = []
        const at = async (name: string) => {
            events.push(name)
            if (name === stage) {
                entered.resolve()
                return pending.promise
            }
            return {}
        }
        const result = flow
            .run({
                getOptions: () => at('options'),
                authenticate: () => at('authenticator'),
                verify: () => at('verification'),
                onSuccess: () => events.push('committed'),
                onSettled: () => events.push('settled')
            })
            .catch((error: unknown) => error)
        await entered.promise
        flow.invalidate()
        pending.resolve({})
        assert(isCancel(await result))
        assert.equal(events.at(-1), stage)
        assert(!events.includes('committed'))
        assert(!events.includes('settled'), 'unmounted view must not receive state updates')
    })
}

test('a replacement attempt owns loading state and cannot be completed by the older prompt', async () => {
    const pending = deferred<object>()
    const entered = deferred<void>()
    const flow = createPasskeyLoginFlow({ getGeneration: () => 0, assertGeneration: () => {} })
    const events: string[] = []
    const old = flow
        .run({
            getOptions: async () => ({}),
            authenticate: async () => {
                entered.resolve()
                return pending.promise
            },
            verify: async () => {
                events.push('old-verify')
                return {}
            },
            onSuccess: () => events.push('old-commit'),
            onSettled: () => events.push('old-settle')
        })
        .catch((error: unknown) => error)
    await entered.promise
    await flow.run({
        getOptions: async () => ({}),
        authenticate: async () => ({}),
        verify: async () => ({}),
        onSuccess: () => events.push('new-commit'),
        onSettled: () => events.push('new-settle')
    })
    pending.resolve({})
    assert(isCancel(await old))
    assert.deepEqual(events, ['new-commit', 'new-settle'])
})

test('ordinary current authenticator cancellation keeps the existing user notification and cleanup', async () => {
    const events: string[] = []
    const click = handler({
        setIsLoading: (value: boolean) => events.push(`loading:${value}`),
        refetch: async () => ({ data: { challenge: 'fixture' }, isError: false }),
        startAuthentication: async () => {
            throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' })
        },
        verifyAuthentication: async () => {
            throw new Error('must not verify')
        },
        notifications: { show: ({ message }: { message: string }) => events.push(message) },
        getSessionGeneration: () => 0
    })
    await click()
    assert.deepEqual(events, ['loading:true', 'loading:false', 'Authentication was cancelled'])
})

test('the component invalidates on unmount and session changes; only the owned flow commits the passkey token', () => {
    const component = readFileSync(
        new URL('./passkey-login-button.feature.tsx', import.meta.url),
        'utf8'
    )
    assert.match(component, /subscribeSessionChanges\(/)
    assert.match(component, /unsubscribe\(\)\s+invalidate\(\)/)
    const api = readFileSync(
        new URL('../../../shared/api/hooks/auth/auth.hooks.ts', import.meta.url),
        'utf8'
    )
    const verifyHook = api.slice(api.indexOf('export const usePasskeyAuthenticationVerify'))
    assert.doesNotMatch(verifyHook, /setToken\(/)
})

test('the production effect clears mounted loading on session changes without aborting another ceremony', () => {
    const source = readFileSync(
        new URL('./passkey-login-button.feature.tsx', import.meta.url),
        'utf8'
    )
    const file = ts.createSourceFile(
        'passkey.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    let effect: ts.Expression | undefined
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect')
            effect = node.arguments[0]
        ts.forEachChild(node, visit)
    }
    visit(file)
    assert(effect)
    let listener: (() => void) | undefined
    const events: string[] = []
    const scope = {
        flow: { invalidate: () => events.push('invalidated') },
        setIsLoading: (value: boolean) => events.push(`loading:${value}`),
        subscribeSessionChanges: (callback: () => void) => {
            listener = callback
            return () => {
                listener = undefined
                events.push('unsubscribed')
            }
        },
        WebAuthnAbortService: { cancelCeremony: () => events.push('unrelated-ceremony-aborted') }
    }
    const javascript = ts.transpileModule(`return ${effect.getText(file)}`, {
        compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const mount = new Function(...Object.keys(scope), javascript)(
        ...Object.values(scope)
    ) as () => () => void
    const cleanup = mount()
    listener?.()
    assert.deepEqual(events, ['invalidated', 'loading:false'])
    cleanup()
    assert.equal(listener, undefined)
    assert.deepEqual(events, ['invalidated', 'loading:false', 'unsubscribed', 'invalidated'])
    assert.match(source, /loading=\{isLoading\}/)
    assert.doesNotMatch(source, /isLoading\s*\|\|\s*isPending/)
})
