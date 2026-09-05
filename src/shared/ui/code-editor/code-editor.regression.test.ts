import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { ComponentType } from 'react'

import * as hero from '@heroui/react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

import {
    createBase64Draft,
    detectBase64Language,
    updateBase64Decoded,
    updateBase64Encoded,
    validateBase64Draft
} from '../../_modals/universal/base64-editor-modal/base64-editor.model.ts'
import { parseJsonEditorValue } from '../../_modals/universal/json-editor-modal/json-editor.model.ts'
import * as options from '../../constants/monaco-theme/monaco-editor-options.ts'
import {
    isPseudoFullscreenActive,
    registerPseudoFullscreen
} from '../../hooks/use-pseudo-fullscreen.ts'
import { decodeBase64, encodeBase64 } from '../../utils/misc/base64.ts'
import * as runtimeModule from './code-editor.model.ts'
import {
    createCodeEditorRuntime,
    currentEditorMarkers,
    REPAIR_ACTION_ID,
    type CodeEditorConfiguration
} from './code-editor.model.ts'
import {
    createEditorOperationScope,
    runEditorSchemaSetup,
    saveEditorValue,
    type EditorSetupContext
} from './editor-operation-scope.ts'

const require = createRequire(import.meta.url)
function production<T>(path: string, dependencies: Record<string, unknown> = {}): T {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: true
        }
    }).outputText
    const module = { exports: {} }
    new Function('require', 'module', 'exports', code)(
        (name: string) =>
            name === '@heroui/react'
                ? hero
                : Object.hasOwn(dependencies, name)
                  ? dependencies[name]
                  : require(name),
        module,
        module.exports
    )
    return module.exports as T
}
function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((yes, no) => {
        resolve = yes
        reject = no
    })
    return { promise, resolve, reject }
}

test('JSON preserves empty clearing and valid scalar/array/object values while refusing syntax errors', () => {
    assert.deepEqual(parseJsonEditorValue(' \n '), { valid: true, value: '' })
    for (const value of ['{}', '[]', 'null', 'false', '0', '"value"'])
        assert.deepEqual(parseJsonEditorValue('  ' + value + '  '), { valid: true, value })
    for (const value of ['{bad}', '{"a":1,}', '// comment\n{}', '[1'])
        assert.deepEqual(parseJsonEditorValue(value), { valid: false })
})

test('Base64 synchronizes both panes with UTF-8, JSON/YAML/Text mode, blank clearing and URL-safe input', () => {
    let draft = createBase64Draft(encodeBase64('{"你好":"😀"}'))
    assert.equal(draft.language, 'json')
    assert.equal(draft.decoded, '{"你好":"😀"}')
    draft = updateBase64Decoded({ ...draft, language: 'yaml' }, 'name: 中文\nitems:\n - 😀')
    assert.equal(decodeBase64(draft.encoded), draft.decoded)
    assert.equal(draft.language, 'yaml')
    draft = updateBase64Encoded(draft, '  ' + encodeBase64('[1,2]') + '  ')
    assert.equal(draft.decoded, '[1,2]')
    assert.equal(draft.language, 'yaml', 'manual language preference is not reset on each edit')
    const urlSafe = encodeBase64('😀').replaceAll('+', '-').replaceAll('/', '_')
    assert.equal(updateBase64Encoded(draft, urlSafe).decoded, '😀')
    assert.deepEqual(updateBase64Decoded(draft, undefined), {
        ...draft,
        decoded: '',
        encoded: '',
        error: null
    })
    assert.equal(detectBase64Language('{invalid}'), 'plaintext')
    assert.equal(detectBase64Language('key: value'), 'plaintext')
    assert.equal(detectBase64Language('[1]'), 'json')
})

test('invalid Base64/UTF-8 preserves the previous decoded draft, blocks save, and starts invalid values in error', () => {
    const initial = createBase64Draft(encodeBase64('retain this draft'))
    for (const invalid of ['%%%', '/w==']) {
        const broken = updateBase64Encoded(initial, invalid)
        assert.equal(broken.decoded, initial.decoded)
        assert.equal(broken.encoded, invalid)
        assert(broken.error)
        assert.equal(validateBase64Draft(broken), false)
        assert.equal(createBase64Draft(invalid).error, broken.error)
        const fixed = updateBase64Decoded(broken, 'fixed')
        assert.equal(fixed.error, null)
        assert(validateBase64Draft(fixed))
    }
})

