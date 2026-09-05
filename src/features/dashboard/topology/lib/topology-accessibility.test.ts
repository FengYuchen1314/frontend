import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(
    new URL('../../../../pages/dashboard/topology/topology.page.connector.tsx', import.meta.url),
    'utf8'
)

test('fixed topology cards do not receive disabled draggable semantics on their editable descendants', () => {
    const card = page.match(/<Card\s[\s\S]*?className=\{classes\.canvasNode\}[\s\S]*?\n\s*>/)?.[0]
    assert(card, 'Canvas node card must be present')
    assert.match(card, /ref=\{isFixed\s*\?\s*undefined\s*:\s*ref\}/)
    assert.match(page, /disabled:\s*\{\s*draggable:\s*isFixed,/)
})
