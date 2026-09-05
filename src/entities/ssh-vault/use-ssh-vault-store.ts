import type { IEncryptedBlob } from './ssh-crypto'
import type { IParsedSshKey, ISshPrivateKey, TSshKeyAlgo } from './ssh-private-key'
import type {
    IConnectionProfile,
    IConnectionProfileRecord,
    IKnownHost,
    ISnippetRecord,
    IKnownHostRecord,
    INodeKeyRecord,
    IVaultMeta
} from './ssh-vault.db'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { getSessionGeneration, subscribeSessionChanges } from '@shared/api/axios'
import { evaluateVault } from '@shared/api/hooks'
import { logoutEvents } from '@shared/emitters'

import {
    decrypt,
    deriveIndexKey,
    indexId,
    derivePasscodeKey,
    deriveKeyEncryptionKey,
    encrypt,
    generateDataKey,
    generateSalt,
    fromBase64,
    generateSshKeyPair,
    importDataKey,
    PASSCODE_MAX_ATTEMPTS,
    isValidPasscode,
    PASSCODE_MIN_LENGTH,
    toBase64
} from './ssh-crypto'
import { parseSshPrivateKey, toOpenSshPublicKey } from './ssh-private-key'
import {
    destroyVault,
    deleteSnippet,
    getAllKnownHosts,
    getAllNodeKeys,
    getAllSnippets,
    getAllConnectionProfiles,
    getConnectionProfile,
    getKnownHost,
    getNodeKey,
    getDeviceKey,
    getOrCreateDeviceKey,
    getVaultMeta,
    putConnectionProfile,
    putKnownHost,
    putNodeKey,
    putSnippet,
    putVaultMeta,
    restoreVault
} from './ssh-vault.db'
import {
    decodeVaultFile,
    encodeVaultFile,
    padPayload,
    IVaultBackupFile,
    unpadPayload,
    vaultFileAad
} from './vault-backup-file'

export type TVaultStatus = 'absent' | 'locked' | 'unknown' | 'unlocked'

interface IState {
    dataKey: CryptoKey | null
    indexKey: CryptoKey | null
    hasPasscode: boolean
    passcodeAttemptsLeft: number
    passcodeLength: number
    status: TVaultStatus
}

export interface INodeKeyInfo {
    algo: TSshKeyAlgo
    imported: boolean
    publicKey: string
}

interface IActions {
    actions: {
        create: (seedPhrase: string, passcode: string) => Promise<void>
        ensureNodeKey: (nodeUuid: string) => Promise<INodeKeyInfo>
        importNodeKey: (nodeUuid: string, privateKey: string) => Promise<INodeKeyInfo>
        regenerateNodeKey: (nodeUuid: string) => Promise<INodeKeyInfo>
        exportVault: () => Promise<Uint8Array>
        importVault: (file: Uint8Array, seedPhrase: string) => Promise<boolean>
        getNodePublicKey: (nodeUuid: string) => Promise<null | string>
        getPrivateKey: (nodeUuid: string) => Promise<ISshPrivateKey | null>
        deleteSnippet: (id: string) => Promise<void>
        getProfile: (nodeUuid: string) => Promise<IConnectionProfile | null>
        listProfiles: () => Promise<IConnectionProfile[]>
        listSnippets: () => Promise<ISshSnippet[]>
        lock: () => void
        refresh: () => Promise<void>
        reset: () => Promise<void>
        rememberHost: (target: string, algo: string, fingerprint: string) => Promise<void>
        saveProfile: (profile: Omit<IConnectionProfile, 'lastUsedAt'>) => Promise<void>
        saveSnippet: (
            snippet: Pick<ISshSnippet, 'command' | 'name'> & { id?: string }
        ) => Promise<void>
        setPasscode: (passcode: string) => Promise<void>
        trustedFingerprint: (target: string) => Promise<null | string>
        unlock: (seedPhrase: string) => Promise<boolean>
        unlockWithPasscode: (passcode: string) => Promise<boolean>
    }
}

