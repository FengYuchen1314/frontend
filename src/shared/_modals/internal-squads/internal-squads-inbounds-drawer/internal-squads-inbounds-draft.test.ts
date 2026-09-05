import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

import { createInboundDraft, editInboundDraft } from './internal-squads-inbounds-draft.ts'

type Selection = Set<string>
type DraftView = {
    revision: number
    selectedInbounds: Selection
    setSelectedInbounds: (update: (selection: Selection) => Selection) => void
}

function sourceFile(name: string) {
    return ts.createSourceFile(
        name,
        readFileSync(new URL(name, import.meta.url), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
}

function evaluate(code: string, scope: Record<string, unknown>): unknown {
    const javascript = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
    }).outputText
    return new Function(...Object.keys(scope), javascript)(...Object.values(scope))
}

// Runs the production hook with deterministic state/render scheduling and the real draft
// operations. These tests are not a DOM/Virtuoso or Mantine transition acceptance test.
function editor() {
    const file = sourceFile('./internal-squads-inbounds-draft.ts')
    const hook = file.statements.find(
        (node): node is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(node) && node.name?.text === 'useInternalSquadInboundsDraft'
    )
    assert(hook)
    let state: unknown
    let rerender = false
    const useDraft = evaluate(`return ${hook.getText(file).replace(/^export\s+/, '')}`, {
        createInboundDraft,
        editInboundDraft,
        useCallback: (callback: unknown) => callback,
        useMemo: (compute: () => unknown) => compute(),
        useState: (initial: () => unknown) => {
            state ??= initial()
            return [
                state,
                (update: unknown) => {
                    state = typeof update === 'function' ? update(state) : update
                    rerender = true
                }
            ]
        }
    }) as (uuid: string, visible: boolean, inbounds?: { uuid: string }[]) => DraftView
    let args: Parameters<typeof useDraft> = ['squad-a', true, undefined]
    const render = () => {
        for (let attempts = 0; attempts < 5; attempts += 1) {
            rerender = false
            const value = useDraft(...args)
            if (!rerender) return value
        }
        throw new Error('draft did not settle')
    }
    return {
        render,
        receive: (uuid: string, visible: boolean, ids?: string[]) => {
            args = [uuid, visible, ids?.map((inboundUuid) => ({ uuid: inboundUuid }))]
            return render()
        }
    }
}

function values(view: DraftView) {
    return [...view.selectedInbounds].sort()
}

function drawerHandler(name: string, scope: Record<string, unknown>) {
    const file = sourceFile('./internal-squads-inbounds.drawer.tsx')
    let declaration: ts.VariableDeclaration | undefined
    const visit = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) declaration = node
        ts.forEachChild(node, visit)
    }
    visit(file)
    assert(declaration)
    return evaluate(`const ${declaration.getText(file)}; return ${name};`, {
        useCallback: (callback: unknown) => callback,
        ...scope
    })
}

test('initial asynchronous data and untouched refetches populate the selection', () => {
    const draft = editor()
    assert.deepEqual(values(draft.receive('squad-a', true)), [])
    assert.deepEqual(values(draft.receive('squad-a', true, ['a'])), ['a'])
    assert.deepEqual(values(draft.receive('squad-a', true, ['remote'])), ['remote'])
})

test('same-squad refetch preserves the edited selection and does not mutate remote data', () => {
    const draft = editor()
    const initial = draft.receive('squad-a', true, ['a'])
    initial.setSelectedInbounds((selection) => selection.add('b'))
    assert.deepEqual([...initial.selectedInbounds], ['a'])
    assert.deepEqual(values(draft.receive('squad-a', true, ['remote'])), ['a', 'b'])
    assert.deepEqual(values(draft.receive('squad-a', true, [])), ['a', 'b'])
    assert.equal(draft.render().revision, 1)
})

test('an intentionally empty draft remains empty after refresh', () => {
    const draft = editor()
    draft.receive('squad-a', true, ['a']).setSelectedInbounds(() => new Set())
    assert.deepEqual(values(draft.receive('squad-a', true, ['remote'])), [])
})

test('switching squads resets the scope before new data arrives and never resurrects an old draft', () => {
    const draft = editor()
    draft
        .receive('squad-a', true, ['a'])
        .setSelectedInbounds((selection) => selection.add('local-a'))
    assert.deepEqual(values(draft.receive('squad-b', true)), [])
    assert.deepEqual(values(draft.receive('squad-b', true, ['b'])), ['b'])
    draft.render().setSelectedInbounds((selection) => selection.add('local-b'))
    assert.deepEqual(values(draft.receive('squad-a', true, ['new-a'])), ['new-a'])
    assert.equal(draft.render().revision, 0)
})

test('close and reopen discards the prior draft even if the modal component stayed mounted', () => {
    const draft = editor()
    draft.receive('squad-a', true, ['a']).setSelectedInbounds((selection) => selection.add('local'))
    const closed = draft.receive('squad-a', false, ['remote'])
    closed.setSelectedInbounds((selection) => selection.add('hidden-edit'))
    assert.deepEqual(values(draft.receive('squad-a', true, ['remote'])), ['remote'])
    assert.equal(draft.render().revision, 0)
})

