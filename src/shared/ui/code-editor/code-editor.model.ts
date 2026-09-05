import type { BeforeMount, Monaco, OnChange, OnMount, OnValidate } from '@monaco-editor/react'
import type { editor, IDisposable } from 'monaco-editor'

import { parse } from 'jsonc-parser'

import { describeJsonPath } from '../../utils/monaco/json-path.ts'
import { repairJsonInEditor, type RepairResult } from '../../utils/monaco/repair-json.ts'

export const REPAIR_ACTION_ID = 'remnawave.repairJson'
export const REPAIR_MESSAGES: Record<RepairResult, string> = {
    failed: 'Could not repair this JSON',
    repaired: 'JSON repaired',
    unchanged: 'Nothing to repair'
}

export interface CodeEditorConfiguration {
    isJson: boolean
    showJsonPath: boolean
    keepCurrentModel?: boolean
    beforeMount?: BeforeMount
    onMount?: OnMount
    onChange?: OnChange
    onValidate?: OnValidate
    onPath: (path: string[]) => void
    onRepair: (result: RepairResult) => void
}

export function currentEditorMarkers(
    markers: editor.IMarker[],
    model: editor.ITextModel
): editor.IMarker[] | null {
    const valid = markers.filter(
        (marker) =>
            marker.resource.toString() === model.uri.toString() &&
            (marker.modelVersionId === undefined || marker.modelVersionId === model.getVersionId())
    )
    return markers.length > 0 && valid.length === 0 ? null : valid
}

/** Own only our actions/listeners and models created during this editor's lifetime.
 * @monaco-editor/react still owns the editor and its current model; unrelated
 * pre-existing models and explicit keepCurrentModel callers are left untouched. */
export function createCodeEditorRuntime(initial: CodeEditorConfiguration) {
    let config = initial
    let active = false
    let instance: editor.IStandaloneCodeEditor | null = null
    let baseline = new Set<editor.ITextModel>()
    const ownedModels = new Set<editor.ITextModel>()
    let listeners: IDisposable[] = []
    let bindingGeneration = 0
    let text = ''
    let document: unknown
    const detach = () => {
        bindingGeneration++
        listeners.forEach((listener) => listener.dispose())
        listeners = []
    }
    const trackModel = () => {
        const model = instance?.getModel()
        if (model && !baseline.has(model)) ownedModels.add(model)
        return model
    }
    const updatePath = (refresh = false) => {
        if (!active || !instance || !config.showJsonPath) return
        const model = trackModel()
        const [range] = instance.getVisibleRanges()
        if (!model || !range || model.isDisposed()) {
            config.onPath([])
            return
        }
        if (refresh) {
            text = model.getValue()
            document = parse(text)
        }
        const offset = model.getOffsetAt({
            lineNumber: range.startLineNumber,
            column: model.getLineMaxColumn(range.startLineNumber)
        })
        config.onPath(describeJsonPath(text, offset, document))
    }
    const attach = () => {
        detach()
        if (!active || !instance) return
        const editorInstance = instance
        const binding = bindingGeneration
        const stillCurrent = () =>
            active && instance === editorInstance && bindingGeneration === binding
        trackModel()
        listeners.push(
            editorInstance.onDidChangeModel(() => {
                if (stillCurrent()) {
                    trackModel()
                    updatePath(true)
                }
            })
        )
        if (config.isJson)
            listeners.push(
                editorInstance.addAction({
                    id: REPAIR_ACTION_ID,
                    label: 'Repair JSON',
                    contextMenuGroupId: '1_modification',
                    contextMenuOrder: 1.32,
                    run: (target) => {
                        if (!stillCurrent() || target !== editorInstance) return
                        const result = repairJsonInEditor(editorInstance)
                        if (stillCurrent()) config.onRepair(result)
                    }
                })
            )
        if (config.showJsonPath) {
            updatePath(true)
            listeners.push(
                editorInstance.onDidScrollChange(() => {
                    if (stillCurrent()) updatePath()
                })
            )
            listeners.push(
                editorInstance.onDidChangeModelContent(() => {
                    if (stillCurrent()) updatePath(true)
                })
            )
        }
    }
    return {
        configure: (next: CodeEditorConfiguration) => {
            const changed =
                next.isJson !== config.isJson || next.showJsonPath !== config.showJsonPath
            config = next
            if (changed) attach()
        },
        activate: () => {
            active = true
            attach()
        },
        suspend: () => {
            active = false
            detach()
        },
        prepare: (monaco: Monaco) => {
            baseline = new Set(monaco.editor.getModels())
            if (active) config.beforeMount?.(monaco)
        },
        mount: (next: editor.IStandaloneCodeEditor, monaco: Monaco) => {
            instance = next
            const disposeListener = next.onDidDispose(() => {
                if (instance !== next) return
                detach()
                if (!config.keepCurrentModel) {
                    for (const model of ownedModels)
                        if (model !== next.getModel() && !model.isDisposed()) model.dispose()
                }
                ownedModels.clear()
                instance = null
                disposeListener.dispose()
            })
            attach()
            if (active) config.onMount?.(next, monaco)
        },
        change: (...args: Parameters<OnChange>) => {
            if (active && instance && (args[0] ?? '') === instance.getValue())
                config.onChange?.(...args)
        },
        validate: (markers: editor.IMarker[]) => {
            const model = instance?.getModel()
            if (!active || !model || model.isDisposed()) return
            const current = currentEditorMarkers(markers, model)
            if (current) config.onValidate?.(current)
        }
    }
}
