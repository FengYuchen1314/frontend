import { Button, FieldError, Form, Input, Label, Spinner, TextField } from '@heroui/react'
import { Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { PiShuffleDuotone, PiSignpostDuotone } from 'react-icons/pi'

import { AuthPasswordField } from '../login-form/ui/auth-password-field'
import { useRegistrationForm } from './model/use-registration-form'

export const RegisterFormFeature = () => {
    const { t } = useTranslation()
    const { form, isPending, submit, generatePassword } = useRegistrationForm()
    return (
        <Form
            onSubmit={submit}
            validationBehavior="aria"
            aria-label={t('register-form.feature.registration')}
            className="flex w-full flex-col gap-5"
        >
            <div className="text-center">
                <h2 className="text-xl font-semibold">{t('register-form.feature.registration')}</h2>
                <p className="mt-2 text-sm text-muted">
                    {t('register-form.feature.register-description')}
                </p>
            </div>
            <Controller
                control={form.control}
                name="username"
                render={({ field, fieldState }) => (
                    <TextField
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        isRequired
                        isInvalid={fieldState.invalid}
                        isDisabled={isPending}
                        className="w-full"
                    >
                        <Label>{t('common.field.username')}</Label>
                        <Input
                            ref={field.ref}
                            autoComplete="username"
                            placeholder="IamSuperAdmin"
                            variant="secondary"
                        />
                        <FieldError>{fieldState.error?.message}</FieldError>
                    </TextField>
                )}
            />
            <Controller
                control={form.control}
                name="password"
                render={({ field, fieldState }) => (
                    <AuthPasswordField
                        name={field.name}
                        label={t('common.field.password')}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        inputRef={field.ref}
                        autoComplete="new-password"
                        error={fieldState.error?.message}
                        isDisabled={isPending}
                    />
                )}
            />
            <Controller
                control={form.control}
                name="confirmPassword"
                render={({ field, fieldState }) => (
                    <AuthPasswordField
                        name={field.name}
                        label={t('register-form.feature.confirm-password')}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        inputRef={field.ref}
                        autoComplete="new-password"
                        error={fieldState.error?.message}
                        isDisabled={isPending}
                    />
                )}
            />
            <Button
                type="button"
                variant="secondary"
                isDisabled={isPending}
                onPress={() => {
                    void generatePassword()
                }}
                className="w-full"
            >
                <PiShuffleDuotone aria-hidden="true" size={18} />
                {t('register-form.feature.generate')}
            </Button>
            {form.formState.errors.root?.server?.message && (
                <p role="alert" className="text-sm text-danger">
                    {form.formState.errors.root.server.message}
                </p>
            )}
            <Button type="submit" variant="primary" isPending={isPending} className="w-full">
                {isPending ? (
                    <Spinner size="sm" color="current" />
                ) : (
                    <PiSignpostDuotone aria-hidden="true" size={18} />
                )}
                {t('register-form.feature.sign-up')}
            </Button>
        </Form>
    )
}