export const VAULT_DEVICE_KEY_MISSING = 'vault-device-key-missing'

export const describeVaultError = (error: unknown): string =>
    error instanceof Error && error.message !== VAULT_DEVICE_KEY_MISSING
        ? error.message
        : 'Vault is temporarily unavailable'
const VAULT_AAD = 'rw-vault-v1'
const PASSCODE_AAD = 'rw-vault-passcode-v1'

let rawDataKeyCache: null | Uint8Array = null
let vaultGeneration = 0
let keyGeneration = 0
let vaultWrites: Promise<unknown> = Promise.resolve()

interface IVaultOperation {
    current: () => boolean
    assertCurrent: () => void
}

function captureVaultOperation(transition = false): IVaultOperation {
    if (transition) vaultGeneration += 1
    const generation = vaultGeneration
    const keys = keyGeneration
    const session = getSessionGeneration()
    const current = () =>
        generation === vaultGeneration &&
        keys === keyGeneration &&
        session === getSessionGeneration()
    return {
        current,
        assertCurrent: () => {
            if (!current())
                throw new Error('Vault operation was canceled because it was locked or changed')
        }
    }
}

// Serialize persistence and transitions. A reset/import waits for an already-started write;
// old queued work cannot recreate records after the replacement vault has committed.
function withVaultWrite<T>(operation: IVaultOperation, write: () => Promise<T>): Promise<T> {
    const result = vaultWrites.then(() => {
        operation.assertCurrent()
        return write()
    })
    vaultWrites = result.catch(() => undefined)
    return result
}

async function prepareVaultKeys(rawDataKey: Uint8Array, operation: IVaultOperation) {
    const dataKey = await importDataKey(rawDataKey)
    operation.assertCurrent()
    const indexKey = await deriveIndexKey(rawDataKey)
    operation.assertCurrent()
    return { dataKey, indexKey }
}

function retainRawDataKey(rawDataKey: Uint8Array) {
    rawDataKeyCache?.fill(0)
    rawDataKeyCache = rawDataKey.slice()
    keyGeneration += 1
}

interface IVaultBackupPayload {
    hosts: IKnownHostRecord[]
    keys: INodeKeyRecord[]
    profiles?: IConnectionProfileRecord[]
    snippets?: ISnippetRecord[]
}

export interface ISshSnippet {
    command: string
    createdAt: string
    id: string
    name: string
}

async function wrapPasscode(
    rawDataKey: Uint8Array,
    passcode: string,
    operation: IVaultOperation
): Promise<NonNullable<IVaultMeta['passcode']>> {
    if (!isValidPasscode(passcode)) throw new Error('Passcode is too weak')

    const salt = generateSalt()
    const passcodeKey = await derivePasscodeKey(passcode, salt, async (blinded) => {
        operation.assertCurrent()
        const evaluated = await evaluateWithPanel(blinded)
        operation.assertCurrent()
        return evaluated
    })
    operation.assertCurrent()

    const inner = await encrypt(passcodeKey, rawDataKey, PASSCODE_AAD)
    operation.assertCurrent()
    const deviceKey = await getOrCreateDeviceKey()
    operation.assertCurrent()
    const wrapped = await encrypt(
        deviceKey,
        new TextEncoder().encode(JSON.stringify(inner)),
        PASSCODE_AAD
    )

    operation.assertCurrent()
    return { attempts: 0, length: passcode.length, salt: toBase64(salt), wrapped }
}

function isRestorablePayload(payload: IVaultBackupPayload): boolean {
    const hasKey = (value: unknown, field: string) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as Record<string, unknown>)[field] === 'string' &&
        (value as Record<string, string>)[field].length > 0

    return (
        Array.isArray(payload.keys) &&
        Array.isArray(payload.hosts) &&
        (payload.snippets === undefined || Array.isArray(payload.snippets)) &&
        (payload.profiles === undefined || Array.isArray(payload.profiles)) &&
        payload.keys.every((record) => hasKey(record, 'nodeUuid')) &&
        payload.hosts.every((record) => hasKey(record, 'id')) &&
        (payload.snippets ?? []).every((record) => hasKey(record, 'id')) &&
        (payload.profiles ?? []).every((record) => hasKey(record, 'nodeUuid'))
    )
}