test('schema operations abort on close/unmount and discard old completion after new presentation/session', async () => {
    const scope = createEditorOperationScope()
    let session = 1
    scope.activate(() => session === 1)
    const old = scope.begin()
    const response = deferred<void>()
    const pending = runEditorSchemaSetup(() => response.promise, old)
    scope.cancel()
    assert(old.signal.aborted)
    scope.activate(() => session === 1)
    const fresh = scope.begin()
    response.resolve()
    assert.equal(await pending, 'stale')
    assert.equal(await runEditorSchemaSetup(() => {}, fresh), 'ready')
    session = 2
    assert.equal(fresh.isCurrent(), false)
    let called = false
    assert.equal(
        await runEditorSchemaSetup(() => {
            called = true
        }, fresh),
        'stale'
    )
    assert.equal(called, false)
    scope.cancel()
})

test('schema failure can be retried and save failure/late completion never masquerades as successful close', async () => {
    const scope = createEditorOperationScope()
    scope.activate(() => true)
    assert.equal(
        await runEditorSchemaSetup(() => {
            throw new Error('schema failure')
        }, scope.begin()),
        'error'
    )
    assert.equal(await runEditorSchemaSetup(() => {}, scope.begin()), 'ready')
    assert.equal(
        await saveEditorValue(
            'draft',
            () => {
                throw new Error('save failure')
            },
            scope.begin()
        ),
        'error'
    )
    let saved = ''
    assert.equal(
        await saveEditorValue(
            'draft',
            (value) => {
                saved = value
            },
            scope.begin()
        ),
        'saved'
    )
    assert.equal(saved, 'draft')
    const response = deferred<void>()
    const operation = scope.begin()
    const pending = saveEditorValue('draft', () => response.promise, operation)
    scope.cancel()
    scope.activate(() => true)
    response.resolve()
    assert.equal(await pending, 'stale')
    assert.equal(
        await saveEditorValue(
            'stale',
            () => {
                assert.fail('closed operation must not save')
            },
            operation
        ),
        'stale'
    )
    scope.cancel()
})

function hostSetupHarness() {
    const file = ts.createSourceFile(
        'schema.tsx',
        readFileSync(
            new URL(
                '../../../features/dashboard/config-profiles/monaco-setup/monaco-setup.feature.tsx',
                import.meta.url
            ),
            'utf8'
        ),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
    )
    const values = new Map(
        file.statements.flatMap((node) =>
            ts.isVariableStatement(node)
                ? [...node.declarationList.declarations].map(
                      (item) => [item.name.getText(file), item.initializer?.getText(file)] as const
                  )
                : []
        )
    )
    const code =
        ['HOST_JSON_FIELD_SCHEMAS', 'buildFinalMaskProperties', 'MonacoSetupHostJsonFieldsFeature']
            .map((name) => {
                assert(values.has(name))
                return 'const ' + name + ' = ' + values.get(name)
            })
            .join('\n') + '\nreturn MonacoSetupHostJsonFieldsFeature'
    const requests: {
        url: string
        signal?: AbortSignal
        response: ReturnType<typeof deferred<{ data: unknown }>>
    }[] = []
    const registered: { uri: string; fileMatch: string[]; schema: { title: string } }[] = []
    let errors = 0
    const javascript = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 }
    }).outputText
    // Execute the actual production method; only HTTP, configuration and Monaco's global registry are boundaries.
    const feature = new Function('app', 'axios', 'registerJsonSchema', 'consola', javascript)(
        {
            configEditor: {
                jsonSchemaUrl: 'https://schema.example/en.json',
                jsonSchemaCnUrl: 'https://schema.example/zh.json'
            }
        },
        {
            get: (url: string, options?: { signal?: AbortSignal }) => {
                const response = deferred<{ data: unknown }>()
                requests.push({ url, signal: options?.signal, response })
                return response.promise
            }
        },
        (schema: (typeof registered)[number]) => registered.push(schema),
        { error: () => errors++ }
    ) as { setup: (language: string, context?: EditorSetupContext) => Promise<void> }
    return { feature, requests, registered, errors: () => errors }
}
const schemaData = (title: string) => ({
    data: {
        definitions: {
            MuxObject: { title },
            SockoptObject: { title },
            FinalMaskObject: { title },
            TCPMask: {},
            UDPMask: {},
            quicParams: {}
        }
    }
})

