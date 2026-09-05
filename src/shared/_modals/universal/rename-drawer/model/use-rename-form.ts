import type { RenameDefinition } from './rename-definitions'
import type { FormEvent } from 'react'

import { toast } from '@heroui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { isCancel } from 'axios'
import { useForm } from 'react-hook-form'

import type { HeroModalController } from '@shared/_modals/use-hero-modal'
import { assertSessionGeneration, getSessionGeneration } from '@shared/api/axios'
import { queryClient } from '@shared/api/query-client'

export function useRenameForm(
    definition: RenameDefinition,
    uuid: string,
    modal: HeroModalController
) {
    const form = useForm({ resolver: zodResolver(definition.schema), defaultValues: { name: '' } })
    const { save, isPending } = definition.useSave()
    const submit = (event?: FormEvent<HTMLFormElement>) => {
        const lease = modal.capture()
        const session = getSessionGeneration()
        return form.handleSubmit(async ({ name }) => {
            if (!lease.isCurrent()) return
            form.clearErrors('root')
            try {
                await save(uuid, name)
                assertSessionGeneration(session)
                // Server state changed even when the initiating dialog has closed.
                void queryClient.invalidateQueries({ queryKey: definition.queryKey })
                if (!lease.isCurrent()) return
                toast.success('Renamed successfully')
                modal.resolveAndClose()
            } catch (error) {
                if (isCancel(error) || !lease.isCurrent()) return
                const message = error instanceof Error ? error.message : 'Request failed'
                form.setError('root.server', { type: 'server', message })
                toast.danger('Rename failed', { description: message })
            }
        })(event)
    }
    return { form, isPending, submit }
}
