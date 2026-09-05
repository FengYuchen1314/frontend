import { toast } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { type FormEvent, useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { getSessionGeneration } from '@shared/api/axios'
import { useRegister } from '@shared/api/hooks/auth/auth.hooks'

import { applyAuthFormErrors } from '../../login-form/model/auth-form-errors'
import { createRegistrationSchema, generateRegistrationPassword } from './registration'

export function useRegistrationForm() {
    const { t } = useTranslation()
    const schema = useMemo(
        () => createRegistrationSchema(t('register-form.feature.passwords-do-not-match')),
        [t]
    )
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: { username: '', password: '', confirmPassword: '' }
    })
    const copyAttempt = useRef(0)
    const submitAttempt = useRef(0)
    useEffect(
        () => () => {
            copyAttempt.current++
            submitAttempt.current++
        },
        []
    )
    const { mutate: register, isPending } = useRegister({
        captureOwnership: () => {
            const attempt = submitAttempt.current
            const generation = getSessionGeneration()
            return {
                isCurrent: () =>
                    attempt === submitAttempt.current && generation === getSessionGeneration()
            }
        }
    })
    const submit = (event?: FormEvent<HTMLFormElement>) => {
        const attempt = ++submitAttempt.current
        const generation = getSessionGeneration()
        const current = () =>
            attempt === submitAttempt.current && generation === getSessionGeneration()
        return form.handleSubmit(({ username, password }) => {
            if (!current()) return
            form.clearErrors('root')
            register(
                { variables: { username, password } },
                {
                    onError: (error) => {
                        if (current())
                            applyAuthFormErrors(error, form.setError, [
                                'username',
                                'password',
                                'confirmPassword'
                            ])
                    }
                }
            )
        })(event)
    }
    const generatePassword = async () => {
        const attempt = ++copyAttempt.current
        const generation = getSessionGeneration()
        const password = generateRegistrationPassword()
        form.setValue('password', password, { shouldDirty: true, shouldValidate: true })
        form.setValue('confirmPassword', password, { shouldDirty: true, shouldValidate: true })
        const current = () =>
            copyAttempt.current === attempt && generation === getSessionGeneration()
        try {
            await navigator.clipboard.writeText(password)
            if (current())
                toast.success(t('register-form.feature.password-copied'), {
                    description: t('register-form.feature.password-copied-message')
                })
        } catch {
            if (current())
                toast.danger(t('common.message.error'), {
                    description: t('register-form.feature.password-copied-error')
                })
        }
    }
    return { form, isPending, submit, generatePassword }
}
