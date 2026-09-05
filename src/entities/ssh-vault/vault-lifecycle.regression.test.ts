import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'

Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } }
})

const { instance, setAuthorizationToken, getAuthorizationToken } =
    await import('../../shared/api/axios.ts')
const { logoutEvents } = await import('../../shared/emitters/emit-logout.ts')
const { useSshVaultStore } = await import('./use-ssh-vault-store.ts')
const { deriveKeyEncryptionKey, encrypt, importDataKey } = await import('./ssh-crypto.ts')
const { encodeVaultFile, padPayload, vaultFileAad } = await import('./vault-backup-file.ts')

// Public BIP-39 test vector and invented key material; never reads browser/user storage.
const phrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const raw = new Uint8Array(32).fill(7)
const wrappedDataKey = await encrypt(await deriveKeyEncryptionKey(phrase), raw, 'rw-vault-v1')
const meta = { id: 'vault', version: 1, createdAt: '2026-09-05T00:00:00.000Z', wrappedDataKey }
const dataKey = await importDataKey(raw)
const originalIndexedDb = globalThis.indexedDB
const originalAdapter = instance.defaults.adapter
const actions = () => useSshVaultStore.getState().actions

function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

function memoryDatabase() {
    const stores = new Map<string, Map<string, unknown>>()
    const effects: string[] = []
    let pause: null | {
        store: string
        method: string
        entered: ReturnType<typeof deferred>
        release: ReturnType<typeof deferred>
    } = null
    const table = (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map())
        return stores.get(name)!
    }
    const request = (store: string, method: string, work: () => unknown) => {
        const result: {
            result?: unknown
            onsuccess?: () => void
            onerror?: () => void
            error?: unknown
        } = {}
        queueMicrotask(async () => {
            if (pause?.store === store && pause.method === method) {
                const pending = pause
                pause = null
                pending.entered.resolve()
                await pending.release.promise
            }
            try {
                result.result = work()
                effects.push(`${store}:${method}`)
                result.onsuccess?.()
            } catch (error) {
                result.error = error
                result.onerror?.()
            }
        })
        return result
    }
    return {
        effects,
        table,
        pause(store: string, method: string) {
            const pending = { store, method, entered: deferred(), release: deferred() }
            pause = pending
            return pending
        },
        api: {
            open: () =>
                request('', 'open', () => ({
                    close() {},
                    transaction: (name: string) => ({
                        objectStore: () => ({
                            get: (key: string) =>
                                request(name, 'get', () => structuredClone(table(name).get(key))),
                            getAll: () =>
                                request(name, 'getAll', () =>
                                    structuredClone([...table(name).values()])
                                ),
                            put: (record: Record<string, unknown>, key?: string) =>
                                request(name, 'put', () =>
                                    table(name).set(
                                        key ?? String(record.id ?? record.nodeUuid),
                                        structuredClone(record)
                                    )
                                ),
                            add: (record: unknown, key: string) =>
                                request(name, 'add', () => {
                                    if (table(name).has(key))
                                        throw new Error('Fixture duplicate key')
                                    table(name).set(key, record)
                                }),
                            delete: (key: string) =>
                                request(name, 'delete', () => table(name).delete(key)),
                            clear: () => request(name, 'clear', () => table(name).clear())
                        })
                    })
                })),
            deleteDatabase: () => request('', 'destroy', () => stores.clear())
        }
    }
}

let db: ReturnType<typeof memoryDatabase>
beforeEach(() => {
    actions().lock()
    setAuthorizationToken('vault-first-session')
    db = memoryDatabase()
    db.table('meta').set('vault', structuredClone(meta))
    Object.assign(globalThis, { indexedDB: db.api })
    // OPRF fixture server key = 1: the valid blinded group element is returned unchanged.
    instance.defaults.adapter = async (config) => ({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { response: { evaluated: JSON.parse(config.data as string).blinded } }
    })
})
after(() => {
    actions().lock()
    raw.fill(0)
    instance.defaults.adapter = originalAdapter
    setAuthorizationToken('')
    Object.assign(globalThis, { indexedDB: originalIndexedDb })
})

function assertLocked() {
    assert.equal(useSshVaultStore.getState().status, 'locked')
    assert.equal(useSshVaultStore.getState().dataKey, null)
    assert.equal(useSshVaultStore.getState().indexKey, null)
}