test('actual Host schema loader ignores a delayed old language after cancellation and keeps all three path mappings', async () => {
    const harness = hostSetupHarness()
    const scope = createEditorOperationScope()
    scope.activate(() => true)
    const old = scope.begin()
    const english = harness.feature.setup('en', old)
    assert.equal(harness.requests[0].url, 'https://schema.example/en.json')
    assert.equal(harness.requests[0].signal, old.signal)
    scope.cancel()
    scope.activate(() => true)
    const chinese = harness.feature.setup('zh', scope.begin())
    harness.requests[1].response.resolve(schemaData('new-language'))
    await chinese
    assert.deepEqual(
        harness.registered.map((schema) => schema.fileMatch),
        [['host-mux://*'], ['host-sockopt://*'], ['host-final-mask://*']]
    )
    assert.equal(harness.registered.length, 3)
    harness.requests[0].response.resolve(schemaData('old-language'))
    await english
    assert.equal(harness.registered.length, 3)
    assert(harness.registered.every((schema) => schema.schema.title === 'new-language'))
    scope.cancel()
})

test('actual Host schema loader respects session changes without an abort and preserves legacy error handling', async () => {
    const harness = hostSetupHarness()
    let session = 1
    const scope = createEditorOperationScope()
    scope.activate(() => session === 1)
    const stale = harness.feature.setup('en', scope.begin())
    session = 2
    harness.requests[0].response.resolve(schemaData('old-session'))
    await stale
    assert.equal(harness.registered.length, 0)
    scope.activate(() => true)
    const failure = harness.feature.setup('en', scope.begin())
    harness.requests[1].response.reject(new Error('fixture schema error'))
    await assert.rejects(failure)
    assert.equal(harness.errors(), 0)
    const legacy = harness.feature.setup('en')
    harness.requests[2].response.reject(new Error('fixture legacy error'))
    await legacy
    assert.equal(harness.errors(), 1)
    scope.cancel()
})

// Contract-faithful event fixtures: these test our Monaco bindings, not a real browser/Monaco worker.
function modelFixture(uri: string, initial: string) {
    let text = initial,
        version = 1,
        disposed = false
    const model = {
        uri: { toString: () => uri },
        getValue: () => text,
        getVersionId: () => version,
        isDisposed: () => disposed,
        dispose: () => {
            disposed = true
        },
        getFullModelRange: () => ({}),
        getLineMaxColumn: (line: number) => (text.split('\n')[line - 1]?.length ?? 0) + 1,
        getOffsetAt: ({ lineNumber, column }: { lineNumber: number; column: number }) =>
            text
                .split('\n')
                .slice(0, lineNumber - 1)
                .reduce((sum, line) => sum + line.length + 1, 0) +
            column -
            1
    } as unknown as editor.ITextModel
    return {
        model,
        replace: (next: string) => {
            text = next
            version++
        },
        disposed: () => disposed
    }
}
function editorFixture(initial: ReturnType<typeof modelFixture>) {
    let current = initial,
        visibleLine = 2,
        formatRuns = 0,
        undoStops = 0
    const listeners = new Map<string, Set<() => void>>()
    const actions = new Map<string, editor.IActionDescriptor>()
    const subscribe = (type: string, callback: () => void) => {
        const entries = listeners.get(type) ?? new Set()
        entries.add(callback)
        listeners.set(type, entries)
        return { dispose: () => entries.delete(callback) }
    }
    const emit = (type: string) =>
        [...(listeners.get(type) ?? [])].forEach((callback) => callback())
    const instance = {
        getModel: () => current.model,
        getValue: () => current.model.getValue(),
        getVisibleRanges: () => [{ startLineNumber: visibleLine }],
        onDidChangeModel: (callback: () => void) => subscribe('model', callback),
        onDidScrollChange: (callback: () => void) => subscribe('scroll', callback),
        onDidChangeModelContent: (callback: () => void) => subscribe('content', callback),
        onDidDispose: (callback: () => void) => subscribe('dispose', callback),
        addAction: (action: editor.IActionDescriptor) => {
            actions.set(action.id, action)
            return {
                dispose: () => {
                    if (actions.get(action.id) === action) actions.delete(action.id)
                }
            }
        },
        executeEdits: (_source: string, edits: { text: string }[]) => {
            current.replace(edits[0].text)
            emit('content')
        },
        pushUndoStop: () => {
            undoStops++
        },
        getAction: () => ({
            run: () => {
                formatRuns++
            }
        })
    } as unknown as editor.IStandaloneCodeEditor
    return {
        instance,
        actions,
        emit,
        listeners,
        replace: (value: string) => {
            current.replace(value)
            emit('content')
        },
        switchModel: (next: ReturnType<typeof modelFixture>) => {
            current = next
            emit('model')
        },
        scroll: (line: number) => {
            visibleLine = line
            emit('scroll')
        },
        formatRuns: () => formatRuns,
        undoStops: () => undoStops
    }
}
function marker(model: editor.ITextModel, version?: number, resource = model.uri): editor.IMarker {
    return {
        resource,
        owner: 'fixture',
        severity: 8,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
        message: 'fixture marker',
        modelVersionId: version
    }
}

