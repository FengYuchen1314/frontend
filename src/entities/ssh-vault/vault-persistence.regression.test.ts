import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, test } from 'node:test'

Object.assign(globalThis, {
    __DOMAIN_BACKEND__: 'https://panel.example',
    __NODE_ENV__: 'production',
    __DOMAIN_OVERRIDE__: '0',
    window: { location: { origin: 'https://panel.example' } }
})

const { setAuthorizationToken } = await import('../../shared/api/axios.ts')
const { useSshVaultStore } = await import('./use-ssh-vault-store.ts')
const { destroyVault, getVaultMeta, putVaultMeta } = await import('./ssh-vault.db.ts')
const { deriveKeyEncryptionKey, encrypt, importDataKey } = await import('./ssh-crypto.ts')
const { encodeVaultFile, padPayload, vaultFileAad } = await import('./vault-backup-file.ts')

// In-memory IndexedDB implementation, public BIP-39 vector, invented encrypted fixtures.
// These tests never open browser storage and do not constitute native-browser verification.
const phrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const raw = new Uint8Array(32).fill(7)
const wrappedDataKey = await encrypt(await deriveKeyEncryptionKey(phrase), raw, 'rw-vault-v1')
const dataKey = await importDataKey(raw)
const meta = { version: 1 as const, createdAt: '2026-09-05T00:00:00.000Z', wrappedDataKey }
const names = ['meta', 'keys', 'hosts', 'profiles', 'snippets', 'device']
const originalIndexedDb = globalThis.indexedDB
const originalPut = IDBObjectStore.prototype.put
const originalClear = IDBObjectStore.prototype.clear
let factory: IDBFactory
const actions = () => useSshVaultStore.getState().actions

function openFixture(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open('rw-vault', 2)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function snapshot() {
    const db = await openFixture()
    try {
        return await new Promise<Record<string, unknown[]>>((resolve, reject) => {
            const result: Record<string, unknown[]> = {}
            const transaction = db.transaction(names, 'readonly')
            transaction.oncomplete = () => resolve(result)
            transaction.onabort = () => reject(transaction.error)
            for (const name of names) {
                const request = transaction.objectStore(name).getAll()
                request.onsuccess = () => {
                    result[name] = request.result
                }
            }
        })
    } finally {
        db.close()
    }
}

beforeEach(async () => {
    actions().lock()
    setAuthorizationToken('vault-persistence-fixture-session')
    factory = new IDBFactory()
    Object.assign(globalThis, { indexedDB: factory })
    await putVaultMeta(meta)
    const db = await openFixture()
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(names, 'readwrite')
            tx.oncomplete = () => resolve()
            tx.onabort = () => reject(tx.error)
            tx.objectStore('keys').put({ nodeUuid: 'old-node', payload: wrappedDataKey })
            tx.objectStore('hosts').put({ id: 'old-host', payload: wrappedDataKey })
            tx.objectStore('profiles').put({ nodeUuid: 'old-profile', payload: wrappedDataKey })
            tx.objectStore('snippets').put({ id: 'old-snippet', payload: wrappedDataKey })
            tx.objectStore('device').put(dataKey, 'device')
        })
    } finally {
        db.close()
    }
})

afterEach(() => {
    IDBObjectStore.prototype.put = originalPut
    IDBObjectStore.prototype.clear = originalClear
    actions().lock()
})

after(() => {
    raw.fill(0)
    setAuthorizationToken('')
    Object.assign(globalThis, { indexedDB: originalIndexedDb })
})

for (const event of ['blocked', 'error'] as const) {
    test(`reset cannot report success with retained data when database deletion is ${event}`, async () => {
        // Simulate the former deleteDatabase failure; the safe implementation must not
        // leave an uncancellable pending deletion capable of erasing a future vault.
        let deletes = 0
        Object.assign(globalThis, {
            indexedDB: {
                open: factory.open.bind(factory),
                deleteDatabase: () => {
                    deletes++
                    const request: { onblocked?: () => void; onerror?: () => void } = {}
                    queueMicrotask(() => request[event === 'blocked' ? 'onblocked' : 'onerror']?.())
                    return request
                }
            }
        })
        await actions().reset()
        assert.equal(await getVaultMeta(), undefined)
        assert.equal(deletes, 0, 'reset must not schedule a deferred physical deletion')
        assert.equal(useSshVaultStore.getState().status, 'absent')
        const contents = await snapshot()
        for (const records of Object.values(contents)) assert.deepEqual(records, [])
    })
}

test('a successful write request followed by transaction abort rejects and preserves old metadata', async () => {
    const before = await snapshot()
    IDBObjectStore.prototype.put = function (value, key) {
        const request =
            key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
        request.addEventListener('success', () => this.transaction.abort())
        return request
    }
    await assert.rejects(putVaultMeta({ ...meta, createdAt: 'rejected-replacement' }))
    assert.deepEqual(await snapshot(), before)
})

test('backup restore rolls back every collection and the device key after a later write fails', async () => {
    const before = await snapshot()
    const backup = encodeVaultFile({
        ...meta,
        payload: await encrypt(
            dataKey,
            padPayload(
                new TextEncoder().encode(
                    JSON.stringify({
                        keys: [
                            {
                                nodeUuid: 'new-node',
                                publicKey: 'fixture-key',
                                encryptedPrivateKey: wrappedDataKey
                            }
                        ],
                        hosts: [{ id: 'new-host', payload: wrappedDataKey }],
                        snippets: [{ id: 'new-snippet', payload: wrappedDataKey }],
                        profiles: [{ nodeUuid: 'new-profile', payload: wrappedDataKey }]
                    })
                )
            ),
            vaultFileAad(meta.createdAt, wrappedDataKey)
        )
    })
    IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === 'profiles')
            throw new DOMException('Fixture cloning failure', 'DataCloneError')
        return key === undefined
            ? originalPut.call(this, value)
            : originalPut.call(this, value, key)
    }
    await assert.rejects(actions().importVault(backup, phrase), /Fixture cloning failure/)
    assert.deepEqual(await snapshot(), before)
    assert.equal(useSshVaultStore.getState().dataKey, null)
})

