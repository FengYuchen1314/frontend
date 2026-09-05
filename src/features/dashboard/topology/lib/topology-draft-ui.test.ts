import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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
