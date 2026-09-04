import assert from 'node:assert/strict'
import test from 'node:test'

import { getTopologyMutationRevision } from './topology-revision.ts'

test('a background refresh cannot advance the draft save or delete version', () => {
    const draftRevision = { uuid: 'topology-a', version: 1 }
    const refreshedQuery = { uuid: 'topology-a', version: 2 }
    const mutation = getTopologyMutationRevision(refreshedQuery.uuid, draftRevision)
    assert.deepEqual(mutation, { uuid: 'topology-a', version: 1 })
    assert.notEqual(mutation.version, refreshedQuery.version)
    draftRevision.version = 3
    assert.equal(mutation.version, 1)
})

test('saving before load or after switching topology cannot borrow another revision', () => {
    assert.throws(() => getTopologyMutationRevision('topology-b', null), /finish loading/)
    assert.throws(
        () => getTopologyMutationRevision('topology-b', { uuid: 'topology-a', version: 1 }),
        /finish loading/
    )
})
