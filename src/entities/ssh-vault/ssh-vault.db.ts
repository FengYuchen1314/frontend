import type { IEncryptedBlob } from './ssh-crypto'
import type { TSshKeyAlgo } from './ssh-private-key'

import { generateDeviceKey } from './ssh-crypto'

const DB_NAME = 'rw-vault'
const DB_VERSION = 2
const STORE_META = 'meta'
const STORE_KEYS = 'keys'
const STORE_HOSTS = 'hosts'
const STORE_DEVICE = 'device'
const STORE_PROFILES = 'profiles'
const STORE_SNIPPETS = 'snippets'
const META_ID = 'vault'
const ALL_STORES = [
    STORE_META,
    STORE_KEYS,
    STORE_HOSTS,
    STORE_PROFILES,
    STORE_SNIPPETS,
    STORE_DEVICE
]

export interface IVaultMeta {
    createdAt: string
    id: typeof META_ID
    passcode?: {
        attempts: number
        length: number
        salt: string
        wrapped: IEncryptedBlob
    }
    version: 1
    wrappedDataKey: IEncryptedBlob
}

export interface ISnippetRecord {
    createdAt: string
    id: string
    payload: IEncryptedBlob
}

export interface IConnectionProfile {
    host: string
    lastUsedAt: string
    nodeUuid: string
    port: number
    username: string
}

export interface IConnectionProfileRecord {
    nodeUuid: string
    payload: IEncryptedBlob
}

export interface INodeKeyRecord {
    algo?: TSshKeyAlgo
    createdAt: string
    encryptedPrivateKey: IEncryptedBlob
    imported?: boolean
    nodeUuid: string
    publicKey: string
}

export interface IKnownHost {
    addedAt: string
    algo: string
    fingerprint: string
    target: string
}

export interface IKnownHostRecord {
    id: string
    payload: IEncryptedBlob
}

export interface IVaultRestoreRecords {
    hosts: IKnownHostRecord[]
    keys: INodeKeyRecord[]
    profiles?: IConnectionProfileRecord[]
    snippets?: ISnippetRecord[]
}

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        let canceled = false

        request.onblocked = () => {
            canceled = true
            reject(new Error('Vault database is blocked. Close other vault tabs and retry.'))
        }

        request.onupgradeneeded = () => {
            if (canceled) {
                request.transaction?.abort()
                return
            }
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'id' })
            }
            if (!db.objectStoreNames.contains(STORE_KEYS)) {
                db.createObjectStore(STORE_KEYS, { keyPath: 'nodeUuid' })
            }
            if (!db.objectStoreNames.contains(STORE_HOSTS)) {
                db.createObjectStore(STORE_HOSTS, { keyPath: 'id' })
            }
            if (!db.objectStoreNames.contains(STORE_DEVICE)) {
                db.createObjectStore(STORE_DEVICE)
            }
            if (!db.objectStoreNames.contains(STORE_PROFILES)) {
                db.createObjectStore(STORE_PROFILES, { keyPath: 'nodeUuid' })
            }
            if (!db.objectStoreNames.contains(STORE_SNIPPETS)) {
                db.createObjectStore(STORE_SNIPPETS, { keyPath: 'id' })
            }
        }

        request.onsuccess = () => {
            const db = request.result
            db.onversionchange = () => db.close()
            // A blocked open cannot be canceled. Do not retain a late connection.
            if (canceled) db.close()
            else resolve(db)
        }
        request.onerror = () => reject(request.error)
    })
}

async function transact<T>(
    stores: string | string[],
    mode: IDBTransactionMode,
    action: (transaction: IDBTransaction) => T
): Promise<T> {
    const db = await open()

    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(stores, mode)
            let result: T
            let failure: unknown
            // Request success is not commit: a later request or storage failure can
            // still abort the entire transaction. Settle only at its terminal event.
            transaction.oncomplete = () => resolve(result)
            transaction.onabort = () =>
                reject(failure ?? transaction.error ?? new Error('Vault transaction aborted'))
            transaction.onerror = (event) => {
                failure ??= (event.target as IDBRequest).error
            }
            try {
                result = action(transaction)
            } catch (error) {
                failure = error
                // A synchronous DataCloneError must roll back already queued clears/puts.
                transaction.abort()
            }
        })
    } finally {
        db.close()
    }
}

async function run<T>(
    store: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
    const request = await transact(store, mode, (transaction) =>
        action(transaction.objectStore(store))
    )
    return request.result
}

// Keep the empty schema. deleteDatabase can remain blocked and later delete a
// newly created vault; clearing every store atomically has no deferred deletion.
export const destroyVault = (): Promise<void> => clearVault()

