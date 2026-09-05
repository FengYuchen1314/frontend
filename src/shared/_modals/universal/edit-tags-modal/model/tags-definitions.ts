import type { UseQueryResult } from '@tanstack/react-query'

import {
    SetConfigProfileTagsCommand,
    SetExternalSquadTagsCommand,
    SetInternalSquadTagsCommand,
    SetNodePluginTagsCommand,
    SetSubpageConfigTagsCommand,
    SetSubscriptionTemplateTagsCommand
} from '@remnawave/backend-contract'

import { useGetConfigProfilesTags } from '@shared/api/hooks/config-profiles/config-profiles.query.hooks'
import { useGetExternalSquadsTags } from '@shared/api/hooks/external-squads/external-squads.query.hooks'
import { useGetInternalSquadsTags } from '@shared/api/hooks/internal-squads/internal-squads.query.hooks'
import { QueryKeys } from '@shared/api/hooks/keys-factory'
import { useGetNodePluginsTags } from '@shared/api/hooks/node-plugins/node-plugins.query.hooks'
import { useGetSubpageConfigsTags } from '@shared/api/hooks/subpage-configs/subpage-configs.query.hooks'
import { useGetSubscriptionTemplatesTags } from '@shared/api/hooks/subscription-template/subscription-template.query.hooks'
import { createMutationHook } from '@shared/api/tsq-helpers/create-mutation-hook'
export type TagsKind =
    | 'configProfile'
    | 'externalSquad'
    | 'internalSquad'
    | 'nodePlugin'
    | 'subpageConfig'
    | 'template'
export interface TagsDefinition {
    queryKey: readonly unknown[]
    tagsQueryKey: readonly unknown[]
    useKnownTags: () => UseQueryResult<{ tags: string[] }>
    useSave: () => { isPending: boolean; save: (uuid: string, tags: string[]) => Promise<unknown> }
}
const useconfigProfileMutation = createMutationHook({
    endpoint: SetConfigProfileTagsCommand.TSQ_url,
    requestMethod: SetConfigProfileTagsCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: SetConfigProfileTagsCommand.RequestBodySchema,
    responseSchema: SetConfigProfileTagsCommand.ResponseSchema
})
const useexternalSquadMutation = createMutationHook({
    endpoint: SetExternalSquadTagsCommand.TSQ_url,
    requestMethod: SetExternalSquadTagsCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: SetExternalSquadTagsCommand.RequestBodySchema,
    responseSchema: SetExternalSquadTagsCommand.ResponseSchema
})
const useinternalSquadMutation = createMutationHook({
    endpoint: SetInternalSquadTagsCommand.TSQ_url,
    requestMethod: SetInternalSquadTagsCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: SetInternalSquadTagsCommand.RequestBodySchema,
    responseSchema: SetInternalSquadTagsCommand.ResponseSchema
})
const usenodePluginMutation = createMutationHook({
    endpoint: SetNodePluginTagsCommand.TSQ_url,
    requestMethod: SetNodePluginTagsCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: SetNodePluginTagsCommand.RequestBodySchema,
    responseSchema: SetNodePluginTagsCommand.ResponseSchema
})
const usesubpageConfigMutation = createMutationHook({
    endpoint: SetSubpageConfigTagsCommand.TSQ_url,
    requestMethod: SetSubpageConfigTagsCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: SetSubpageConfigTagsCommand.RequestBodySchema,
    responseSchema: SetSubpageConfigTagsCommand.ResponseSchema
})
const usetemplateMutation = createMutationHook({
    endpoint: SetSubscriptionTemplateTagsCommand.TSQ_url,
    requestMethod: SetSubscriptionTemplateTagsCommand.endpointDetails.REQUEST_METHOD,
    bodySchema: SetSubscriptionTemplateTagsCommand.RequestBodySchema,
    responseSchema: SetSubscriptionTemplateTagsCommand.ResponseSchema
})
export const tagsDefinitions: Record<TagsKind, TagsDefinition> = {
    configProfile: {
        queryKey: QueryKeys.configProfiles.getConfigProfiles.queryKey,
        tagsQueryKey: QueryKeys.configProfiles.getConfigProfilesTags.queryKey,
        useKnownTags: useGetConfigProfilesTags,
        useSave: function useSave() {
            const mutation = useconfigProfileMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, tags) => mutation.mutateAsync({ variables: { uuid, tags } })
            }
        }
    },
    externalSquad: {
        queryKey: QueryKeys.externalSquads.getExternalSquads.queryKey,
        tagsQueryKey: QueryKeys.externalSquads.getExternalSquadsTags.queryKey,
        useKnownTags: useGetExternalSquadsTags,
        useSave: function useSave() {
            const mutation = useexternalSquadMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, tags) => mutation.mutateAsync({ variables: { uuid, tags } })
            }
        }
    },
    internalSquad: {
        queryKey: QueryKeys.internalSquads.getInternalSquads.queryKey,
        tagsQueryKey: QueryKeys.internalSquads.getInternalSquadsTags.queryKey,
        useKnownTags: useGetInternalSquadsTags,
        useSave: function useSave() {
            const mutation = useinternalSquadMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, tags) => mutation.mutateAsync({ variables: { uuid, tags } })
            }
        }
    },
    nodePlugin: {
        queryKey: QueryKeys.nodePlugins.getNodePlugins.queryKey,
        tagsQueryKey: QueryKeys.nodePlugins.getNodePluginsTags.queryKey,
        useKnownTags: useGetNodePluginsTags,
        useSave: function useSave() {
            const mutation = usenodePluginMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, tags) => mutation.mutateAsync({ variables: { uuid, tags } })
            }
        }
    },
    subpageConfig: {
        queryKey: QueryKeys.subpageConfigs.getSubpageConfigs.queryKey,
        tagsQueryKey: QueryKeys.subpageConfigs.getSubpageConfigsTags.queryKey,
        useKnownTags: useGetSubpageConfigsTags,
        useSave: function useSave() {
            const mutation = usesubpageConfigMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, tags) => mutation.mutateAsync({ variables: { uuid, tags } })
            }
        }
    },
    template: {
        queryKey: QueryKeys.subscriptionTemplate.getSubscriptionTemplates.queryKey,
        tagsQueryKey: QueryKeys.subscriptionTemplate.getSubscriptionTemplatesTags.queryKey,
        useKnownTags: useGetSubscriptionTemplatesTags,
        useSave: function useSave() {
            const mutation = usetemplateMutation()
            return {
                isPending: mutation.isPending,
                save: (uuid, tags) => mutation.mutateAsync({ variables: { uuid, tags } })
            }
        }
    }
}