test('editor runtime uses actual JSON path/repair logic through editor events and disposes every binding', () => {
    const model = modelFixture('fixture://one', '{\n"items": [\n{"name":"first", "value":1}\n]\n}')
    const editor = editorFixture(model)
    const paths: string[][] = [],
        repairs: string[] = []
    const config: CodeEditorConfiguration = {
        isJson: true,
        showJsonPath: true,
        onPath: (path) => paths.push(path),
        onRepair: (result) => repairs.push(result)
    }
    const runtime = createCodeEditorRuntime(config)
    const monaco = { editor: { getModels: () => [] } } as unknown as Monaco
    runtime.activate()
    runtime.prepare(monaco)
    runtime.mount(editor.instance, monaco)
    editor.scroll(3)
    assert(paths.at(-1)?.includes('first'))
    editor.replace('{name: "second"}')
    const action = editor.actions.get(REPAIR_ACTION_ID)
    assert(action)
    action.run(editor.instance)
    assert.deepEqual(JSON.parse(model.model.getValue()), { name: 'second' })
    assert.equal(repairs.at(-1), 'repaired')
    assert.equal(editor.undoStops(), 1)
    assert.equal(editor.formatRuns(), 1)
    action.run(editor.instance)
    assert.equal(repairs.at(-1), 'unchanged')
    runtime.configure({ ...config, isJson: false, showJsonPath: false })
    assert.equal(editor.actions.size, 0)
    const repairCount = repairs.length
    action.run(editor.instance)
    assert.equal(repairs.length, repairCount, 'disposed old language action must not run')
    runtime.configure(config)
    assert.equal(editor.actions.size, 1)
    const latestAction = editor.actions.get(REPAIR_ACTION_ID)!
    runtime.suspend()
    const count = paths.length
    editor.scroll(1)
    latestAction.run(editor.instance)
    assert.equal(paths.length, count)
    assert.equal(repairs.length, repairCount)
    assert.equal(editor.listeners.get('content')?.size, 0)
    assert.equal(editor.listeners.get('scroll')?.size, 0)
    runtime.activate()
    assert.equal(editor.actions.size, 1, 'StrictMode reactivation restores exactly one action')
    editor.emit('dispose')
    assert.equal(editor.actions.size, 0)
    assert([...editor.listeners.values()].every((entries) => entries.size === 0))
})

test('model switches release only owned inactive models; keepCurrentModel and pre-existing models are preserved', () => {
    for (const keepCurrentModel of [false, true]) {
        const borrowed = modelFixture('fixture://borrowed', '{}')
        const initial = modelFixture('fixture://initial', '{}')
        const current = modelFixture('fixture://current', '{}')
        const editor = editorFixture(initial)
        const runtime = createCodeEditorRuntime({
            isJson: false,
            showJsonPath: false,
            keepCurrentModel,
            onPath: () => {},
            onRepair: () => {}
        })
        const monaco = { editor: { getModels: () => [borrowed.model] } } as unknown as Monaco
        runtime.activate()
        runtime.prepare(monaco)
        runtime.mount(editor.instance, monaco)
        editor.switchModel(borrowed)
        editor.switchModel(current)
        runtime.suspend()
        editor.emit('dispose')
        assert.equal(initial.disposed(), !keepCurrentModel)
        assert.equal(borrowed.disposed(), false)
        assert.equal(
            current.disposed(),
            false,
            'current model belongs to @monaco-editor/react disposal'
        )
    }
})

