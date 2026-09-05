import NiceModal, { useModal } from '@ebay/nice-modal-react'
import {
    Button,
    FieldError,
    Form,
    Input,
    Label,
    Modal,
    Spinner,
    Tag,
    TagGroup,
    TextField
} from '@heroui/react'
import { useId } from 'react'
import { Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { TbDeviceFloppy, TbTags } from 'react-icons/tb'

import {
    HeroModalPresence,
    useHeroModal,
    type HeroModalController
} from '@shared/_modals/use-hero-modal'

import { tagsDefinitions, type TagsDefinition, type TagsKind } from './model/tags-definitions'
import { useTagsForm } from './model/use-tags-form'

interface IProps {
    editTagsFrom: TagsKind
    tags: string[]
    uuid: string
}

export function TagsDialogForm({
    definition,
    tags,
    uuid,
    modal
}: {
    definition: TagsDefinition
    tags: string[]
    uuid: string
    modal: HeroModalController
}) {
    const { t } = useTranslation()
    const suggestionsId = useId()
    const { form, known, isPending, commitDraft, submit } = useTagsForm(
        definition,
        uuid,
        tags,
        modal
    )
    return (
        <Form onSubmit={submit} validationBehavior="aria" className="flex flex-col gap-4">
            <Controller
                control={form.control}
                name="tags"
                render={({ field, fieldState }) => (
                    <div className="flex flex-col gap-2">
                        <TagGroup
                            aria-label={t('common.field.tags')}
                            onRemove={(keys) =>
                                field.onChange(field.value.filter((tag) => !keys.has(tag)))
                            }
                        >
                            <TagGroup.List className="flex flex-wrap gap-2">
                                {field.value.map((tag) => (
                                    <Tag key={tag} id={tag} textValue={tag} isDisabled={isPending}>
                                        {tag}
                                        <Tag.RemoveButton
                                            aria-label={t('common.action.remove') + ' ' + tag}
                                        />
                                    </Tag>
                                ))}
                            </TagGroup.List>
                        </TagGroup>
                        {fieldState.error?.message && (
                            <p role="alert" className="text-sm text-danger">
                                {fieldState.error.message}
                            </p>
                        )}
                    </div>
                )}
            />
            <Controller
                control={form.control}
                name="draft"
                render={({ field, fieldState }) => (
                    <TextField
                        name={field.name}
                        value={field.value}
                        onChange={(value) => {
                            field.onChange(value)
                            if (/[,;\s]$/.test(value)) commitDraft()
                        }}
                        onBlur={() => {
                            field.onBlur()
                            commitDraft()
                        }}
                        isDisabled={isPending}
                        isInvalid={fieldState.invalid}
                    >
                        <Label>{t('common.field.tags')}</Label>
                        <Input
                            ref={field.ref}
                            autoFocus
                            list={suggestionsId}
                            placeholder="ENV:PROD"
                            variant="secondary"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && field.value.trim()) {
                                    event.preventDefault()
                                    commitDraft()
                                }
                            }}
                            onPaste={(event) => {
                                const pasted = event.clipboardData.getData('text')
                                if (/[,;\s]/.test(pasted)) {
                                    event.preventDefault()
                                    field.onChange(field.value + pasted)
                                    commitDraft()
                                }
                            }}
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                    </TextField>
                )}
            />
            <datalist id={suggestionsId}>
                {(known.data?.tags ?? []).map((tag) => (
                    <option key={tag} value={tag} />
                ))}
            </datalist>
            {known.isLoading && (
                <span role="status" className="flex items-center gap-2 text-sm text-muted">
                    <Spinner size="sm" />
                    Loading tag suggestions…
                </span>
            )}
            {known.isError && (
                <div role="status" className="flex items-center gap-2 text-sm text-warning">
                    Tag suggestions unavailable
                    <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        onPress={() => {
                            void known.refetch()
                        }}
                    >
                        Retry
                    </Button>
                </div>
            )}
            <p className="text-sm text-muted">
                Up to 10 tags. Separate with a comma, space or semicolon.
            </p>
            {form.formState.errors.root?.server?.message && (
                <p role="alert" className="text-sm text-danger">
                    {form.formState.errors.root.server.message}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="tertiary"
                    isDisabled={isPending}
                    onPress={() => {
                        form.setValue('tags', [], { shouldDirty: true, shouldValidate: true })
                        form.setValue('draft', '')
                    }}
                >
                    Clear all
                </Button>
                <Button type="button" variant="secondary" onPress={modal.close}>
                    {t('common.action.cancel')}
                </Button>
                <Button type="submit" isPending={isPending}>
                    {isPending ? (
                        <Spinner size="sm" color="current" />
                    ) : (
                        <TbDeviceFloppy aria-hidden="true" />
                    )}
                    {t('common.action.save')}
                </Button>
            </div>
        </Form>
    )
}

export const EditTagsModalShared = NiceModal.create(({ editTagsFrom, tags, uuid }: IProps) => {
    const niceModal = useModal()
    const modal = useHeroModal({ modal: niceModal, scopeKey: editTagsFrom + ':' + uuid })
    const { t } = useTranslation()
    return (
        <Modal isOpen={modal.isOpen} onOpenChange={modal.onOpenChange}>
            <Modal.Backdrop>
                <HeroModalPresence onExitComplete={modal.afterClose} />
                <Modal.Container size="sm">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="flex items-center gap-2">
                                <TbTags aria-hidden="true" />
                                {t('common.field.tags')}
                            </Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <TagsDialogForm
                                key={editTagsFrom + ':' + uuid}
                                definition={tagsDefinitions[editTagsFrom]}
                                tags={tags}
                                uuid={uuid}
                                modal={modal}
                            />
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
})
