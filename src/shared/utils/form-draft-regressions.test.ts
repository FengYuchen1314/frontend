import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const cards = '../../widgets/dashboard/subscription-settings/settings/cards/'
const tabs = '../_modals/external-squads/external-squads-drawer/tabs/'

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
    assert.equal(matches.length, 1, 'the regression must identify exactly one source expression')
    return matches[0]
}

function declaration(file: ts.SourceFile, name: string) {
    return findNode(
        file,
        (node): node is ts.VariableDeclaration =>
            ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
    )
}

// Execute the real leaf event handlers with their external state/API boundary supplied by the
// test. This is not a DOM renderer; separate wiring checks guard the inputs and lifecycle below.
function evaluate<T>(code: string, scope: Record<string, unknown>): T {
    const js = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
    }).outputText
    return new Function(...Object.keys(scope), js)(...Object.values(scope)) as T
}

function handlers<T>(file: ts.SourceFile, names: string[], scope: Record<string, unknown>): T {
    const code = names.map((name) => `const ${declaration(file, name).getText(file)};`).join('\n')
    return evaluate<T>(`${code}\nreturn { ${names.join(', ')} };`, scope)
}

test('remarks notify the parent synchronously for typing, adding and removing without mutating props', () => {
    const file = sourceFile(`${cards}managers/remarks-manager.widget.tsx`)
    const initialRemarks = Object.freeze(['one', 'two'])
    const changes: string[][] = []
    const events = handlers<{
        addLocalRemark: () => void
        removeLocalRemark: (index: number) => void
        updateLocalRemark: (index: number, value: string) => void
    }>(file, ['addLocalRemark', 'removeLocalRemark', 'updateLocalRemark'], {
        initialRemarks,
        onChange: (value: string[]) => changes.push(value)
    })

    events.updateLocalRemark(1, 'latest keystroke')
    assert.deepEqual(changes.pop(), ['one', 'latest keystroke'])
    events.addLocalRemark()
    assert.deepEqual(changes.pop(), ['one', 'two', ''])
    events.removeLocalRemark(0)
    assert.deepEqual(changes.pop(), ['two'])
    assert.deepEqual(initialRemarks, ['one', 'two'])

    const lastRow = handlers<{ removeLocalRemark: (index: number) => void }>(
        file,
        ['removeLocalRemark'],
        { initialRemarks: ['last'], onChange: (value: string[]) => changes.push(value) }
    )
    lastRow.removeLocalRemark(0)
    assert.deepEqual(changes.pop(), [''])
    assert.doesNotMatch(file.text, /useDebouncedValue|setTimeout|useEffect|setLocalRemarks/)
    assert.match(file.text, /initialRemarks\.map\(/)
})

function submitHeaders(localHeaders: { key: string; value: string }[]) {
    const file = sourceFile(`${cards}subscription-response-headers-card.widget.tsx`)
    const submitted: unknown[] = []
    const errors: string[] = []
    const { handleSubmit } = handlers<{ handleSubmit: () => void }>(
        file,
        ['HEADER_NAME_REGEX', 'HEADER_VALUE_REGEX', 'handleSubmit'],
        {
            localHeaders,
            form: {
                onSubmit: (submit: (values: { uuid: string }) => void) => () =>
                    submit({ uuid: 'settings-a' }),
                setFieldError: (_field: string, error: string) => errors.push(error)
            },
            mutate: (body: unknown) => submitted.push(body)
        }
    )
    handleSubmit()
    return { errors, submitted }
}

test('immediate response-header Save submits the displayed draft and deduplicates names case-insensitively', () => {
    const localHeaders = [
        { key: ' X-Example ', value: 'old' },
        { key: 'x-example', value: 'latest keystroke' },
        { key: ' ', value: 'unfinished row' },
        { key: 'Profile-Title', value: ' rwEncodeBase64:line one\nline two ' }
    ]
    const { errors, submitted } = submitHeaders(localHeaders)
    assert.deepEqual(errors, [])
    assert.deepEqual(submitted, [
        {
            variables: {
                uuid: 'settings-a',
                customResponseHeaders: {
                    'x-example': 'latest keystroke',
                    'profile-title': 'rwEncodeBase64:line one\nline two'
                }
            }
        }
    ])
    assert.equal(localHeaders[0].key, ' X-Example ')
    const file = sourceFile(`${cards}subscription-response-headers-card.widget.tsx`)
    assert.doesNotMatch(file.text, /useEffect|setTimeout|setHeaders|isInitializedRef/)
    assert.match(file.text, /localHeaders\.map\(\(header, index\)/)
})

test('invalid response headers never reach the mutation and the draft is left intact', () => {
    for (const row of [
        { key: 'bad header', value: 'value' },
        { key: 'x-good', value: 'line one\nline two' },
        { key: 'x-good', value: '\u0000' }
    ]) {
        const draft = [Object.freeze({ ...row })]
        const { errors, submitted } = submitHeaders(draft)
        assert.equal(errors.length, 1)
        assert.deepEqual(submitted, [])
        assert.deepEqual(draft, [row])
    }
})

test('form identity resets on record switch, not on same-record refetch or mutation error', () => {
    const forms = [
        [`${tabs}external-squad-overrides-tab.widget.tsx`, 'ExternalSquadOverridesForm'],
        [`${tabs}external-squads-custom-remarks.widget.tsx`, 'ExternalSquadsCustomRemarksForm'],
        [`${tabs}external-squads-hwid-settings.tab.widget.tsx`, 'ExternalSquadsHwidSettingsForm'],
        [`${tabs}external-squads-response-headers.widget.tsx`, 'ExternalSquadsResponseHeadersForm'],
        [`${tabs}external-squads-templates.tab.widget.tsx`, 'ExternalSquadsTemplatesForm'],
        [
            `${cards}subscription-response-headers-card.widget.tsx`,
            'SubscriptionResponseHeadersForm'
        ],
        [`${cards}subscription-user-remarks-card.widget.tsx`, 'SubscriptionUserRemarksForm']
    ]
    for (const [path, component] of forms) {
        const file = sourceFile(path)
        const element = findNode(
            file,
            (node): node is ts.JsxSelfClosingElement =>
                ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === component
        )
        const key = element.attributes.properties.find(
            (prop): prop is ts.JsxAttribute =>
                ts.isJsxAttribute(prop) && prop.name.getText(file) === 'key'
        )
        assert(key?.initializer && ts.isJsxExpression(key.initializer))
        const keyExpression = key.initializer.expression!.getText(file)
        const getKey = (uuid: string, remoteVersion: number, overrideKey = 'hostOverrides') => {
            const record = { uuid, remoteVersion, name: `changed ${remoteVersion}` }
            return evaluate<unknown>(`return ${keyExpression}`, {
                props: {
                    externalSquad: record,
                    subscriptionSettings: record,
                    config: { overrideKey }
                },
                externalSquad: record,
                subscriptionSettings: record
            })
        }
        assert.equal(getKey('record-a', 1), getKey('record-a', 2), path)
        assert.notEqual(getKey('record-a', 1), getKey('record-b', 1), path)
        if (component === 'ExternalSquadOverridesForm') {
            assert.notEqual(getKey('record-a', 1), getKey('record-a', 1, 'subscriptionSettings'))
        }
        assert.doesNotMatch(
            file.text,
            /useEffect|setPrevSettings|setRemarks\(computeRemarks\(data\)\)/
        )
    }
})

test('tag search honors an uncontrolled default and keeps created choices through a tags refetch', () => {
    const file = sourceFile('../ui/createable-tag-input/createable-tag-input.tsx')
    const searchState = findNode(
        file,
        (node): node is ts.VariableDeclaration =>
            ts.isVariableDeclaration(node) &&
            ts.isArrayBindingPattern(node.name) &&
            node.name.elements[0]?.getText(file) === 'search'
    )
    const initialSearch = (value: string | null | undefined, defaultValue: string | null) =>
        evaluate<string>(`return ${searchState.initializer!.getText(file)}`, {
            useState: (initial: string) => initial,
            value,
            defaultValue
        })
    assert.equal(initialSearch(undefined, 'DEFAULT_TAG'), 'DEFAULT_TAG')
    assert.equal(initialSearch('CONTROLLED', 'DEFAULT_TAG'), 'CONTROLLED')
    assert.equal(initialSearch(null, 'DEFAULT_TAG'), '')
    assert.equal(initialSearch('', 'DEFAULT_TAG'), '')
    const data = declaration(file, 'data').initializer!.getText(file)
    assert.deepEqual(
        evaluate<string[]>(`return ${data}`, {
            tags: ['OLD', 'NEW', 'CREATED'],
            createdTags: ['CREATED']
        }),
        ['OLD', 'NEW', 'CREATED']
    )
    assert.doesNotMatch(file.text, /useEffect|setData\(tags\)/)
    assert.match(file.text, /if \(previousValue !== value\)/)
})

test('numeric overrides display zero as zero rather than an empty field', () => {
    const file = sourceFile(`${tabs}external-squad-overrides-tab.widget.tsx`)
    const input = findNode(
        file,
        (node): node is ts.JsxSelfClosingElement =>
            ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'NumberInput'
    )
    const attribute = input.attributes.properties.find(
        (node): node is ts.JsxAttribute =>
            ts.isJsxAttribute(node) && node.name.getText(file) === 'value'
    )!
    assert(attribute.initializer && ts.isJsxExpression(attribute.initializer))
    const valueExpression = attribute.initializer.expression!.getText(file)
    assert.equal(evaluate(`return ${valueExpression}`, { value: 0 }), 0)
    assert.equal(evaluate(`return ${valueExpression}`, { value: undefined }), '')
    assert.equal(evaluate(`return ${valueExpression}`, { value: 123 }), 123)
})
