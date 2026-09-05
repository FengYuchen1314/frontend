import {
    CreateConfigProfileCommand,
    CreateExternalSquadCommand,
    CreateInternalSquadCommand,
    CreateNodePluginCommand,
    CreateSubpageConfigCommand,
    CreateSubscriptionTemplateCommand,
    type TSubscriptionTemplateType
} from '@remnawave/backend-contract'

import { QueryKeys } from '@shared/api/hooks/keys-factory'
import { createMutationHook } from '@shared/api/tsq-helpers/create-mutation-hook'

import {
    configCreationBody,
    templateCreationBody,
    type CreatedEntity,
    type CreateKind,
    type CreateValues
} from './create-draft'

export interface CreationDefinition {
    queryKey: readonly unknown[]
    useCreate: () => {
        isPending: boolean
        create: (
            values: CreateValues,
            templateType?: TSubscriptionTemplateType
        ) => Promise<CreatedEntity>
    }
}

const useTemplate = createMutationHook({
    endpoint: CreateSubscriptionTemplateCommand.TSQ_url,
    bodySchema: CreateSubscriptionTemplateCommand.RequestBodySchema,
    responseSchema: CreateSubscriptionTemplateCommand.ResponseSchema,
    requestMethod: CreateSubscriptionTemplateCommand.endpointDetails.REQUEST_METHOD
})
const useExternalSquad = createMutationHook({
    endpoint: CreateExternalSquadCommand.TSQ_url,
    bodySchema: CreateExternalSquadCommand.RequestBodySchema,
    responseSchema: CreateExternalSquadCommand.ResponseSchema,
    requestMethod: CreateExternalSquadCommand.endpointDetails.REQUEST_METHOD
})
const useInternalSquad = createMutationHook({
    endpoint: CreateInternalSquadCommand.TSQ_url,
    bodySchema: CreateInternalSquadCommand.RequestBodySchema,
    responseSchema: CreateInternalSquadCommand.ResponseSchema,
    requestMethod: CreateInternalSquadCommand.endpointDetails.REQUEST_METHOD
})
const useConfigProfile = createMutationHook({
    endpoint: CreateConfigProfileCommand.TSQ_url,
    bodySchema: CreateConfigProfileCommand.RequestBodySchema,
    responseSchema: CreateConfigProfileCommand.ResponseSchema,
    requestMethod: CreateConfigProfileCommand.endpointDetails.REQUEST_METHOD
})
const useNodePlugin = createMutationHook({
    endpoint: CreateNodePluginCommand.TSQ_url,
    bodySchema: CreateNodePluginCommand.RequestBodySchema,
    responseSchema: CreateNodePluginCommand.ResponseSchema,
    requestMethod: CreateNodePluginCommand.endpointDetails.REQUEST_METHOD
})
const useSubpageConfig = createMutationHook({
    endpoint: CreateSubpageConfigCommand.TSQ_url,
    bodySchema: CreateSubpageConfigCommand.RequestBodySchema,
    responseSchema: CreateSubpageConfigCommand.ResponseSchema,
    requestMethod: CreateSubpageConfigCommand.endpointDetails.REQUEST_METHOD
})

export const creationDefinitions: Record<CreateKind, CreationDefinition> = {
    template: {
        queryKey: QueryKeys.subscriptionTemplate.getSubscriptionTemplates.queryKey,
        useCreate: function useCreate() {
            const mutation = useTemplate()
            return {
                isPending: mutation.isPending,
                create: (values, templateType) =>
                    mutation.mutateAsync({ variables: templateCreationBody(values, templateType) })
            }
        }
    },
    externalSquad: {
        queryKey: QueryKeys.externalSquads.getExternalSquads.queryKey,
        useCreate: function useCreate() {
            const mutation = useExternalSquad()
            return {
                isPending: mutation.isPending,
                create: (values) => mutation.mutateAsync({ variables: { name: values.name } })
            }
        }
    },
    internalSquad: {
        queryKey: QueryKeys.internalSquads.getInternalSquads.queryKey,
        useCreate: function useCreate() {
            const mutation = useInternalSquad()
            return {
                isPending: mutation.isPending,
                create: (values) =>
                    mutation.mutateAsync({ variables: { name: values.name, inbounds: [] } })
            }
        }
    },
    configProfile: {
        queryKey: QueryKeys.configProfiles.getConfigProfiles.queryKey,
        useCreate: function useCreate() {
            const mutation = useConfigProfile()
            return {
                isPending: mutation.isPending,
                create: (values) => mutation.mutateAsync({ variables: configCreationBody(values) })
            }
        }
    },
    nodePlugin: {
        queryKey: QueryKeys.nodePlugins.getNodePlugins.queryKey,
        useCreate: function useCreate() {
            const mutation = useNodePlugin()
            return {
                isPending: mutation.isPending,
                create: (values) => mutation.mutateAsync({ variables: { name: values.name } })
            }
        }
    },
    subpageConfig: {
        queryKey: QueryKeys.subpageConfigs.getSubpageConfigs.queryKey,
        useCreate: function useCreate() {
            const mutation = useSubpageConfig()
            return {
                isPending: mutation.isPending,
                create: (values) => mutation.mutateAsync({ variables: { name: values.name } })
            }
        }
    }
}
