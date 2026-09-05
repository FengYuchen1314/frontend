import type { editor } from 'monaco-editor'

import { ConfigEditorActionsFeature } from '@features/dashboard/config-profiles/config-editor-actions'
import { ConfigValidationFeature } from '@features/dashboard/config-profiles/config-validation'
import { MonacoSetupFeature } from '@features/dashboard/config-profiles/monaco-setup'
import { Alert, Box, Button, Code, Group, Loader, Paper, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useMonaco } from '@monaco-editor/react'
import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbAlertTriangle, TbInfoCircle } from 'react-icons/tb'
import { useBlocker } from 'react-router'

import { usePseudoFullscreen, useViewportFillHeight } from '@shared/hooks'
import { CodeEditor, editorClasses, EditorFooter, EditorStatusBar } from '@shared/ui/code-editor'
import { FullscreenToggleButton, fullscreenClasses } from '@shared/ui/fullscreen-toggle-button'
import { LoaderModalShared } from '@shared/ui/loader-modal'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { isMieruProfileConfig } from '@shared/utils/config-profile-runtime'
import { preventBackScroll } from '@shared/utils/misc'

import styles from './ConfigEditor.module.css'
import { IProps } from './interfaces'

export function ConfigEditorWidget(props: IProps) {
    const { t, i18n } = useTranslation()
    const monaco = useMonaco()

    const { configProfile, isWasmCrashed, isWasmRestarting, onRestartWasm, snippets } = props
    const isMieruConfig = isMieruProfileConfig(configProfile.config)

    const [result, setResult] = useState('')
    const [isConfigValid, setIsConfigValid] = useState(true)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [originalValue, setOriginalValue] = useState<string>(
        JSON.stringify(configProfile.config, null, 2) || ''
    )

    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const wasWasmRestarting = useRef(false)

    const { isFullscreen, toggle: toggleFullscreen } = usePseudoFullscreen()
    const { containerRef: editorWrapperRef, footerRef } = useViewportFillHeight({
        enabled: !isFullscreen
    })

    useEffect(() => {
        if (!monaco || isMieruConfig) return

        MonacoSetupFeature.setup(i18n.language, snippets.snippets)
    }, [i18n.language, isMieruConfig, snippets, monaco])

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasUnsavedChanges && currentLocation.pathname !== nextLocation.pathname
    )

    const snippetMap = new Map(snippets.snippets.map((s) => [s.name, s.snippet]))

    useEffect(() => {
        if (
            !isMieruConfig &&
            wasWasmRestarting.current &&
            !isWasmRestarting &&
            !isWasmCrashed &&
            editorRef.current
        ) {
            ConfigValidationFeature.validate(
                editorRef,
                setResult,
                setIsConfigValid,
                snippetMap,
                'XRAY'
            )
        }
        wasWasmRestarting.current = isWasmRestarting
    }, [isMieruConfig, isWasmRestarting, isWasmCrashed])

    const checkForChanges = () => {
        if (!editorRef.current) return

        const currentValue = editorRef.current.getValue()
        const hasChanges = currentValue !== originalValue
        setHasUnsavedChanges(hasChanges)
    }

    useLayoutEffect(() => {
        document.body.addEventListener('wheel', preventBackScroll, {
            passive: false
        })
        return () => {
            document.body.removeEventListener('wheel', preventBackScroll)
        }
    }, [])

    useEffect(() => {
        if (blocker.state === 'blocked') {
            modals.openConfirmModal({
                title: (
                    <BaseOverlayHeader
                        iconColor="red"
                        IconComponent={TbAlertTriangle}
                        iconSize={20}
                        iconVariant="soft"
                        title={t('config-editor.widget.unsaved-changes')}
                    />
                ),
                children: t(
                    'config-editor.widget.your-changes-will-be-lost-if-you-leave-this-page-without-saving'
                ),
                centered: true,
                labels: {
                    confirm: t('config-editor.widget.leave'),
                    cancel: t('config-editor.widget.stay')
                },

                confirmProps: {
                    color: 'red',
                    variant: 'soft'
                },
                cancelProps: {
                    variant: 'light'
                },
                onConfirm: () => {
                    blocker.proceed()
                },
                onCancel: () => {
                    blocker.reset()
                },
                closeOnConfirm: true,
                closeOnCancel: true
            })
        }
    }, [blocker])

    const statusBar = (result || (!isMieruConfig && (isWasmRestarting || isWasmCrashed))) && (
        <EditorStatusBar
            status={
                (!isMieruConfig && (isWasmCrashed || isWasmRestarting)) || !isConfigValid
                    ? 'error'
                    : 'success'
            }
        >
            {!isMieruConfig && isWasmRestarting && (
                <Group gap="xs">
                    <Loader color="orange" size="xs" />
                    <Code className={styles.statusCode} color="orange">
                        Xray Core (WASM) is restarting...
                    </Code>
                </Group>
            )}
            {!isMieruConfig && !isWasmRestarting && isWasmCrashed && (
                <Group gap="sm">
                    <Code className={styles.statusCode} color="red">
                        Xray Core (WASM) crashed. Validation is unavailable.
                    </Code>
                    <Button color="red" onClick={onRestartWasm} size="compact-xs" variant="light">
                        {t('restart-node-button.feature.restart')}
                    </Button>
                </Group>
            )}
            {(isMieruConfig || (!isWasmRestarting && !isWasmCrashed)) && result}
        </EditorStatusBar>
    )

    return (
        <Box className={clsx(styles.container, isFullscreen && fullscreenClasses.overlay)}>
            {isMieruConfig && !isFullscreen && (
                <Alert
                    color="blue"
                    icon={<TbInfoCircle size={18} />}
                    mb="sm"
                    title={t('config-editor.widget.mieru-editor-title')}
                    variant="light"
                >
                    <Text size="sm">{t('config-editor.widget.mieru-editor-description')}</Text>
                </Alert>
            )}
            <Paper
                className={clsx(
                    styles.editorWrapper,
                    !isFullscreen && editorClasses.editorAttached,
                    isFullscreen && fullscreenClasses.fill
                )}
                p={0}
                pos="relative"
                ref={editorWrapperRef}
                style={{
                    direction: 'ltr'
                }}
                withBorder
            >
                {isFullscreen && (
                    <FullscreenToggleButton
                        isFullscreen={isFullscreen}
                        onToggle={toggleFullscreen}
                    />
                )}

                <CodeEditor
                    footer={statusBar}
                    className={styles.monacoEditor}
                    defaultLanguage="json"
                    loading={<LoaderModalShared mih="100%" />}
                    onChange={() => {
                        if (isMieruConfig || (!isWasmCrashed && !isWasmRestarting)) {
                            ConfigValidationFeature.validate(
                                editorRef,
                                setResult,
                                setIsConfigValid,
                                snippetMap,
                                isMieruConfig ? 'MIERU' : 'XRAY'
                            )
                        }

                        checkForChanges()
                    }}
                    onMount={(editor) => {
                        editorRef.current = editor

                        editor.getAction('editor.foldLevel7')?.run()

                        ConfigValidationFeature.validate(
                            editorRef,
                            setResult,
                            setIsConfigValid,
                            snippetMap,
                            isMieruConfig ? 'MIERU' : 'XRAY'
                        )
                    }}
                    options={{
                        stickyScroll: { enabled: false }
                    }}
                    path={isMieruConfig ? 'mieru-config://*' : 'xray-config://*'}
                    value={JSON.stringify(configProfile.config, null, 2)}
                />
            </Paper>

            {!isFullscreen && (
                <EditorFooter ref={footerRef}>
                    <FullscreenToggleButton
                        floating={false}
                        isFullscreen={isFullscreen}
                        onToggle={toggleFullscreen}
                        size={36}
                    />

                    <ConfigEditorActionsFeature
                        configProfile={configProfile}
                        editorRef={editorRef}
                        hasUnsavedChanges={hasUnsavedChanges}
                        isConfigValid={isConfigValid}
                        originalValue={originalValue}
                        setHasUnsavedChanges={setHasUnsavedChanges}
                        setIsConfigValid={setIsConfigValid}
                        setOriginalValue={setOriginalValue}
                        setResult={setResult}
                    />
                </EditorFooter>
            )}
        </Box>
    )
}
