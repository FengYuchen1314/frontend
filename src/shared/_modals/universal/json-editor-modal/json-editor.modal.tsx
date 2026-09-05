import type { editor } from 'monaco-editor'
import type { ComponentType } from 'react'

import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, Modal, Spinner } from '@heroui/react'
import { useMonaco } from '@monaco-editor/react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowUp, TbBook, TbBraces } from 'react-icons/tb'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'
import { HeroModalPresence, useHeroModal } from '@shared/_modals/use-hero-modal'
import { COMPACT_MONACO_OPTIONS } from '@shared/constants/monaco-theme'
import { usePseudoFullscreen } from '@shared/hooks/use-pseudo-fullscreen'
import { CodeEditor, editorClasses, EditorFooter, EditorStatusBar } from '@shared/ui/code-editor'
import type { EditorSetupContext } from '@shared/ui/code-editor/editor-operation-scope'
import {
    createEditorOperationScope,
    runEditorSchemaSetup,
    saveEditorValue
} from '@shared/ui/code-editor/editor-operation-scope'
import { FullscreenToggleButton } from '@shared/ui/fullscreen-toggle-button'
import { forceMonacoRetokenize } from '@shared/utils/monaco/force-retokenize'
import { formatFirstErrorMarker } from '@shared/utils/monaco/markers'

import { parseJsonEditorValue } from './json-editor.model'
import classes from './JsonEditorModal.module.css'

export interface IJsonEditorModalProps {
    docsUrl?: string
    iconColor?: string
    IconComponent?: ComponentType<{ size: number }>
    initialValue: string
    onSave: (value: string) => void | Promise<void>
    path: string
    sample?: string
    setupSchema?: (context: EditorSetupContext) => Promise<void> | void
    title: string
}

