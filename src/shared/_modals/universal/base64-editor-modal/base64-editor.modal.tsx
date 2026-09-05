import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, ButtonGroup, Modal } from '@heroui/react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbBinary } from 'react-icons/tb'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'
import { HeroModalPresence, useHeroModal } from '@shared/_modals/use-hero-modal'
import { COMPACT_MONACO_OPTIONS } from '@shared/constants/monaco-theme'
import { usePseudoFullscreen } from '@shared/hooks/use-pseudo-fullscreen'
import { CodeEditor, editorClasses, EditorFooter, EditorStatusBar } from '@shared/ui/code-editor'
import {
    createEditorOperationScope,
    saveEditorValue
} from '@shared/ui/code-editor/editor-operation-scope'
import { FullscreenToggleButton } from '@shared/ui/fullscreen-toggle-button'
import { forceMonacoRetokenize } from '@shared/utils/monaco/force-retokenize'

import {
    BASE64_LANGUAGES,
    createBase64Draft,
    INVALID_BASE64_MESSAGE,
    updateBase64Decoded,
    updateBase64Encoded,
    validateBase64Draft
} from './base64-editor.model'
import classes from './Base64EditorModal.module.css'

export interface Base64EditorModalProps {
    label?: string
    onSave: (encoded: string) => void | Promise<void>
    value: string
}

export function Base64EditorDialog({
    modal,
    label,
    onSave,
    value
}: Base64EditorModalProps & { modal: HeroModalController }) {
    const { t } = useTranslation()
    const fullscreen = usePseudoFullscreen(false, modal.isOpen)
    const [scope] = useState(createEditorOperationScope)
    const [draft, setDraft] = useState(() => createBase64Draft(value))
    const [saving, setSaving] = useState(false)
    useEffect(() => {
        if (modal.isOpen) scope.activate(modal.capture().isCurrent)
        else scope.cancel()
        return scope.cancel
    }, [scope, modal.isOpen, modal.presentationKey])
    const close = () => {
        scope.cancel()
        fullscreen.close()
        modal.close()
    }
    const save = async () => {
        if (saving || !scope.isCurrent()) return
        if (!validateBase64Draft(draft)) {
            setDraft((current) => ({ ...current, error: INVALID_BASE64_MESSAGE }))
            return
        }
        const operation = scope.begin()
        setSaving(true)
        const result = await saveEditorValue(draft.encoded, onSave, operation)
        if (result === 'saved' && operation.isCurrent()) close()
        if (result === 'error' && operation.isCurrent())
            setDraft((current) => ({
                ...current,
                error: 'Could not save Base64. Your changes are still here; try again.'
            }))
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
                <Modal.Container scroll="inside" size={fullscreen.isFullscreen ? 'full' : 'cover'}>
                    <Modal.Dialog
                        className={clsx(
                            classes.dialog,
                            fullscreen.isFullscreen && classes.dialogFull
                        )}
                    >
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="flex items-center gap-2">
                                <TbBinary aria-hidden="true" />
                                Base64 editor
                            </Modal.Heading>
                            {label && <p className="text-sm text-muted">{label}</p>}
                        </Modal.Header>
                        <Modal.Body className={classes.container}>
                            <div
                                className={clsx(
                                    classes.panes,
                                    fullscreen.isFullscreen && classes.panesFill
                                )}
                            >
                                <section aria-label="Decoded content" className={classes.pane}>
                                    <h3 className="pb-1 text-sm text-muted">Decoded content</h3>
                                    <div
                                        className={clsx(
                                            classes.editorWrapper,
                                            editorClasses.editorAttached,
                                            fullscreen.isFullscreen && classes.editorFill
                                        )}
                                    >
                                        <CodeEditor
                                            language={draft.language}
                                            onChange={(next) => {
                                                if (scope.isCurrent())
                                                    setDraft((current) =>
                                                        updateBase64Decoded(current, next)
                                                    )
                                            }}
                                            onMount={(instance) => {
                                                if (scope.isCurrent())
                                                    forceMonacoRetokenize(instance)
                                            }}
                                            options={{
                                                ...COMPACT_MONACO_OPTIONS,
                                                ariaLabel: 'Decoded content',
                                                readOnly: saving,
                                                wordWrap: 'on'
                                            }}
                                            value={draft.decoded}
                                            withJsonPath={false}
                                        />
                                    </div>
                                </section>
                                <section aria-label="Base64 content" className={classes.pane}>
                                    <h3 className="pb-1 text-sm text-muted">Base64 content</h3>
                                    <div
                                        className={clsx(
                                            classes.editorWrapper,
                                            editorClasses.editorAttached,
                                            draft.error && classes.editorWrapperError,
                                            fullscreen.isFullscreen && classes.editorFill
                                        )}
                                    >
                                        <CodeEditor
                                            language="plaintext"
                                            onChange={(next) => {
                                                if (scope.isCurrent())
                                                    setDraft((current) =>
                                                        updateBase64Encoded(current, next)
                                                    )
                                            }}
                                            onMount={(instance) => {
                                                if (scope.isCurrent())
                                                    forceMonacoRetokenize(instance)
                                            }}
                                            options={{
                                                ...COMPACT_MONACO_OPTIONS,
                                                ariaLabel: 'Base64 content',
                                                readOnly: saving,
                                                wordWrap: 'on'
                                            }}
                                            value={draft.encoded}
                                            withJsonPath={false}
                                        />
                                    </div>
                                </section>
                            </div>
                            {draft.error && (
                                <EditorStatusBar status="error">{draft.error}</EditorStatusBar>
                            )}
                            <EditorFooter className={clsx(draft.error && classes.footerError)}>
                                <FullscreenToggleButton
                                    floating={false}
                                    isFullscreen={fullscreen.isFullscreen}
                                    onToggle={fullscreen.toggle}
                                />
                                <ButtonGroup
                                    aria-label="Decoded language"
                                    size="sm"
                                    variant="secondary"
                                >
                                    {BASE64_LANGUAGES.map((language) => (
                                        <Button
                                            aria-pressed={draft.language === language}
                                            isDisabled={saving}
                                            key={language}
                                            onPress={() =>
                                                setDraft((current) => ({ ...current, language }))
                                            }
                                            variant={
                                                draft.language === language
                                                    ? 'primary'
                                                    : 'secondary'
                                            }
                                        >
                                            {language === 'plaintext'
                                                ? 'Text'
                                                : language.toUpperCase()}
                                        </Button>
                                    ))}
                                </ButtonGroup>
                                <div className="ms-auto flex gap-2">
                                    <Button onPress={close} variant="ghost">
                                        {t('common.action.cancel')}
                                    </Button>
                                    <Button
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

export const Base64EditorModal = NiceModal.create((props: Base64EditorModalProps) => {
    const niceModal = useModal()
    const modal = useHeroModal({ modal: niceModal })
    return <Base64EditorDialog {...props} key={modal.presentationKey} modal={modal} />
})
