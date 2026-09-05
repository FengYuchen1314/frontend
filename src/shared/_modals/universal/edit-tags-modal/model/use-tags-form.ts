import type { TagsDefinition } from './tags-definitions'

import { toast } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { isCancel } from 'axios'
import { type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'
import { assertSessionGeneration, getSessionGeneration } from '@shared/api/axios'
import { queryClient } from '@shared/api/query-client'

import { mergeTagDraft, normalizeTags, tagsFormSchema } from './tags-draft'

export function useTagsForm(
    definition: TagsDefinition,
    uuid: string,
    initialTags: string[],
    modal: HeroModalController
) {
    const { t } = useTranslation()
    const form = useForm({
        resolver: zodResolver(tagsFormSchema),
        defaultValues: { tags: normalizeTags(initialTags), draft: '' }
    })
    const known = definition.useKnownTags()
    const { save, isPending } = definition.useSave()
    const commitDraft = () => {
        const tags = mergeTagDraft(form.getValues('tags'), form.getValues('draft'))
        const result = tagsFormSchema.shape.tags.safeParse(tags)
        if (!result.success) {
            form.setError('tags', { type: 'validate', message: result.error.issues[0]?.message })
            return false
        }
        form.setValue('tags', result.data, { shouldDirty: true, shouldValidate: true })
        form.setValue('draft', '', { shouldDirty: true })
        return true
    }
    const submit = (event?: FormEvent<HTMLFormElement>) => {
        event?.preventDefault()
        const lease = modal.capture()
        const session = getSessionGeneration()
        if (!lease.isCurrent() || !commitDraft()) return
        return form.handleSubmit(async ({ tags }) => {
            if (!lease.isCurrent()) return
            form.clearErrors('root')
            try {
                await save(uuid, tags)
                assertSessionGeneration(session)
                void queryClient.invalidateQueries({ queryKey: definition.queryKey })
                void queryClient.invalidateQueries({ queryKey: definition.tagsQueryKey })
                if (!lease.isCurrent()) return
                toast.success(t('shared-dialogs.tags-updated'))
                modal.resolveAndClose()
            } catch (error) {
                if (isCancel(error) || !lease.isCurrent()) return
                const message = error instanceof Error ? error.message : 'Request failed'
                form.setError('root.server', { type: 'server', message })
                toast.danger(t('shared-dialogs.tags-failed'), { description: message })
            }
        })(event)
    }
    return { form, known, isPending, commitDraft, submit }
}
