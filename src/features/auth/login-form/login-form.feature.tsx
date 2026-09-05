import { Button, FieldError, Form, Input, Label, Spinner, TextField } from '@heroui/react'
import { Controller } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { PiSignInDuotone } from 'react-icons/pi'

import { useLoginForm } from './model/use-login-form'
import { AuthPasswordField } from './ui/auth-password-field'

export const LoginFormFeature = () => {
    const { t } = useTranslation()
    const { form, isPending, submit } = useLoginForm()
    return (
        <Form
            onSubmit={submit}
            validationBehavior="aria"
            aria-label={t('login-form.feature.sign-in')}
            className="flex w-full flex-col gap-5"
        >
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
                        <Input ref={field.ref} autoComplete="username" variant="secondary" />
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
                        autoComplete="current-password"
                        error={fieldState.error?.message}
                        isDisabled={isPending}
                    />
                )}
            />
            {form.formState.errors.root?.server?.message && (
                <p role="alert" className="text-sm text-danger">
                    {form.formState.errors.root.server.message}
                </p>
            )}
            <Button type="submit" variant="primary" isPending={isPending} className="mt-1 w-full">
                {isPending ? (
                    <Spinner size="sm" color="current" />
                ) : (
                    <PiSignInDuotone aria-hidden="true" size={18} />
                )}
                {t('login-form.feature.sign-in')}
            </Button>
        </Form>
    )
}
