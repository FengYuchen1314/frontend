import type { EditorProps } from '@monaco-editor/react'
import type { ReactNode } from 'react'

import { Spinner } from '@heroui/react'
import Editor from '@monaco-editor/react'
import clsx from 'clsx'
import { Fragment, useLayoutEffect, useState } from 'react'

import { BASE_MONACO_OPTIONS, MONACO_THEME_NAME } from '@shared/constants/monaco-theme'
import type { RepairResult } from '@shared/utils/monaco/repair-json'

import { createCodeEditorRuntime, REPAIR_MESSAGES } from './code-editor.model'
import styles from './CodeEditor.module.css'
import { EditorStatusBar } from './editor-status-bar'

export interface CodeEditorProps extends Omit<EditorProps, 'wrapperProps'> {
    footer?: ReactNode
    withJsonPath?: boolean
    wrapperProps?: Record<string, unknown> & { className?: string }
}

export function CodeEditor(props: CodeEditorProps) {
    const {
        defaultLanguage,
        footer,
        language,
        onMount,
        beforeMount,
        onChange,
        onValidate,
        options,
        withJsonPath,
        wrapperProps,
        keepCurrentModel,
        loading,
        theme = MONACO_THEME_NAME,
        ...rest
    } = props
    const [jsonPath, setJsonPath] = useState<string[]>([])
    const [repairResult, setRepairResult] = useState<RepairResult | null>(null)
    const isJson = (language ?? defaultLanguage) === 'json'
    const showJsonPath = withJsonPath ?? isJson
    const configuration = {
        isJson,
        showJsonPath,
        keepCurrentModel,
        onMount,
        beforeMount,
        onChange,
        onValidate,
        onPath: (next: string[]) =>
            setJsonPath((current) =>
                current.length === next.length &&
                current.every((segment, index) => segment === next[index])
                    ? current
                    : next
            ),
        onRepair: setRepairResult
    }
    const [runtime] = useState(() => createCodeEditorRuntime(configuration))
    useLayoutEffect(() => {
        runtime.configure(configuration)
    })
    useLayoutEffect(() => {
        runtime.activate()
        return runtime.suspend
    }, [runtime])

    return (
        <div className={styles.root}>
            {showJsonPath && (
                <div aria-label="JSON path" className={styles.pathBar}>
                    <p className={styles.pathText}>
                        {jsonPath.map((segment, index) => (
                            <Fragment key={index + '-' + segment}>
                                {index > 0 && <span className={styles.pathSeparator}> › </span>}
                                <span
                                    className={
                                        index === jsonPath.length - 1
                                            ? styles.pathSegmentActive
                                            : undefined
                                    }
                                >
                                    {segment}
                                </span>
                            </Fragment>
                        ))}
                    </p>
                </div>
            )}
            <Editor
                {...rest}
                beforeMount={runtime.prepare}
                defaultLanguage={defaultLanguage}
                keepCurrentModel={keepCurrentModel}
                language={language}
                loading={
                    loading ?? (
                        <div className={styles.loading} role="status">
                            <Spinner />
                            <span>Loading editor…</span>
                        </div>
                    )
                }
                onChange={runtime.change}
                onMount={runtime.mount}
                onValidate={runtime.validate}
                options={{ ...BASE_MONACO_OPTIONS, ...options }}
                theme={theme}
                wrapperProps={{
                    ...wrapperProps,
                    className: clsx(styles.editorWrapper, wrapperProps?.className)
                }}
            />
            {repairResult && (
                <EditorStatusBar
                    status={
                        repairResult === 'failed'
                            ? 'error'
                            : repairResult === 'repaired'
                              ? 'success'
                              : 'warning'
                    }
                >
                    {REPAIR_MESSAGES[repairResult]}
                </EditorStatusBar>
            )}
            {footer}
        </div>
    )
}

export { styles as editorClasses }