const evaluateWithPanel = async (blinded: Uint8Array): Promise<Uint8Array> =>
    fromBase64(await evaluateVault(toBase64(blinded)))

const stripId = (meta: IVaultMeta): Omit<IVaultMeta, 'id'> => {
    const { id: _id, ...rest } = meta
    return rest
}

const nodeAad = (nodeUuid: string, publicKey: string, algo: TSshKeyAlgo) =>
    `ssh-node-key:${nodeUuid}:${algo}:${publicKey}`
const hostAad = (id: string) => `ssh-known-host:${id}`
const profileAad = (nodeUuid: string) => `ssh-profile:${nodeUuid}`

interface INewNodeKey extends IParsedSshKey {
    imported?: boolean
}

function generatedKey(nodeUuid: string): INewNodeKey {
    const pair = generateSshKeyPair()

    return {
        algo: 'ssh-ed25519',
        material: pair.privateKey,
        publicKeyLine: toOpenSshPublicKey(pair.publicKey, `remnawave:${nodeUuid}`)
    }
}

function toKeyInfo(record: INodeKeyRecord): INodeKeyInfo {
    return {
        algo: record.algo ?? 'ssh-ed25519',
        imported: record.imported ?? false,
        publicKey: record.publicKey
    }
}

async function storeNodeKey(
    dataKey: CryptoKey | null,
    nodeUuid: string,
    key: INewNodeKey,
    operation: IVaultOperation
): Promise<INodeKeyInfo> {
    try {
        operation.assertCurrent()
        if (!dataKey) throw new Error('Vault is locked')
        const imported = key.imported ?? false
        const encryptedPrivateKey = await encrypt(
            dataKey,
            key.material,
            nodeAad(nodeUuid, key.publicKeyLine, key.algo)
        )
        await withVaultWrite(operation, () =>
            putNodeKey({
                algo: key.algo,
                createdAt: new Date().toISOString(),
                encryptedPrivateKey,
                imported,
                nodeUuid,
                publicKey: key.publicKeyLine
            })
        )
        operation.assertCurrent()
        return { algo: key.algo, imported, publicKey: key.publicKeyLine }
    } finally {
        key.material.fill(0)
    }
}
const snippetAad = (id: string) => `ssh-snippet:${id}`