test('marker callbacks reject other resources/versions and stop after teardown; current callbacks stay live', () => {
    const model = modelFixture('fixture://current', '{}')
    const other = modelFixture('fixture://other', '{}')
    const instance = editorFixture(model)
    const changes: string[] = [],
        validations: editor.IMarker[][] = []
    let mounted = 0,
        prepared = 0
    const runtime = createCodeEditorRuntime({
        isJson: false,
        showJsonPath: false,
        onPath: () => {},
        onRepair: () => {},
        beforeMount: () => prepared++,
        onMount: () => mounted++,
        onChange: (value) => changes.push(value ?? ''),
        onValidate: (markers) => validations.push(markers)
    })
    const monaco = { editor: { getModels: () => [] } } as unknown as Monaco
    runtime.activate()
    runtime.prepare(monaco)
    runtime.mount(instance.instance, monaco)
    assert.equal(prepared, 1)
    assert.equal(mounted, 1)
    assert.equal(currentEditorMarkers([marker(other.model)], model.model), null)
    runtime.validate([marker(model.model, 0)])
    runtime.validate([marker(other.model)])
    assert.equal(validations.length, 0)
    runtime.validate([marker(model.model, 1)])
    runtime.validate([])
    assert.equal(validations.length, 2)
    runtime.change('stale', {} as editor.IModelContentChangedEvent)
    runtime.change('{}', {} as editor.IModelContentChangedEvent)
    assert.deepEqual(changes, ['{}'])
    runtime.suspend()
    runtime.validate([])
    runtime.change('{}', {} as editor.IModelContentChangedEvent)
    assert.equal(validations.length, 2)
    assert.equal(changes.length, 1)
    instance.emit('dispose')
})

test('fullscreen Escape respects Monaco consumption, only exits the top window, and cleans up listeners', () => {
    const target = new EventTarget()
    const closed: string[] = []
    let firstCleanup = () => {},
        secondCleanup = () => {}
    firstCleanup = registerPseudoFullscreen('fixture-first', target, () => {
        closed.push('first')
        firstCleanup()
    })
    secondCleanup = registerPseudoFullscreen('fixture-second', target, () => {
        closed.push('second')
        secondCleanup()
    })
    const escape = (consumed = false) => {
        const event = new Event('keydown', { cancelable: true })
        Object.assign(event, { key: 'Escape' })
        if (consumed) event.preventDefault()
        target.dispatchEvent(event)
    }
    assert(isPseudoFullscreenActive())
    escape(true)
    assert.deepEqual(closed, [])
    escape()
    assert.deepEqual(closed, ['second'])
    escape()
    assert.deepEqual(closed, ['second', 'first'])
    assert.equal(isPseudoFullscreenActive(), false)
    escape()
    assert.equal(closed.length, 2)
})

test('actual HeroUI editor SSR retains Monaco loader, JSON path, validation status, footer and fullscreen button', () => {
    const status = production<typeof import('./editor-status-bar')>('./editor-status-bar.tsx', {
        './CodeEditor.module.css': {}
    })
    const footer = production<typeof import('./editor-footer')>('./editor-footer.tsx', {
        './CodeEditor.module.css': {}
    })
    const fullscreen = production<
        typeof import('../fullscreen-toggle-button/fullscreen-toggle-button')
    >('../fullscreen-toggle-button/fullscreen-toggle-button.tsx', { './Fullscreen.module.css': {} })
    const { CodeEditor } = production<{
        CodeEditor: ComponentType<{
            defaultLanguage: string
            value: string
            footer: ReturnType<typeof createElement>
        }>
    }>('./code-editor.tsx', {
        '@shared/constants/monaco-theme': options,
        './code-editor.model': runtimeModule,
        './editor-status-bar': status,
        './CodeEditor.module.css': {}
    })
    const html = renderToStaticMarkup(
        createElement(
            'div',
            {},
            createElement(CodeEditor, {
                defaultLanguage: 'json',
                value: '{}',
                footer: status.EditorStatusBar({
                    status: 'error',
                    children: 'Fixture validation error'
                })
            }),
            footer.EditorFooter({
                children: createElement(fullscreen.FullscreenToggleButton, {
                    isFullscreen: false,
                    onToggle: () => {}
                })
            })
        )
    )
    assert.match(html, /JSON path/)
    assert.match(html, /Loading editor/)
    assert.match(html, /Fixture validation error/)
    assert.match(html, /role="alert"/)
    assert.match(html, /aria-label="Enter fullscreen"/)
    assert.doesNotMatch(html, /<textarea|mantine-/)
})