test('reset resolves only after all six stores commit, even with another connection open', async () => {
    const otherTab = await openFixture()
    let committed = false
    let settled = false
    let requests = 0
    IDBObjectStore.prototype.clear = function () {
        const transaction = this.transaction
        assert.deepEqual([...transaction.objectStoreNames].sort(), [...names].sort())
        const request = originalClear.call(this)
        request.addEventListener('success', () => {
            requests++
            assert.equal(settled, false)
            assert.equal(useSshVaultStore.getState().status, 'locked')
        })
        if (this.name === 'device')
            transaction.addEventListener('complete', () => {
                committed = true
            })
        return request
    }
    try {
        await actions()
            .reset()
            .then(() => {
                settled = true
            })
        assert.equal(requests, 6)
        assert.equal(committed, true)
        assert.equal(useSshVaultStore.getState().status, 'absent')
        for (const records of Object.values(await snapshot())) assert.deepEqual(records, [])
    } finally {
        otherTab.close()
    }
})

test('reset abort preserves all stores and never advertises an absent vault', async () => {
    const before = await snapshot()
    assert.equal(await actions().unlock(phrase), true)
    IDBObjectStore.prototype.clear = function () {
        const request = originalClear.call(this)
        if (this.name === 'device')
            request.addEventListener('success', () => this.transaction.abort())
        return request
    }
    const resetting = actions().reset()
    assert.equal(useSshVaultStore.getState().dataKey, null)
    await assert.rejects(resetting)
    assert.equal(useSshVaultStore.getState().status, 'locked')
    assert.deepEqual(await snapshot(), before)
})

test('an asynchronous restore constraint error rolls back and keeps the existing unlocked key', async () => {
    const before = await snapshot()
    assert.equal(await actions().unlock(phrase), true)
    const oldKey = useSshVaultStore.getState().dataKey
    const backup = encodeVaultFile({
        ...meta,
        payload: await encrypt(
            dataKey,
            padPayload(
                new TextEncoder().encode(
                    JSON.stringify({
                        keys: [],
                        hosts: [],
                        profiles: [{ nodeUuid: 'new-profile', payload: wrappedDataKey }]
                    })
                )
            ),
            vaultFileAad(meta.createdAt, wrappedDataKey)
        )
    })
    IDBObjectStore.prototype.put = function (value, key) {
        const request =
            key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
        if (this.name === 'profiles') this.add(value)
        return request
    }
    await assert.rejects(actions().importVault(backup, phrase), { name: 'ConstraintError' })
    assert.deepEqual(await snapshot(), before)
    assert.equal(useSshVaultStore.getState().status, 'unlocked')
    assert.equal(useSshVaultStore.getState().dataKey, oldKey)
})

test('successful encrypted restore commits before unlocking and removes the old device key', async () => {
    let committed = false
    const createdAt = '2026-09-06T00:00:00.000Z'
    const backup = encodeVaultFile({
        createdAt,
        wrappedDataKey,
        payload: await encrypt(
            dataKey,
            padPayload(new TextEncoder().encode(JSON.stringify({ keys: [], hosts: [] }))),
            vaultFileAad(createdAt, wrappedDataKey)
        )
    })
    IDBObjectStore.prototype.put = function (value, key) {
        const request =
            key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
        if (this.name === 'meta') {
            request.addEventListener('success', () => {
                assert.equal(useSshVaultStore.getState().dataKey, null)
                assert.equal(committed, false)
            })
            this.transaction.addEventListener('complete', () => {
                committed = true
            })
        }
        return request
    }
    assert.equal(await actions().importVault(backup, phrase), true)
    assert.equal(committed, true)
    assert.equal(useSshVaultStore.getState().status, 'unlocked')
    const contents = await snapshot()
    assert.deepEqual(contents.meta, [{ ...meta, createdAt, id: 'vault' }])
    for (const name of names.filter((name) => name !== 'meta')) assert.deepEqual(contents[name], [])
})

test('blocked database open fails explicitly and closes a simulated late connection', async () => {
    let closed = false
    const request: { onblocked?: () => void; onsuccess?: () => void; result?: unknown } = {}
    Object.assign(globalThis, {
        indexedDB: {
            open: () => {
                queueMicrotask(() => request.onblocked?.())
                return request
            }
        }
    })
    await assert.rejects(destroyVault(), /database is blocked/)
    request.result = {
        close: () => {
            closed = true
        },
        transaction: () => assert.fail('late open must not clear data')
    }
    request.onsuccess?.()
    assert.equal(closed, true)
})

test('a blocked schema upgrade is canceled when the older connection eventually closes', async () => {
    factory = new IDBFactory()
    Object.assign(globalThis, { indexedDB: factory })
    const older = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('rw-vault', 1)
        request.onupgradeneeded = () => {
            request.result
                .createObjectStore('meta', { keyPath: 'id' })
                .put({ ...meta, id: 'vault' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    try {
        await assert.rejects(getVaultMeta(), /database is blocked/)
    } finally {
        older.close()
    }
    // This open queues behind the previously blocked request. Its upgrade must
    // abort rather than silently run after the caller has already seen failure.
    const reopened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('rw-vault', 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    try {
        assert.equal(reopened.version, 1)
        assert.deepEqual([...reopened.objectStoreNames], ['meta'])
    } finally {
        reopened.close()
    }
})
