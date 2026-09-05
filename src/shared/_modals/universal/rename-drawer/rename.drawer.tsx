import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Button, FieldError, Form, Input, Label, Modal, Spinner, TextField } from '@heroui/react'
import { Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { TbDeviceFloppy, TbPencil } from 'react-icons/tb'

import {
    HeroModalPresence,
    useHeroModal,
    type HeroModalController
} from '@shared/_modals/use-hero-modal'

import {
    renameDefinitions,
    type RenameDefinition,
    type RenameKind
} from './model/rename-definitions'
import { useRenameForm } from './model/use-rename-form'

interface IProps {
    name: string
    renameFrom: RenameKind
    uuid: string
}

export function RenameDialogForm({
    definition,
    name,
    uuid,
    modal
}: {
    definition: RenameDefinition
    name: string
    uuid: string
    modal: HeroModalController
}) {
    const { t } = useTranslation()
    const { form, isPending, submit } = useRenameForm(definition, uuid, modal)
    return (
        <Form onSubmit={submit} validationBehavior="aria" className="flex flex-col gap-5">
            <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                    <TextField
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        isRequired
                        isInvalid={fieldState.invalid}
                        isDisabled={isPending}
                    >
                        <Label>{t('common.field.name')}</Label>
                        <Input ref={field.ref} autoFocus placeholder={name} variant="secondary" />
                        <FieldError>{fieldState.error?.message}</FieldError>
                    </TextField>
                )}
            />
            {form.formState.errors.root?.server?.message && (
                <p role="alert" className="text-sm text-danger">
                    {form.formState.errors.root.server.message}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
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

export const RenameModalShared = NiceModal.create(({ name, renameFrom, uuid }: IProps) => {
    const niceModal = useModal()
    const modal = useHeroModal({ modal: niceModal, scopeKey: renameFrom + ':' + uuid })
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
                                <TbPencil aria-hidden="true" />
                                {t('common.action.rename')}
                            </Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <RenameDialogForm
                                key={renameFrom + ':' + uuid}
                                definition={renameDefinitions[renameFrom]}
                                name={name}
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
