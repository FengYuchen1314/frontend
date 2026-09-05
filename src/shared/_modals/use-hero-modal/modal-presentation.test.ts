import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Children, isValidElement, type ReactNode } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'

import { nextModalPresentation } from './modal-presentation'

for (const locale of ['en', 'zh', 'ru', 'fa']) {
    test(`${locale} contains every shared dialog message without falling back to another language`, () => {
        const root = new URL('../../../../public/locales/', import.meta.url)
        const english = JSON.parse(readFileSync(new URL('en/remnawave.json', root), 'utf8'))[
            'shared-dialogs'
        ]
        const translated = JSON.parse(
            readFileSync(new URL(`${locale}/remnawave.json`, root), 'utf8')
        )['shared-dialogs']
        assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort())
        for (const message of Object.values(translated)) {
            assert.equal(typeof message, 'string')
            assert((message as string).trim().length > 0)
        }
    })
}

test('the actual modal controller exposes a stable presentation key and changes it before a new form commits', () => {
    const source = readFileSync(new URL('./use-hero-modal.tsx', import.meta.url), 'utf8')
    const ast = ts.createSourceFile(
        'hook.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    const declaration = ast.statements.find(
        (statement) =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === 'useHeroModal'
    )
    assert(declaration)
    const code = ts.transpileModule(declaration.getText(ast), {
        compilerOptions: { module: ts.ModuleKind.CommonJS }
    }).outputText
    const states: unknown[] = []
    let cursor = 0
    let dirty = false
    const run = new Function(
        'exports',
        'useState',
        'useLayoutEffect',
        'createHeroModalLifecycle',
        'getSessionGeneration',
        'nextModalPresentation',
        `${code}; return useHeroModal`
    )(
        {},
        (initial: unknown) => {
            const index = cursor++
            if (!(index in states))
                states[index] = typeof initial === 'function' ? initial() : initial
            return [
                states[index],
                (value: unknown) => {
                    states[index] = value
                    dirty = true
                }
            ]
        },
        () => {},
        () => ({}),
        () => 0,
        nextModalPresentation
    )
    function render(modal: { visible: boolean; args: unknown }, scopeKey = 'same-entity') {
        let result
        do {
            cursor = 0
            dirty = false
            result = run({ modal, scopeKey })
        } while (dirty)
        return result.presentationKey
    }
    const args = { uuid: 'same-entity' }
    const first = render({ visible: true, args })
    assert.equal(render({ visible: true, args }), first)
    assert.equal(render({ visible: false, args }), first)
    assert.equal(render({ visible: true, args }), first + 1)
    assert.equal(render({ visible: true, args: { ...args } }), first + 2)
})

test('same visible invocation and ordinary refetch retain the exact presentation', () => {
    const invocation = { uuid: 'a' }
    const initial = { invocation, scope: 'entity:a', visible: true, key: 3 }
    assert.equal(nextModalPresentation(initial, invocation, 'entity:a', true), initial)
})

test('closing preserves exit content; reopening even with identical args resets the form identity', () => {
    const invocation = { uuid: 'a' }
    const initial = { invocation, scope: 'entity:a', visible: true, key: 3 }
    const closed = nextModalPresentation(initial, invocation, 'entity:a', false)
    assert.equal(closed.key, 3)
    assert.equal(nextModalPresentation(closed, invocation, 'entity:a', true).key, 4)
})

test('a new NiceModal show for the same entity and a changed entity each get a new presentation', () => {
    const invocation = { uuid: 'a' }
    const initial = { invocation, scope: 'entity:a', visible: true, key: 3 }
    assert.equal(nextModalPresentation(initial, { ...invocation }, 'entity:a', true).key, 4)
    assert.equal(nextModalPresentation(initial, invocation, 'entity:b', true).key, 4)
})

function dialogElementKey(file: string, component: string, presentationKey: number) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let body: ts.Expression | undefined
    for (const statement of ast.statements) {
        if (!ts.isVariableStatement(statement)) continue
        for (const declaration of statement.declarationList.declarations) {
            if (declaration.name.getText(ast) !== component || !declaration.initializer) continue
            if (ts.isCallExpression(declaration.initializer))
                body = declaration.initializer.arguments[0]
        }
    }
    assert(body, 'Production NiceModal component was not found')
    const code = ts.transpileModule(`const Component = ${body.getText(ast)}`, {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS }
    }).outputText
    const FormMarker = () => null
    const modalParts = Object.assign(() => null, {
        Backdrop: () => null,
        Container: () => null,
        Dialog: () => null,
        CloseTrigger: () => null,
        Header: () => null,
        Heading: () => null,
        Body: () => null
    })
    const dependencies = {
        exports: {},
        useModal: () => ({}),
        useHeroModal: () => ({ presentationKey, isOpen: true }),
        useTranslation: () => ({ t: (key: string) => key }),
        Modal: modalParts,
        HeroModalPresence: () => null,
        TbPencil: () => null,
        TbTags: () => null,
        RenameDialogForm: FormMarker,
        TagsDialogForm: FormMarker,
        renameDefinitions: { internalSquad: {} },
        tagsDefinitions: { internalSquad: {} }
    }
    const render = new Function(
        'require',
        ...Object.keys(dependencies),
        `${code}; return Component`
    )(
        (name: string) => {
            assert.equal(name, 'react/jsx-runtime')
            return jsxRuntime
        },
        ...Object.values(dependencies)
    )
    const tree = render({
        name: 'Fixture',
        tags: [],
        renameFrom: 'internalSquad',
        editTagsFrom: 'internalSquad',
        uuid: 'same-entity'
    })
    let key: string | null | undefined
    const visit = (node: ReactNode) =>
        Children.forEach(node, (child) => {
            if (!isValidElement<{ children?: ReactNode }>(child)) return
            if (child.type === FormMarker) key = child.key
            visit(child.props.children)
        })
    visit(tree)
    assert.notEqual(key, undefined, 'Actual modal must contain its form')
    return key
}

for (const [file, component] of [
    ['../universal/rename-drawer/rename.drawer.tsx', 'RenameModalShared'],
    ['../universal/edit-tags-modal/edit-tags.modal.tsx', 'EditTagsModalShared']
]) {
    test(`${component} remounts its actual form on a new presentation even for the same UUID`, () => {
        assert.notEqual(dialogElementKey(file, component, 1), dialogElementKey(file, component, 2))
        assert.equal(dialogElementKey(file, component, 1), dialogElementKey(file, component, 1))
    })
}
