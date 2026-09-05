import type { useCreationForm } from './model/use-creation-form'
import type { ReactNode } from 'react'

import { Button, FieldError, Form, Input, Label, Spinner, TextField } from '@heroui/react'
import { Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'

export type CreationFormModel = ReturnType<typeof useCreationForm>

export function CreationForm({
    model,
    modal,
    nameLabel,
    namePlaceholder,
    description,
    children,
    isDisabled = false
}: {
    model: CreationFormModel
    modal: HeroModalController
    nameLabel: string
    namePlaceholder: string
    description?: ReactNode
    children?: ReactNode
    isDisabled?: boolean
}) {
    const { t } = useTranslation()
    const { form, submit, isPending } = model
    return (
        <Form onSubmit={submit} validationBehavior="aria" className="flex flex-col gap-5">
            {description}
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
                        <Label>{nameLabel}</Label>
                        <Input
                            ref={field.ref}
                            autoFocus
                            placeholder={namePlaceholder}
                            variant="secondary"
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                    </TextField>
                )}
            />
            {children}
            {form.formState.errors.root?.server?.message && (
                <p role="alert" className="text-sm text-danger">
                    {form.formState.errors.root.server.message}
                </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onPress={modal.close}>
                    {t('common.action.cancel')}
                </Button>
                <Button type="submit" isPending={isPending} isDisabled={isDisabled}>
                    {isPending && <Spinner size="sm" color="current" />}
                    {t('common.action.create')}
                </Button>
            </div>
        </Form>
    )
}