test('logout cancels pending seed unlock before any key state can be restored', async () => {
    const pending = db.pause('meta', 'get')
    const unlock = actions().unlock(phrase)
    await pending.entered.promise
    logoutEvents.emit()
    assertLocked()
    pending.release.resolve()
    assert.equal(await unlock, false)
    assertLocked()
})

test('token replacement locks an unlocked vault immediately without clearing the new token', async () => {
    assert.equal(await actions().unlock(phrase), true)
    setAuthorizationToken('vault-second-session')
    assertLocked()
    assert.equal(getAuthorizationToken(), 'vault-second-session')
})

test('a private-key read cannot return decrypted key material after a lock', async () => {
    db.table('keys').set('fixture-node', {
        nodeUuid: 'fixture-node',
        publicKey: 'fixture-public',
        algo: 'ssh-ed25519',
        encryptedPrivateKey: await encrypt(
            dataKey,
            new Uint8Array(32).fill(9),
            'ssh-node-key:fixture-node:ssh-ed25519:fixture-public'
        )
    })
    assert.equal(await actions().unlock(phrase), true)
    const pending = db.pause('keys', 'get')
    const read = actions().getPrivateKey('fixture-node')
    await pending.entered.promise
    actions().lock()
    pending.release.resolve()
    assert.equal(await read, null)
    assertLocked()
})

test('profile and snippet reads drop stale plaintext rather than repopulating a new session', async () => {
    const profile = {
        nodeUuid: 'fixture-node',
        host: 'fixture.example',
        port: 22,
        username: 'fixture-user'
    }
    db.table('profiles').set('fixture-node', {
        nodeUuid: 'fixture-node',
        payload: await encrypt(
            dataKey,
            new TextEncoder().encode(JSON.stringify(profile)),
            'ssh-profile:fixture-node'
        )
    })
    db.table('snippets').set('fixture-snippet', {
        id: 'fixture-snippet',
        createdAt: meta.createdAt,
        payload: await encrypt(
            dataKey,
            new TextEncoder().encode(
                JSON.stringify({ name: 'Fixture', command: 'printf fixture' })
            ),
            'ssh-snippet:fixture-snippet'
        )
    })
    for (const read of [
        {
            store: 'profiles',
            method: 'get',
            invoke: () => actions().getProfile('fixture-node'),
            expected: null
        },
        {
            store: 'profiles',
            method: 'getAll',
            invoke: () => actions().listProfiles(),
            expected: []
        },
        {
            store: 'snippets',
            method: 'getAll',
            invoke: () => actions().listSnippets(),
            expected: []
        }
    ]) {
        assert.equal(await actions().unlock(phrase), true)
        const pending = db.pause(read.store, read.method)
        const result = read.invoke()
        await pending.entered.promise
        logoutEvents.emit()
        pending.release.resolve()
        assert.deepEqual(await result, read.expected)
        assertLocked()
    }
})

test('a pending export or metadata refresh cannot publish into a replacement session', async () => {
    assert.equal(await actions().unlock(phrase), true)
    const exporting = db.pause('keys', 'getAll')
    const backup = actions()
        .exportVault()
        .catch((error: unknown) => error)
    await exporting.entered.promise
    setAuthorizationToken('vault-second-session')
    exporting.release.resolve()
    assert((await backup) instanceof Error)
    assertLocked()
    db.table('meta').clear()
    const refreshing = db.pause('meta', 'get')
    const refresh = actions().refresh()
    await refreshing.entered.promise
    actions().lock()
    refreshing.release.resolve()
    await refresh
    assertLocked()
})

test('reset drops live keys synchronously and cannot be undone by a pending unlock', async () => {
    assert.equal(await actions().unlock(phrase), true)
    const pending = db.pause('', 'destroy')
    const reset = actions().reset()
    assert.equal(useSshVaultStore.getState().dataKey, null)
    await pending.entered.promise
    actions().lock()
    pending.release.resolve()
    await reset
    assertLocked()
})

test('a locked create completion cannot reactivate generated keys', async () => {
    db.table('meta').clear()
    const pending = db.pause('meta', 'put')
    const created = actions()
        .create(phrase, 'testPinA')
        .catch((error: unknown) => error)
    await pending.entered.promise
    actions().lock()
    pending.release.resolve()
    assert((await created) instanceof Error)
    assertLocked()
})

