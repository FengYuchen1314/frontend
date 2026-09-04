import assert from 'node:assert/strict'
import test from 'node:test'

import { getTopologyMutationRevision, TopologyDraftRequests } from './topology-revision.ts'

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

test('switching away and back or editing the same graph invalidates every old response', async () => {
    for (const channel of ['mutation', 'preview', 'reload'] as const) {
        const requests = new TopologyDraftRequests()
        const current = requests.begin(channel)
        let complete!: () => void
        const pending = new Promise<void>((resolve) => {
            complete = resolve
        })
        let localDraft = 'graph A before request'
        const apply = pending.then(() => {
            if (current()) localDraft = 'stale server response'
        })
        requests.invalidate() // Select B or edit A while the request is pending.
        requests.invalidate() // Even returning to A must not revive that response.
        localDraft = 'latest unsaved draft'
        complete()
        await apply
        assert.equal(localDraft, 'latest unsaved draft')
    }
})

test('only the latest same-kind request can apply, without cancelling independent work', () => {
    const requests = new TopologyDraftRequests()
    const saving = requests.begin('mutation')
    const firstPreview = requests.begin('preview')
    const secondPreview = requests.begin('preview')
    assert.equal(saving(), true)
    assert.equal(firstPreview(), false)
    assert.equal(secondPreview(), true)
    requests.invalidate() // A loaded response or component unmount invalidates all work.
    assert.equal(saving(), false)
    assert.equal(secondPreview(), false)
})

test('an invalidated validation response cannot proceed to saving an obsolete graph', async () => {
    const requests = new TopologyDraftRequests()
    const current = requests.begin('mutation')
    let writes = 0
    const validateThenSave = async () => {
        await Promise.resolve()
        if (!current()) return
        writes++
    }
    const saving = validateThenSave()
    requests.invalidate()
    await saving
    assert.equal(writes, 0)
})
