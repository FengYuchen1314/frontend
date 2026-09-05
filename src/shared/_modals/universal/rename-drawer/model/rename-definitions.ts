import {
    UpdateConfigProfileCommand,
    UpdateExternalSquadCommand,
    UpdateInternalSquadCommand,
    UpdateNodePluginCommand,
    UpdatePasskeyCommand,
    UpdateSubpageConfigCommand,
    UpdateSubscriptionTemplateCommand
} from '@remnawave/backend-contract'
import { z } from 'zod'

import { QueryKeys } from '@shared/api/hooks/keys-factory'
import { createMutationHook } from '@shared/api/tsq-helpers/create-mutation-hook'

export type RenameKind =
    | 'configProfile'
    | 'externalSquad'
    | 'internalSquad'
    | 'nodePlugin'
    | 'passkey'
    | 'subpageConfig'
    | 'template'
export interface RenameDefinition {
    schema: z.ZodType<{ name: string }, { name: string }>
    queryKey: readonly unknown[]
    useSave: () => { isPending: boolean; save: (uuid: string, name: string) => Promise<unknown> }
}
function renameSchema(schema: {
    safeParse: (value: unknown) => { success: boolean; error?: { issues: { message: string }[] } }
}) {
    return z.object({
        name: z
            .string()
            .min(1)
            .superRefine((name, context) => {
                const result = schema.safeParse({ name })
                if (!result.success)
                    context.addIssue({
                        code: 'custom',
                        message: result.error?.issues[0]?.message ?? 'Invalid name'
                    })
            })
    })
}
const useconfigProfileMutation = createMutationHook({
    endpoint: UpdateConfigProfileCommand.TSQ_url,
    requestMethod: UpdateConfigProfileCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdateConfigProfileCommand.RequestBodySchema,
    responseSchema: UpdateConfigProfileCommand.ResponseSchema
})
const useexternalSquadMutation = createMutationHook({
    endpoint: UpdateExternalSquadCommand.TSQ_url,
    requestMethod: UpdateExternalSquadCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdateExternalSquadCommand.RequestBodySchema,
    responseSchema: UpdateExternalSquadCommand.ResponseSchema
})
const useinternalSquadMutation = createMutationHook({
    endpoint: UpdateInternalSquadCommand.TSQ_url,
    requestMethod: UpdateInternalSquadCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdateInternalSquadCommand.RequestBodySchema,
    responseSchema: UpdateInternalSquadCommand.ResponseSchema
})
const usenodePluginMutation = createMutationHook({
    endpoint: UpdateNodePluginCommand.TSQ_url,
    requestMethod: UpdateNodePluginCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdateNodePluginCommand.RequestBodySchema,
    responseSchema: UpdateNodePluginCommand.ResponseSchema
})
const usepasskeyMutation = createMutationHook({
    endpoint: UpdatePasskeyCommand.TSQ_url,
    requestMethod: UpdatePasskeyCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdatePasskeyCommand.RequestBodySchema,
    responseSchema: UpdatePasskeyCommand.ResponseSchema
})
const usesubpageConfigMutation = createMutationHook({
    endpoint: UpdateSubpageConfigCommand.TSQ_url,
    requestMethod: UpdateSubpageConfigCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdateSubpageConfigCommand.RequestBodySchema,
    responseSchema: UpdateSubpageConfigCommand.ResponseSchema
})
const usetemplateMutation = createMutationHook({
    endpoint: UpdateSubscriptionTemplateCommand.TSQ_url,
    requestMethod: UpdateSubscriptionTemplateCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: UpdateSubscriptionTemplateCommand.RequestBodySchema,
    responseSchema: UpdateSubscriptionTemplateCommand.ResponseSchema
})
export const renameDefinitions: Record<RenameKind, RenameDefinition> = {
    configProfile: {
        schema: renameSchema(UpdateConfigProfileCommand.RequestBodySchema.omit({ uuid: true })),
        queryKey: QueryKeys.configProfiles.getConfigProfiles.queryKey,
        useSave: function useSave() {
            const mutation = useconfigProfileMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { uuid, name } })
            }
        }
    },
    externalSquad: {
        schema: renameSchema(UpdateExternalSquadCommand.RequestBodySchema.omit({ uuid: true })),
        queryKey: QueryKeys.externalSquads.getExternalSquads.queryKey,
        useSave: function useSave() {
            const mutation = useexternalSquadMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { uuid, name } })
            }
        }
    },
    internalSquad: {
        schema: renameSchema(UpdateInternalSquadCommand.RequestBodySchema.omit({ uuid: true })),
        queryKey: QueryKeys.internalSquads.getInternalSquads.queryKey,
        useSave: function useSave() {
            const mutation = useinternalSquadMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { uuid, name } })
            }
        }
    },
    nodePlugin: {
        schema: renameSchema(UpdateNodePluginCommand.RequestBodySchema.omit({ uuid: true })),
        queryKey: QueryKeys.nodePlugins.getNodePlugins.queryKey,
        useSave: function useSave() {
            const mutation = usenodePluginMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { uuid, name } })
            }
        }
    },
    passkey: {
        schema: renameSchema(UpdatePasskeyCommand.RequestBodySchema.omit({ id: true })),
        queryKey: QueryKeys.passkeys.getPasskeys.queryKey,
        useSave: function useSave() {
            const mutation = usepasskeyMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { id: uuid, name } })
            }
        }
    },
    subpageConfig: {
        schema: renameSchema(UpdateSubpageConfigCommand.RequestBodySchema.omit({ uuid: true })),
        queryKey: QueryKeys.subpageConfigs.getSubpageConfigs.queryKey,
        useSave: function useSave() {
            const mutation = usesubpageConfigMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { uuid, name } })
            }
        }
    },
    template: {
        schema: renameSchema(
            UpdateSubscriptionTemplateCommand.RequestBodySchema.omit({ uuid: true })
        ),
        queryKey: QueryKeys.subscriptionTemplate.getSubscriptionTemplates.queryKey,
        useSave: function useSave() {
            const mutation = usetemplateMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, name) => mutation.mutateAsync({ variables: { uuid, name } })
            }
        }
    }
}