test('a newly mounted editor starts from the latest server selection', () => {
    const previous = editor()
    previous
        .receive('squad-a', true, ['a'])
        .setSelectedInbounds((selection) => selection.add('local'))
    assert.deepEqual(values(editor().receive('squad-a', true, ['persisted'])), ['persisted'])
})

test('group select/unselect and individual toggles share the same draft without removing hidden selections', () => {
    const draft = editor()
    draft.receive('squad-a', true, ['hidden'])
    const scope = {
        filteredProfiles: [
            { uuid: 'profile', inbounds: [{ uuid: 'shown-a' }, { uuid: 'shown-b' }] }
        ],
        setSelectedInbounds: (update: (selection: Selection) => Selection) =>
            draft.render().setSelectedInbounds(update)
    }
    const select = drawerHandler('handleSelectAllInbounds', scope) as (uuid: string) => void
    const unselect = drawerHandler('handleUnselectAllInbounds', scope) as (uuid: string) => void
    const toggle = drawerHandler('handleInboundToggle', scope) as (inbound: {
        uuid: string
    }) => void
    select('profile')
    assert.deepEqual(values(draft.render()), ['hidden', 'shown-a', 'shown-b'])
    toggle({ uuid: 'shown-a' })
    assert.deepEqual(values(draft.render()), ['hidden', 'shown-b'])
    unselect('profile')
    assert.deepEqual(values(draft.render()), ['hidden'])
    assert.deepEqual(values(draft.receive('squad-a', true, ['remote'])), ['hidden'])
})

function save(view: DraftView, options: { visible?: boolean; responseUuid?: string } = {}) {
    const generation = { current: 4 }
    const requests: {
        variables: { uuid: string; inbounds: string[] }
        mutationFns: { onSuccess: () => void }
    }[] = []
    let hidden = 0
    const submit = drawerHandler('handleUpdateInternalSquad', {
        modal: { visible: options.visible ?? true },
        internalSquad: { uuid: options.responseUuid ?? 'squad-a' },
        squadUuid: 'squad-a',
        selectedInbounds: view.selectedInbounds,
        editGeneration: generation,
        updateInternalSquad: (request: (typeof requests)[number]) => requests.push(request),
        hide: () => {
            hidden += 1
        }
    }) as () => void
    submit()
    return { requests, generation, hidden: () => hidden }
}

test('Save submits the displayed draft; a failed request and following refetch leave it intact', () => {
    const draft = editor()
    draft.receive('squad-a', true, ['a']).setSelectedInbounds((selection) => selection.add('local'))
    const pending = save(draft.render())
    assert.deepEqual(pending.requests[0].variables, { uuid: 'squad-a', inbounds: ['a', 'local'] })
    // A failed mutation does not run onSuccess; the normal error handler owns its notification.
    assert.equal(pending.hidden(), 0)
    assert.deepEqual(values(draft.receive('squad-a', true, ['remote-after-error'])), ['a', 'local'])
    const retry = save(draft.render())
    retry.requests[0].mutationFns.onSuccess()
    assert.equal(retry.hidden(), 1)
})

test('Save refuses a hidden drawer or data belonging to the previous squad', () => {
    const draft = editor().receive('squad-a', true, ['a'])
    assert.equal(save(draft, { visible: false }).requests.length, 0)
    assert.equal(save(draft, { responseUuid: 'squad-b' }).requests.length, 0)
})

test('late save success does not close a new scope or a newer edited draft', () => {
    const pending = save(editor().receive('squad-a', true, ['a']))
    pending.generation.current += 1
    pending.requests[0].mutationFns.onSuccess()
    assert.equal(pending.hidden(), 0)
})

test('drawer invalidates save completion on entity, visibility, revision changes and unmount', () => {
    const file = sourceFile('./internal-squads-inbounds.drawer.tsx')
    let effect: ts.CallExpression | undefined
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(file) === 'useLayoutEffect')
            effect = node
        ts.forEachChild(node, visit)
    }
    visit(file)
    assert(effect)
    const generation = { current: 0 }
    let cleanup: (() => void) | undefined
    evaluate(`${effect.getText(file)};`, {
        editGeneration: generation,
        squadUuid: 'squad-a',
        modal: { visible: true },
        revision: 2,
        useLayoutEffect: (setup: () => () => void, dependencies: unknown[]) => {
            assert.deepEqual(dependencies, ['squad-a', true, 2])
            cleanup = setup()
        }
    })
    assert(cleanup)
    cleanup()
    assert.equal(generation.current, 1)
    // Supplementary wiring check only: both existing renderers still receive the same source.
    assert.equal((file.text.match(/selectedInbounds=\{selectedInbounds\}/g) ?? []).length, 2)
    assert.doesNotMatch(file.text, /setSelectedInbounds\(new Set\(internalSquad\.inbounds/)
})