export const useSshVaultStore = create<IActions & IState>()(
    devtools(
        (set, get) => ({
            dataKey: null,
            indexKey: null,
            hasPasscode: false,
            passcodeAttemptsLeft: PASSCODE_MAX_ATTEMPTS,
            passcodeLength: PASSCODE_MIN_LENGTH,
            status: 'unknown',
            actions: {
                refresh: async () => {
                    const operation = captureVaultOperation()
                    const meta = await getVaultMeta()
                    if (!operation.current()) return

                    set({
                        hasPasscode: Boolean(meta?.passcode),
                        passcodeAttemptsLeft:
                            PASSCODE_MAX_ATTEMPTS - (meta?.passcode?.attempts ?? 0),
                        passcodeLength: meta?.passcode?.length ?? PASSCODE_MIN_LENGTH,
                        status: meta ? (get().dataKey ? 'unlocked' : 'locked') : 'absent'
                    })
                },

                create: async (seedPhrase, passcode) => {
                    const operation = captureVaultOperation(true)
                    await withVaultWrite(operation, async () => {
                        const kek = await deriveKeyEncryptionKey(seedPhrase)
                        operation.assertCurrent()
                        const rawDataKey = generateDataKey()
                        try {
                            const passcodeRecord = await wrapPasscode(
                                rawDataKey,
                                passcode,
                                operation
                            )
                            const wrappedDataKey = await encrypt(kek, rawDataKey, VAULT_AAD)
                            const keys = await prepareVaultKeys(rawDataKey, operation)
                            operation.assertCurrent()
                            await putVaultMeta({
                                createdAt: new Date().toISOString(),
                                passcode: passcodeRecord,
                                version: 1,
                                wrappedDataKey
                            })
                            operation.assertCurrent()
                            retainRawDataKey(rawDataKey)
                            set({
                                ...keys,
                                hasPasscode: true,
                                passcodeAttemptsLeft: PASSCODE_MAX_ATTEMPTS,
                                passcodeLength: passcode.length,
                                status: 'unlocked'
                            })
                        } finally {
                            rawDataKey.fill(0)
                        }
                    })
                },

                unlock: async (seedPhrase) => {
                    const operation = captureVaultOperation()
                    try {
                        return await withVaultWrite(operation, async () => {
                            const meta = await getVaultMeta()
                            operation.assertCurrent()
                            if (!meta) return false
                            const kek = await deriveKeyEncryptionKey(seedPhrase)
                            operation.assertCurrent()
                            const rawDataKey = await decrypt(kek, meta.wrappedDataKey, VAULT_AAD)
                            try {
                                const keys = await prepareVaultKeys(rawDataKey, operation)
                                operation.assertCurrent()
                                retainRawDataKey(rawDataKey)
                                set({ ...keys, status: 'unlocked' })
                                return true
                            } finally {
                                rawDataKey.fill(0)
                            }
                        })
                    } catch {
                        return false
                    }
                },

                lock: () => {
                    vaultGeneration += 1
                    keyGeneration += 1
                    rawDataKeyCache?.fill(0)
                    rawDataKeyCache = null
                    set({ dataKey: null, indexKey: null, status: 'locked' })
                },

                setPasscode: async (passcode) => {
                    const operation = captureVaultOperation()
                    await withVaultWrite(operation, async () => {
                        const meta = await getVaultMeta()
                        operation.assertCurrent()
                        if (!meta || !rawDataKeyCache) throw new Error('Vault is locked')
                        const rawDataKey = rawDataKeyCache.slice()
                        try {
                            const record = await wrapPasscode(rawDataKey, passcode, operation)
                            operation.assertCurrent()
                            await putVaultMeta({ ...stripId(meta), passcode: record })
                            operation.assertCurrent()
                            set({
                                hasPasscode: true,
                                passcodeAttemptsLeft: PASSCODE_MAX_ATTEMPTS,
                                passcodeLength: passcode.length
                            })
                        } finally {
                            rawDataKey.fill(0)
                        }
                    })
                },

                unlockWithPasscode: async (passcode) => {
                    const operation = captureVaultOperation()
                    try {
                        return await withVaultWrite(operation, async () => {
                            const meta = await getVaultMeta()
                            operation.assertCurrent()
                            if (!meta?.passcode) return false
                            let pinKey: CryptoKey
                            let inner: IEncryptedBlob
                            try {
                                const deviceKey = await getDeviceKey()
                                operation.assertCurrent()
                                if (!deviceKey) throw new Error(VAULT_DEVICE_KEY_MISSING)

                                inner = JSON.parse(
                                    new TextDecoder().decode(
                                        await decrypt(
                                            deviceKey,
                                            meta.passcode.wrapped,
                                            PASSCODE_AAD
                                        )
                                    )
                                ) as IEncryptedBlob
                                operation.assertCurrent()
                                pinKey = await derivePasscodeKey(
                                    passcode,
                                    fromBase64(meta.passcode.salt),
                                    async (blinded) => {
                                        operation.assertCurrent()
                                        const evaluated = await evaluateWithPanel(blinded)
                                        operation.assertCurrent()
                                        return evaluated
                                    }
                                )
                                operation.assertCurrent()
                            } catch (error) {
                                operation.assertCurrent()
                                throw error instanceof Error &&
                                    error.message === VAULT_DEVICE_KEY_MISSING
                                    ? error
                                    : new Error('Vault is temporarily unavailable')
                            }

                            let rawDataKey: Uint8Array
                            try {
                                rawDataKey = await decrypt(pinKey, inner, PASSCODE_AAD)
                            } catch {
                                operation.assertCurrent()
                                const attempts = meta.passcode.attempts + 1
                                const exhausted = attempts >= PASSCODE_MAX_ATTEMPTS

                                await putVaultMeta({
                                    ...stripId(meta),
                                    passcode: exhausted ? undefined : { ...meta.passcode, attempts }
                                })
                                operation.assertCurrent()
                                set({
                                    hasPasscode: !exhausted,
                                    passcodeAttemptsLeft: exhausted
                                        ? 0
                                        : PASSCODE_MAX_ATTEMPTS - attempts
                                })

                                return false
                            }
                            try {
                                const keys = await prepareVaultKeys(rawDataKey, operation)
                                operation.assertCurrent()
                                await putVaultMeta({
                                    ...stripId(meta),
                                    passcode: { ...meta.passcode, attempts: 0 }
                                })
                                operation.assertCurrent()
                                retainRawDataKey(rawDataKey)
                                set({
                                    ...keys,
                                    passcodeAttemptsLeft: PASSCODE_MAX_ATTEMPTS,
                                    status: 'unlocked'
                                })
                                return true
                            } finally {
                                rawDataKey.fill(0)
                            }
                        })
                    } catch (error) {
                        if (!operation.current()) return false
                        throw error
                    }
                },

                exportVault: async () => {
                    const operation = captureVaultOperation()
                    const meta = await getVaultMeta()
                    operation.assertCurrent()
                    const { dataKey } = get()
                    if (!meta || !dataKey) throw new Error('Vault is locked')

                    const payload: IVaultBackupPayload = {
                        hosts: await getAllKnownHosts(),
                        keys: await getAllNodeKeys(),
                        profiles: await getAllConnectionProfiles(),
                        snippets: await getAllSnippets()
                    }

                    const createdAt = new Date().toISOString()
                    operation.assertCurrent()
                    const file = encodeVaultFile({
                        createdAt,
                        payload: await encrypt(
                            dataKey,
                            padPayload(new TextEncoder().encode(JSON.stringify(payload))),
                            vaultFileAad(createdAt, meta.wrappedDataKey)
                        ),
                        wrappedDataKey: meta.wrappedDataKey
                    })
                    operation.assertCurrent()
                    return file
                },

                importVault: async (file, seedPhrase) => {
                    const operation = captureVaultOperation(true)
                    try {
                        return await withVaultWrite(operation, async () => {
                            let backup: IVaultBackupFile
                            let rawDataKey: Uint8Array | undefined
                            let records: IVaultBackupPayload
                            try {
                                try {
                                    backup = decodeVaultFile(file)
                                    const kek = await deriveKeyEncryptionKey(seedPhrase)
                                    operation.assertCurrent()
                                    rawDataKey = await decrypt(
                                        kek,
                                        backup.wrappedDataKey,
                                        VAULT_AAD
                                    )
                                    const dataKey = await importDataKey(rawDataKey)
                                    operation.assertCurrent()
                                    records = JSON.parse(
                                        new TextDecoder().decode(
                                            unpadPayload(
                                                await decrypt(
                                                    dataKey,
                                                    backup.payload,
                                                    vaultFileAad(
                                                        backup.createdAt,
                                                        backup.wrappedDataKey
                                                    )
                                                )
                                            )
                                        )
                                    ) as IVaultBackupPayload
                                } catch {
                                    return false
                                }
                                if (!isRestorablePayload(records)) return false
                                const keys = await prepareVaultKeys(rawDataKey, operation)
                                operation.assertCurrent()
                                // Once the restore batch starts, finish its encrypted records before
                                // allowing a newer reset/restore to run. Never publish canceled keys.
                                await restoreVault(
                                    {
                                        createdAt: backup.createdAt,
                                        version: 1,
                                        wrappedDataKey: backup.wrappedDataKey
                                    },
                                    records
                                )
                                operation.assertCurrent()
                                retainRawDataKey(rawDataKey)
                                set({
                                    ...keys,
                                    hasPasscode: false,
                                    passcodeAttemptsLeft: PASSCODE_MAX_ATTEMPTS,
                                    status: 'unlocked'
                                })
                                return true
                            } finally {
                                rawDataKey?.fill(0)
                            }
                        })
                    } catch (error) {
                        if (!operation.current()) return false
                        throw error
                    }
                },

                reset: async () => {
                    get().actions.lock()
                    const operation = captureVaultOperation()
                    await withVaultWrite(operation, async () => {
                        await destroyVault()
                        if (!operation.current()) return
                        set({
                            dataKey: null,
                            indexKey: null,
                            hasPasscode: false,
                            passcodeAttemptsLeft: PASSCODE_MAX_ATTEMPTS,
                            status: 'absent'
                        })
                    })
                },

                listSnippets: async () => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) return []

                    const records = await getAllSnippets()
                    if (!operation.current()) return []
                    const snippets: ISshSnippet[] = []

                    for (const record of records) {
                        try {
                            const { command, name } = JSON.parse(
                                new TextDecoder().decode(
                                    await decrypt(dataKey, record.payload, snippetAad(record.id))
                                )
                            ) as Pick<ISshSnippet, 'command' | 'name'>

                            snippets.push({
                                command,
                                createdAt: record.createdAt,
                                id: record.id,
                                name
                            })
                        } catch {
                            // silence
                        }
                    }

                    return operation.current()
                        ? snippets.sort((a, b) => a.name.localeCompare(b.name))
                        : []
                },

                saveSnippet: async ({ command, id, name }) => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) throw new Error('Vault is locked')

                    const snippetId = id ?? crypto.randomUUID()

                    const record = {
                        createdAt: new Date().toISOString(),
                        id: snippetId,
                        payload: await encrypt(
                            dataKey,
                            new TextEncoder().encode(JSON.stringify({ command, name })),
                            snippetAad(snippetId)
                        )
                    }
                    await withVaultWrite(operation, () => putSnippet(record))
                    operation.assertCurrent()
                },

                deleteSnippet: async (id) => {
                    const operation = captureVaultOperation()
                    if (!get().dataKey) throw new Error('Vault is locked')
                    await withVaultWrite(operation, () => deleteSnippet(id))
                    operation.assertCurrent()
                },

                getProfile: async (nodeUuid) => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    const record = await getConnectionProfile(nodeUuid)
                    if (!operation.current() || !dataKey || !record) return null

                    try {
                        const profile = JSON.parse(
                            new TextDecoder().decode(
                                await decrypt(dataKey, record.payload, profileAad(nodeUuid))
                            )
                        ) as IConnectionProfile
                        return operation.current() ? profile : null
                    } catch {
                        return null
                    }
                },

                listProfiles: async () => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) return []

                    const records = await getAllConnectionProfiles()
                    if (!operation.current()) return []

                    const profiles = await Promise.all(
                        records.map(async (record) => {
                            try {
                                return JSON.parse(
                                    new TextDecoder().decode(
                                        await decrypt(
                                            dataKey,
                                            record.payload,
                                            profileAad(record.nodeUuid)
                                        )
                                    )
                                ) as IConnectionProfile
                            } catch {
                                return null
                            }
                        })
                    )

                    return operation.current() ? profiles.filter((profile) => profile !== null) : []
                },

                saveProfile: async (profile) => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) throw new Error('Vault is locked')

                    const value: IConnectionProfile = {
                        ...profile,
                        lastUsedAt: new Date().toISOString()
                    }

                    const record = {
                        nodeUuid: profile.nodeUuid,
                        payload: await encrypt(
                            dataKey,
                            new TextEncoder().encode(JSON.stringify(value)),
                            profileAad(profile.nodeUuid)
                        )
                    }
                    await withVaultWrite(operation, () => putConnectionProfile(record))
                    operation.assertCurrent()
                },

                getNodePublicKey: async (nodeUuid) => {
                    const operation = captureVaultOperation()
                    const record = await getNodeKey(nodeUuid)
                    return operation.current() ? (record?.publicKey ?? null) : null
                },

                ensureNodeKey: async (nodeUuid) => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) throw new Error('Vault is locked')
                    const existing = await getNodeKey(nodeUuid)
                    operation.assertCurrent()
                    if (existing) return toKeyInfo(existing)

                    return storeNodeKey(dataKey, nodeUuid, generatedKey(nodeUuid), operation)
                },

                regenerateNodeKey: async (nodeUuid) =>
                    storeNodeKey(
                        get().dataKey,
                        nodeUuid,
                        generatedKey(nodeUuid),
                        captureVaultOperation()
                    ),

                importNodeKey: async (nodeUuid, privateKey) => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) throw new Error('Vault is locked')
                    const parsed = await parseSshPrivateKey(privateKey, `remnawave:${nodeUuid}`)

                    return storeNodeKey(dataKey, nodeUuid, { ...parsed, imported: true }, operation)
                },

                getPrivateKey: async (nodeUuid) => {
                    const operation = captureVaultOperation()
                    const { dataKey } = get()
                    if (!dataKey) return null

                    const record = await getNodeKey(nodeUuid)
                    if (!operation.current() || !record) return null

                    const algo = record.algo ?? 'ssh-ed25519'

                    const material = await decrypt(
                        dataKey,
                        record.encryptedPrivateKey,
                        nodeAad(nodeUuid, record.publicKey, algo)
                    )
                    if (!operation.current()) {
                        material.fill(0)
                        return null
                    }
                    return { algo, material }
                },

                trustedFingerprint: async (target) => {
                    const operation = captureVaultOperation()
                    const { dataKey, indexKey } = get()
                    if (!dataKey || !indexKey) return null

                    const id = await indexId(indexKey, target)
                    if (!operation.current()) return null
                    const record = await getKnownHost(id)
                    if (!operation.current() || !record) return null

                    try {
                        const host = JSON.parse(
                            new TextDecoder().decode(
                                await decrypt(dataKey, record.payload, hostAad(id))
                            )
                        ) as IKnownHost

                        return operation.current() && host.target === target
                            ? host.fingerprint
                            : null
                    } catch {
                        return null
                    }
                },

                rememberHost: async (target, algo, fingerprint) => {
                    const operation = captureVaultOperation()
                    const { dataKey, indexKey } = get()
                    if (!dataKey || !indexKey) throw new Error('Vault is locked')

                    const id = await indexId(indexKey, target)
                    const host: IKnownHost = {
                        addedAt: new Date().toISOString(),
                        algo,
                        fingerprint,
                        target
                    }

                    const record = {
                        id,
                        payload: await encrypt(
                            dataKey,
                            new TextEncoder().encode(JSON.stringify(host)),
                            hostAad(id)
                        )
                    }
                    await withVaultWrite(operation, () => putKnownHost(record))
                    operation.assertCurrent()
                }
            }
        }),
        { name: 'sshVaultStore', anonymousActionType: 'sshVaultStore' }
    )
)

export const useSshVaultStatus = () => useSshVaultStore((state) => state.status)
export const useSshVaultHasPasscode = () => useSshVaultStore((state) => state.hasPasscode)
export const useSshVaultPasscodeAttempts = () =>
    useSshVaultStore((state) => state.passcodeAttemptsLeft)
export const useSshVaultPasscodeLength = () => useSshVaultStore((state) => state.passcodeLength)
export const useSshVaultActions = () => useSshVaultStore((state) => state.actions)

logoutEvents.subscribe(() => useSshVaultStore.getState().actions.lock())
subscribeSessionChanges(() => useSshVaultStore.getState().actions.lock())
