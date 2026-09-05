import type { TSubscriptionTemplateType } from '@remnawave/backend-contract'

import { toast } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { isCancel } from 'axios'
import { type FormEvent, useLayoutEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'
import { assertSessionGeneration, getSessionGeneration } from '@shared/api/axios'
import { queryClient } from '@shared/api/query-client'

import {
    creationDefaults,
    creationDestination,
    creationSchema,
    type CreateKind,
    type CreationDestination
} from './create-draft'
import { creationDefinitions, type CreationDefinition } from './create-mutations'

export interface CreationContentProps {
    modal: HeroModalController
    onCreated: (destination: CreationDestination) => void
    templateType?: TSubscriptionTemplateType
}

export function useCreationForm(
    kind: CreateKind,
    { modal, onCreated, templateType }: CreationContentProps,
    definition: CreationDefinition = creationDefinitions[kind]
) {
    const { t } = useTranslation()
    const schema = useMemo(() => creationSchema(kind), [kind])
    const form = useForm({
        resolver: zodResolver(schema),
        defaultValues: creationDefaults(),
        mode: 'onChange'
    })
    const { create, isPending } = definition.useCreate()
    const lifetime = useRef(0)
    const submitting = useRef(false)
    useLayoutEffect(
        () => () => {
            lifetime.current++
        },
        []
    )
    const submit = (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault()
        if (submitting.current) return Promise.resolve()
        const lease = modal.capture()
        const owner = lifetime.current
        const session = getSessionGeneration()
        const current = () =>
            owner === lifetime.current && getSessionGeneration() === session && lease.isCurrent()
        if (!current()) return Promise.resolve()
        submitting.current = true
        return form
            .handleSubmit(async (values) => {
                if (!current()) return
                form.clearErrors('root')
                try {
                    const result = await create(values, templateType)
                    assertSessionGeneration(session)
                    // The entity exists even if its initiating dialog has been dismissed.
                    void queryClient.invalidateQueries({ queryKey: definition.queryKey })
                    if (!current()) return
                    const destination = creationDestination(kind, result)
                    toast.success(t('shared-dialogs.created'))
                    modal.resolveAndClose()
                    onCreated(destination)
                } catch (error) {
                    if (isCancel(error) || !current()) return
                    const message = error instanceof Error ? error.message : 'Creation failed'
                    form.setError('root.server', { type: 'server', message })
                    toast.danger(t('shared-dialogs.create-failed'), { description: message })
                }
            })(event)
            .finally(() => {
                submitting.current = false
            })
    }
    return { form, submit, isPending: isPending || form.formState.isSubmitting }
}
