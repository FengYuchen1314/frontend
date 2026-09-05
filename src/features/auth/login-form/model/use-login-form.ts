import { zodResolver } from '@hookform/resolvers/zod'
import { LoginCommand } from '@remnawave/backend-contract'
import { type FormEvent, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'

import { getSessionGeneration } from '@shared/api/axios'
import { useLogin } from '@shared/api/hooks/auth/auth.hooks'

import { applyAuthFormErrors } from './auth-form-errors'

export const loginFormSchema = LoginCommand.RequestBodySchema.extend({
    username: LoginCommand.RequestBodySchema.shape.username.min(1),
    password: LoginCommand.RequestBodySchema.shape.password.min(1)
})

export function useLoginForm() {
    const form = useForm({
        resolver: zodResolver(loginFormSchema),
        defaultValues: { username: '', password: '' }
    })
    const submitAttempt = useRef(0)
    useEffect(
        () => () => {
            submitAttempt.current++
        },
        []
    )
    const { mutate: login, isPending } = useLogin({
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
        return form.handleSubmit((variables) => {
            if (!current()) return
            form.clearErrors('root')
            login(
                { variables },
                {
                    onError: (error) => {
                        if (current())
                            applyAuthFormErrors(error, form.setError, ['username', 'password'])
                    }
                }
            )
        })(event)
    }
    return { form, isPending, submit }
}
