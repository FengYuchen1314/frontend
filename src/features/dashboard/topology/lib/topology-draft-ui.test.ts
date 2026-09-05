import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

// Wiring regression; real modal cancellation and confirmation are tested in the paired image.
test('conflict reload uses the same unsaved-draft confirmation as topology switching', () => {
    const page = readFileSync(
        new URL(
            '../../../../pages/dashboard/topology/topology.page.connector.tsx',
            import.meta.url
        ),
        'utf8'
    )
    assert(
        /onClick=\{\(\) => confirmDiscardChanges\(handleReloadLatest\)\}/.test(page),
        'Reload Latest must require the existing discard-draft confirmation'
    )
    assert(!/onClick=\{handleReloadLatest\}/.test(page), 'Do not bypass the draft guard')
})

test('accepted conflict reload refreshes saved labels without letting stale responses replace drafts', async () => {
    const page = readFileSync(
        new URL(
            '../../../../pages/dashboard/topology/topology.page.connector.tsx',
            import.meta.url
        ),
        'utf8'
    )
    const handler = page.match(
        /const handleReloadLatest = (async \(\) => \{[\s\S]*?)\n    const handleDelete/
    )
    assert(handler, 'Exercise the actual page reload handler')
    for (const current of [true, false]) {
        const record = { uuid: 'selected', name: 'Renamed remotely', version: 3 }
        const loaded: unknown[] = []
        let listRefreshes = 0
        const reload = runInNewContext(`(${handler[1].trim()})`, {
            draftRequestsRef: { current: { begin: () => () => current } },
            refetchSelected: async () => ({ data: record }),
            refetchList: async () => {
                listRefreshes++
            },
            selectedUuid: record.uuid,
            loadTopology: (value: unknown) => loaded.push(value)
        })
        await reload()
        assert.deepEqual(loaded, current ? [record] : [])
        assert.equal(
            listRefreshes,
            current ? 1 : 0,
            'Refresh saved labels only for the accepted response'
        )
    }
    assert(/refetch: refetchList[\s\S]*?\} = useGetTopologies\(\)/.test(page))
})
