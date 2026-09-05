import { zodResolver } from '@hookform/resolvers/zod'
import { LoginCommand } from '@remnawave/backend-contract'
import { useForm } from 'react-hook-form'

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
    const { mutate: login, isPending } = useLogin()
    const submit = form.handleSubmit((variables) => {
        form.clearErrors('root')
        login(
            { variables },
            {
                onError: (error) =>
                    applyAuthFormErrors(error, form.setError, ['username', 'password'])
            }
        )
    })
    return { form, isPending, submit }
}