export const getVaultMeta = () =>
    run<IVaultMeta | undefined>(STORE_META, 'readonly', (store) => store.get(META_ID))

export const putVaultMeta = (meta: Omit<IVaultMeta, 'id'>) =>
    run(STORE_META, 'readwrite', (store) => store.put({ ...meta, id: META_ID }))

export const getNodeKey = (nodeUuid: string) =>
    run<INodeKeyRecord | undefined>(STORE_KEYS, 'readonly', (store) => store.get(nodeUuid))

export const putNodeKey = (record: INodeKeyRecord) =>
    run(STORE_KEYS, 'readwrite', (store) => store.put(record))

export const getAllNodeKeys = () =>
    run<INodeKeyRecord[]>(STORE_KEYS, 'readonly', (store) => store.getAll())

export const deleteNodeKey = (nodeUuid: string) =>
    run(STORE_KEYS, 'readwrite', (store) => store.delete(nodeUuid))

export const getKnownHost = (id: string) =>
    run<IKnownHostRecord | undefined>(STORE_HOSTS, 'readonly', (store) => store.get(id))

export const putKnownHost = (record: IKnownHostRecord) =>
    run(STORE_HOSTS, 'readwrite', (store) => store.put(record))

export const getAllKnownHosts = () =>
    run<IKnownHostRecord[]>(STORE_HOSTS, 'readonly', (store) => store.getAll())

export const getConnectionProfile = (nodeUuid: string) =>
    run<IConnectionProfileRecord | undefined>(STORE_PROFILES, 'readonly', (store) =>
        store.get(nodeUuid)
    )

export const putConnectionProfile = (record: IConnectionProfileRecord) =>
    run(STORE_PROFILES, 'readwrite', (store) => store.put(record))

export const getAllConnectionProfiles = () =>
    run<IConnectionProfileRecord[]>(STORE_PROFILES, 'readonly', (store) => store.getAll())

export const getDeviceKey = () =>
    run<CryptoKey | undefined>(STORE_DEVICE, 'readonly', (store) => store.get('device'))

export async function getOrCreateDeviceKey(): Promise<CryptoKey> {
    const existing = await getDeviceKey()
    if (existing) return existing

    const candidate = await generateDeviceKey()

    try {
        await run(STORE_DEVICE, 'readwrite', (store) => store.add(candidate, 'device'))

        return candidate
    } catch {
        const winner = await getDeviceKey()
        if (!winner) throw new Error('Device key is unavailable')

        return winner
    }
}

export const clearVault = (): Promise<void> =>
    transact(ALL_STORES, 'readwrite', (transaction) => {
        for (const store of ALL_STORES) transaction.objectStore(store).clear()
    })

export const restoreVault = (
    meta: Omit<IVaultMeta, 'id'>,
    records: IVaultRestoreRecords
): Promise<void> =>
    transact(ALL_STORES, 'readwrite', (transaction) => {
        // Queue the complete encrypted replacement synchronously in one transaction.
        // An abort preserves the old metadata, all collections and the device key.
        for (const store of ALL_STORES) transaction.objectStore(store).clear()
        transaction.objectStore(STORE_META).put({ ...meta, id: META_ID })
        for (const record of records.keys) transaction.objectStore(STORE_KEYS).put(record)
        for (const record of records.hosts) transaction.objectStore(STORE_HOSTS).put(record)
        for (const record of records.snippets ?? [])
            transaction.objectStore(STORE_SNIPPETS).put(record)
        for (const record of records.profiles ?? [])
            transaction.objectStore(STORE_PROFILES).put(record)
    })

export const putKnownHosts = async (records: IKnownHostRecord[]): Promise<void> => {
    for (const record of records) await putKnownHost(record)
}

export const putNodeKeys = async (records: INodeKeyRecord[]): Promise<void> => {
    for (const record of records) await putNodeKey(record)
}

export const putConnectionProfiles = async (records: IConnectionProfileRecord[]): Promise<void> => {
    for (const record of records) await putConnectionProfile(record)
}

export const getAllSnippets = () =>
    run<ISnippetRecord[]>(STORE_SNIPPETS, 'readonly', (store) => store.getAll())

export const putSnippet = (record: ISnippetRecord) =>
    run(STORE_SNIPPETS, 'readwrite', (store) => store.put(record))

export const deleteSnippet = (id: string) =>
    run(STORE_SNIPPETS, 'readwrite', (store) => store.delete(id))

export const putSnippets = async (records: ISnippetRecord[]): Promise<void> => {
    for (const record of records) await putSnippet(record)
}