export function JsonEditorDialog({
    modal,
    initialValue,
    onSave,
    setupSchema,
    path,
    sample,
    docsUrl,
    title,
    IconComponent = TbBraces,
    iconColor = 'teal'
}: IJsonEditorModalProps & { modal: HeroModalController }) {
    const { t } = useTranslation()
    const fullscreen = usePseudoFullscreen(false, modal.isOpen)
    const monaco = useMonaco()
    const [scope] = useState(createEditorOperationScope)
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const [value, setValue] = useState(initialValue)
    const [error, setError] = useState<string | null>(null)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [ready, setReady] = useState(false)
    const [saving, setSaving] = useState(false)
    const [schemaStatus, setSchemaStatus] = useState<'pending' | 'ready' | 'error'>(
        setupSchema ? 'pending' : 'ready'
    )
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        if (modal.isOpen) scope.activate(modal.capture().isCurrent)
        else scope.cancel()
        return scope.cancel
    }, [scope, modal.isOpen, modal.presentationKey])
    useEffect(() => {
        if (!monaco || !setupSchema || !modal.isOpen) return
        const operation = scope.begin()
        void runEditorSchemaSetup(setupSchema, operation).then((result) => {
            if (result !== 'stale' && operation.isCurrent()) setSchemaStatus(result)
            operation.finish()
        })
        return operation.cancel
    }, [monaco, setupSchema, scope, modal.isOpen, retry])
    useEffect(
        () => () => {
            editorRef.current = null
        },
        []
    )

    const close = () => {
        scope.cancel()
        fullscreen.close()
        modal.close()
    }
    const save = async () => {
        if (!ready || saving || schemaStatus !== 'ready' || error || !scope.isCurrent()) return
        const parsed = parseJsonEditorValue(editorRef.current?.getValue() ?? value)
        if (!parsed.valid) {
            setError(t('common.message.invalid-json'))
            return
        }
        const operation = scope.begin()
        setSaving(true)
        setSaveError(null)
        const result = await saveEditorValue(parsed.value, onSave, operation)
        if (result === 'saved' && operation.isCurrent()) close()
        if (result === 'error' && operation.isCurrent())
            setSaveError('Could not save JSON. Your changes are still here; try again.')
        if (operation.isCurrent()) setSaving(false)
        operation.finish()
    }
    return (
        <Modal
            isOpen={modal.isOpen}
            onOpenChange={(open) => {
                if (!open) close()
            }}
        >
            <Modal.Backdrop isKeyboardDismissDisabled={fullscreen.isFullscreen}>
                <HeroModalPresence onExitComplete={modal.afterClose} />
                <Modal.Container scroll="inside" size={fullscreen.isFullscreen ? 'full' : 'lg'}>
                    <Modal.Dialog
                        className={clsx(
                            classes.dialog,
                            fullscreen.isFullscreen && classes.dialogFull
                        )}
                    >
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="flex items-center gap-2">
                                <span className="text-accent" data-icon-tone={iconColor}>
                                    <IconComponent size={22} />
                                </span>
                                {title}
                            </Modal.Heading>
                        </Modal.Header>
                        <Modal.Body className={classes.container}>
                            <div
                                className={clsx(
                                    classes.editorWrapper,
                                    editorClasses.editorAttached,
                                    error && classes.editorWrapperError,
                                    fullscreen.isFullscreen && classes.editorFill
                                )}
                            >
                                <CodeEditor
                                    defaultLanguage="json"
                                    footer={
                                        (error || saveError) && (
                                            <EditorStatusBar status="error">
                                                {error || saveError}
                                            </EditorStatusBar>
                                        )
                                    }
                                    onChange={(next) => {
                                        if (scope.isCurrent()) {
                                            setValue(next ?? '')
                                            setError(null)
                                            setSaveError(null)
                                        }
                                    }}
                                    onMount={(instance) => {
                                        if (scope.isCurrent()) {
                                            editorRef.current = instance
                                            setReady(true)
                                            forceMonacoRetokenize(instance)
                                        }
                                    }}
                                    onValidate={(markers) => {
                                        if (scope.isCurrent())
                                            setError(formatFirstErrorMarker(markers))
                                    }}
                                    options={{
                                        ...COMPACT_MONACO_OPTIONS,
                                        ariaLabel: title,
                                        readOnly: saving
                                    }}
                                    path={path}
                                    value={value}
                                />
                            </div>
                            {schemaStatus === 'pending' && (
                                <div
                                    className="flex items-center gap-2 p-2 text-sm text-muted"
                                    role="status"
                                >
                                    <Spinner size="sm" />
                                    Loading JSON schema…
                                </div>
                            )}
                            {schemaStatus === 'error' && (
                                <EditorStatusBar status="error">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span>Could not load JSON schema.</span>
                                        <Button
                                            onPress={() => {
                                                setSchemaStatus('pending')
                                                setRetry((current) => current + 1)
                                            }}
                                            size="sm"
                                            variant="secondary"
                                        >
                                            {t('common.action.try-again')}
                                        </Button>
                                    </div>
                                </EditorStatusBar>
                            )}
                            <EditorFooter className={clsx(error && classes.footerError)}>
                                <FullscreenToggleButton
                                    floating={false}
                                    isFullscreen={fullscreen.isFullscreen}
                                    onToggle={fullscreen.toggle}
                                />
                                {docsUrl && (
                                    <a
                                        aria-label={t('common.action.documentation')}
                                        className={classes.docsLink}
                                        href={docsUrl}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >
                                        <TbBook size={18} />
                                    </a>
                                )}
                                {sample && (
                                    <Button
                                        isDisabled={!ready || saving}
                                        onPress={() => {
                                            setValue(sample)
                                            setError(null)
                                        }}
                                        variant="secondary"
                                    >
                                        <TbArrowUp size={18} />
                                        {t('common.action.paste-default')}
                                    </Button>
                                )}
                                <div className="ms-auto flex gap-2">
                                    <Button onPress={close} variant="ghost">
                                        {t('common.action.cancel')}
                                    </Button>
                                    <Button
                                        isDisabled={!ready || schemaStatus !== 'ready' || !!error}
                                        isPending={saving}
                                        onPress={() => {
                                            void save()
                                        }}
                                    >
                                        {t('common.action.save')}
                                    </Button>
                                </div>
                            </EditorFooter>
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
}

export const JsonEditorModal = NiceModal.create((props: IJsonEditorModalProps) => {
    const niceModal = useModal()
    const modal = useHeroModal({ modal: niceModal, scopeKey: props.path })
    return <JsonEditorDialog {...props} key={modal.presentationKey} modal={modal} />
})