test('a locked backup import cannot reactivate the recovered keys', async () => {
    const backup = encodeVaultFile({
        createdAt: meta.createdAt,
        wrappedDataKey,
        payload: await encrypt(
            dataKey,
            padPayload(new TextEncoder().encode(JSON.stringify({ keys: [], hosts: [] }))),
            vaultFileAad(meta.createdAt, wrappedDataKey)
        )
    })
    const pending = db.pause('meta', 'put')
    const restored = actions().importVault(backup, phrase)
    await pending.entered.promise
    actions().lock()
    pending.release.resolve()
    assert.equal(await restored, false)
    assertLocked()
})

test('a canceled PIN unlock cannot publish keys or spend another session attempt', async () => {
    await actions().create(phrase, 'testPinA')
    actions().lock()
    const before = structuredClone(db.table('meta').get('vault'))
    const pending = db.pause('meta', 'get')
    const unlock = actions().unlockWithPasscode('wrongPin')
    await pending.entered.promise
    setAuthorizationToken('vault-second-session')
    pending.release.resolve()
    assert.equal(await unlock, false)
    assertLocked()
    assert.deepEqual(db.table('meta').get('vault'), before)
})

test('concurrent wrong PIN submissions retain the original three-attempt limit', async () => {
    await actions().create(phrase, 'testPinA')
    actions().lock()
    const results = await Promise.all([
        actions().unlockWithPasscode('wrongPin'),
        actions().unlockWithPasscode('wrongPin'),
        actions().unlockWithPasscode('wrongPin')
    ])
    assert.deepEqual(results, [false, false, false])
    assert.equal(useSshVaultStore.getState().passcodeAttemptsLeft, 0)
    assert.equal(useSshVaultStore.getState().hasPasscode, false)
    assert.equal(await actions().unlockWithPasscode('testPinA'), false)
    assert.equal(await actions().unlock(phrase), true)
})

test('reset drains an already-started encrypted write before deleting the vault', async () => {
    assert.equal(await actions().unlock(phrase), true)
    const pending = db.pause('profiles', 'put')
    const writing = actions()
        .saveProfile({
            nodeUuid: 'fixture-node',
            host: 'fixture.example',
            port: 22,
            username: 'fixture-user'
        })
        .catch((error: unknown) => error)
    await pending.entered.promise
    const resetting = actions().reset()
    assert.equal(useSshVaultStore.getState().dataKey, null)
    pending.release.resolve()
    assert((await writing) instanceof Error)
    await resetting
    assert.equal(db.table('profiles').size, 0)
    assert.equal(db.table('meta').size, 0)
    assert.equal(useSshVaultStore.getState().status, 'absent')
    assert.equal(useSshVaultStore.getState().dataKey, null)
})

test('successful create/PIN/key/profile/snippet/backup recovery remains functional', async () => {
    await actions().create(phrase, 'testPinA')
    const keyInfo = await actions().ensureNodeKey('fixture-node')
    const originalKey = await actions().getPrivateKey('fixture-node')
    assert(originalKey)
    await actions().saveProfile({
        nodeUuid: 'fixture-node',
        host: 'fixture.example',
        port: 22,
        username: 'fixture-user'
    })
    await actions().saveSnippet({
        id: 'fixture-snippet',
        name: 'Fixture command',
        command: 'printf fixture'
    })
    await actions().rememberHost('fixture.example:22', 'ssh-ed25519', 'SHA256:fixture')
    actions().lock()
    assert.equal(await actions().unlockWithPasscode('testPinA'), true)
    assert.equal(await actions().getNodePublicKey('fixture-node'), keyInfo.publicKey)
    assert.equal((await actions().getProfile('fixture-node'))?.username, 'fixture-user')
    assert.equal((await actions().listProfiles()).length, 1)
    assert.equal((await actions().listSnippets())[0].command, 'printf fixture')
    assert.equal(await actions().trustedFingerprint('fixture.example:22'), 'SHA256:fixture')
    const backup = await actions().exportVault()
    await actions().reset()
    assert.equal(await actions().importVault(backup, phrase), true)
    const restoredKey = await actions().getPrivateKey('fixture-node')
    assert(restoredKey)
    assert.deepEqual(restoredKey.material, originalKey.material)
    originalKey.material.fill(0)
    restoredKey.material.fill(0)
    assert.equal((await actions().listProfiles()).length, 1)
    assert.equal((await actions().listSnippets()).length, 1)
    await actions().setPasscode('testPinB')
    actions().lock()
    assert.equal(await actions().unlockWithPasscode('testPinB'), true)
})
