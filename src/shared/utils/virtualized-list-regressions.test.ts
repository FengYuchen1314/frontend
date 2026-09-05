import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function sourceFile(path: string) {
    return ts.createSourceFile(
        path,
        readFileSync(new URL(path, import.meta.url), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
}

function findNode<T extends ts.Node>(file: ts.Node, predicate: (node: ts.Node) => node is T): T {
    const matches: T[] = []
    const visit = (node: ts.Node) => {
        if (predicate(node)) matches.push(node)
        ts.forEachChild(node, visit)
    }
    visit(file)
    assert.equal(matches.length, 1)
    return matches[0]
}

function evaluate<T>(expression: string, scope: Record<string, unknown>): T {
    const js = ts.transpileModule(`return ${expression}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
    }).outputText
    return new Function(...Object.keys(scope), js)(...Object.values(scope)) as T
}

test('virtualized lists retain their data boundary, overscan and stable identity on reorder/filter', () => {
    const lists = [
        [
            '../ui/config-profiles/virtualized-flat-inbounds-list/virtualized-flat-inbounds-list.shared.tsx',
            { inbound: { uuid: 'a' } },
            { inbound: { uuid: 'b' } }
        ],
        [
            '../ui/config-profiles/virtualized-inbounds-list/virtualized-inbounds-list.shared.tsx',
            { uuid: 'a' },
            { uuid: 'b' }
        ],
        [
            '../ui/internal-squads/internal-squads-list-simple/internal-squads-list-simple.widget.tsx',
            { uuid: 'a' },
            { uuid: 'b' }
        ],
        [
            '../../widgets/dashboard/users/internal-squads-list/internal-squads-list.widget.tsx',
            { uuid: 'a' },
            { uuid: 'b' }
        ],
        [
            '../../widgets/dashboard/infra-billing/mobile/virtualized-records-list.widget.tsx',
            { key: 'a' },
            { key: 'b' }
        ]
    ] as const
    for (const [path, first, second] of lists) {
        const file = sourceFile(path)
        assert.doesNotMatch(file.text, /useVirtualizer|eslint-disable|oxlint-disable|use no memo/)
        const virtuoso = findNode(
            file,
            (node): node is ts.JsxSelfClosingElement =>
                ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'Virtuoso'
        )
        const attributes = new Map(
            virtuoso.attributes.properties.flatMap((property) =>
                ts.isJsxAttribute(property)
                    ? [[property.name.getText(file), property.initializer]]
                    : []
            )
        )
        for (const attribute of ['data', 'itemContent', 'increaseViewportBy', 'computeItemKey']) {
            assert(attributes.has(attribute), `${path} retains ${attribute}`)
        }
        const initializer = attributes.get('computeItemKey')!
        assert(ts.isJsxExpression(initializer))
        const getKey = evaluate<(index: number, row: unknown) => string>(
            initializer.expression!.getText(file),
            {}
        )
        assert.equal(getKey(0, first), getKey(10, first))
        assert.notEqual(getKey(0, first), getKey(0, second))
    }
})

test('flat inbound selected/unselected filtering uses current UUID membership', () => {
    const file = sourceFile(
        '../ui/config-profiles/virtualized-flat-inbounds-list/virtualized-flat-inbounds-list.shared.tsx'
    )
    const declaration = findNode(
        file,
        (node): node is ts.VariableDeclaration =>
            ts.isVariableDeclaration(node) && node.name.getText(file) === 'filteredInbounds'
    )
    const allInbounds = [
        { inbound: { uuid: 'one' }, profileName: 'A' },
        { inbound: { uuid: 'two' }, profileName: 'B' },
        { inbound: { uuid: 'three' }, profileName: 'A' }
    ]
    const filter = (filterType: string, selectedInbounds: Set<string>) =>
        evaluate(declaration.initializer!.getText(file), {
            allInbounds,
            selectedInbounds,
            filterType,
            useMemo: (calculate: () => unknown) => calculate()
        })
    assert.deepEqual(filter('selected', new Set(['two'])), [allInbounds[1]])
    assert.deepEqual(filter('unselected', new Set(['two'])), [allInbounds[0], allInbounds[2]])
    assert.deepEqual(filter('selected', new Set()), [])
    assert.equal(filter('all', new Set()), allInbounds)
})

test('flat inbound group keeps the browser-verified height-chain stylesheet connected', () => {
    // Wiring guard only. The real geometry regression is the independently served
    // virtualized-height-runtime.fixture.mjs page and its browser-measured PASS/FAIL.
    const directory = '../ui/config-profiles/virtualized-flat-inbounds-list/'
    const file = sourceFile(`${directory}virtualized-flat-inbounds-list.shared.tsx`)
    const group = findNode(
        file,
        (node): node is ts.JsxOpeningElement =>
            ts.isJsxOpeningElement(node) && node.tagName.getText(file) === 'Checkbox.Group'
    )
    const className = group.attributes.properties.find(
        (node): node is ts.JsxAttribute =>
            ts.isJsxAttribute(node) && node.name.getText(file) === 'className'
    )
    assert(className?.initializer && ts.isJsxExpression(className.initializer))
    assert.equal(className.initializer.expression?.getText(file), 'classes.checkboxGroup')
    const css = readFileSync(
        new URL(`${directory}VirtualizedFlatInboundsList.module.css`, import.meta.url),
        'utf8'
    )
    assert.match(file.text, /import classes from '\.\/VirtualizedFlatInboundsList\.module\.css'/)
    assert.match(
        css,
        /\.checkboxGroup\s*,\s*\.checkboxGroup\s*>\s*\[role=['"]group['"]\]\s*\{[^}]*height:\s*100%/
    )
})

test('billing scroll fade and pagination follow measured scroll state and do not duplicate pending loads', () => {
    const file = sourceFile(
        '../../widgets/dashboard/infra-billing/mobile/virtualized-records-list.widget.tsx'
    )
    const declaration = findNode(
        file,
        (node): node is ts.VariableDeclaration =>
            ts.isVariableDeclaration(node) && node.name.getText(file) === 'updateFade'
    )
    const threshold = findNode(
        file,
        (node): node is ts.VariableDeclaration =>
            ts.isVariableDeclaration(node) && node.name.getText(file) === 'REACH_BOTTOM_THRESHOLD'
    )
    const scrollElement = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 }
    let fade = { top: false, bottom: false }
    let loads = 0
    const handler = (isLoadingMore: boolean) =>
        evaluate<() => void>(declaration.initializer!.getText(file), {
            useCallback: (callback: () => void) => callback,
            scrollRef: { current: scrollElement },
            isLoadingMore,
            REACH_BOTTOM_THRESHOLD: Number(threshold.initializer!.getText(file)),
            setFade: (update: (previous: typeof fade) => typeof fade) => {
                fade = update(fade)
            },
            onReachBottom: () => {
                loads += 1
            }
        })
    const onScroll = handler(false)
    onScroll()
    assert.deepEqual(fade, { top: false, bottom: true })
    assert.equal(loads, 0)
    const unchanged = fade
    onScroll()
    assert.equal(fade, unchanged)
    scrollElement.scrollTop = 500
    onScroll()
    assert.deepEqual(fade, { top: true, bottom: true })
    assert.equal(loads, 1)
    scrollElement.scrollTop = 800
    handler(true)()
    assert.deepEqual(fade, { top: true, bottom: false })
    assert.equal(loads, 1)
    scrollElement.scrollHeight = 100
    scrollElement.scrollTop = 0
    onScroll()
    assert.deepEqual(fade, { top: false, bottom: false })
    assert.equal(loads, 2, 'a short initial page can fetch more without requiring a scrollbar')
    assert.match(file.text, /totalListHeightChanged=\{updateFade\}/)
    assert.match(file.text, /onScroll=\{updateFade\}/)
    assert.match(file.text, /defaultItemHeight=\{RECORD_ESTIMATE\}/)
    assert.doesNotMatch(
        file.text,
        /fixedItemHeight=/,
        'billing rows retain variable-height measurement'
    )
})

test('node reordering does not read a tag ref written during render', () => {
    const file = sourceFile('../../widgets/dashboard/nodes/nodes-table/nodes-table.widget.tsx')
    assert.doesNotMatch(file.text, /activeTagRef/)
    assert.match(file.text, /if \(activeTag !== null\)/)
    assert.match(file.text, /\[state, activeTag, reorderNodes\]/)
    assert.match(file.text, /disableReordering=\{activeTag !== null\}/)
})
