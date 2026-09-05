import {
    CreateConfigProfileCommand,
    CreateExternalSquadCommand,
    CreateInternalSquadCommand,
    CreateNodePluginCommand,
    CreateSubpageConfigCommand,
    CreateSubscriptionTemplateCommand,
    type TSubscriptionTemplateType
} from '@remnawave/backend-contract'
import { generatePath } from 'react-router'
import { z } from 'zod'

import {
    createManagedProtocolConfig,
    DEFAULT_MANAGED_PROTOCOL_CREATION_PRESET,
    getManagedAnyTlsPresetError,
    MANAGED_PROTOCOL_CREATION_WHITELIST,
    type ManagedProtocolCreationPresetId
} from '@shared/constants/managed-protocols'
import { ROUTES } from '@shared/constants/routes'

export type CreateKind =
    | 'template'
    | 'externalSquad'
    | 'internalSquad'
    | 'configProfile'
    | 'nodePlugin'
    | 'subpageConfig'
export interface CreateValues {
    name: string
    managedProtocolPreset: ManagedProtocolCreationPresetId
    serverName: string
    address: string
    camouflagePort: number
    wrapperPort: number
    innerPort: number
}
export interface CreatedEntity {
    uuid: string
    templateType?: TSubscriptionTemplateType
}
export const creationDefaults = (): CreateValues => ({
    name: '',
    managedProtocolPreset: DEFAULT_MANAGED_PROTOCOL_CREATION_PRESET,
    serverName: '',
    address: '',
    camouflagePort: 443,
    wrapperPort: 14443,
    innerPort: 16001
})
export const creationNameSchemas = {
    template: CreateSubscriptionTemplateCommand.RequestBodySchema.shape.name,
    externalSquad: CreateExternalSquadCommand.RequestBodySchema.shape.name,
    internalSquad: CreateInternalSquadCommand.RequestBodySchema.shape.name,
    configProfile: CreateConfigProfileCommand.RequestBodySchema.shape.name,
    nodePlugin: CreateNodePluginCommand.RequestBodySchema.shape.name,
    subpageConfig: CreateSubpageConfigCommand.RequestBodySchema.shape.name
} as const
export const anyTlsOptions = (values: CreateValues) => ({
    wrapperPort: values.wrapperPort,
    innerPort: values.innerPort,
    camouflage: {
        serverName: values.serverName.trim(),
        address: values.address.trim(),
        port: values.camouflagePort
    }
})
export function creationSchema(kind: CreateKind) {
    return z
        .object({
            name: creationNameSchemas[kind],
            managedProtocolPreset: z.enum(
                MANAGED_PROTOCOL_CREATION_WHITELIST.map((preset) => preset.id)
            ),
            serverName: z.string(),
            address: z.string(),
            camouflagePort: z.number().or(z.nan()),
            wrapperPort: z.number().or(z.nan()),
            innerPort: z.number().or(z.nan())
        })
        .superRefine((values, context) => {
            if (kind !== 'configProfile' || values.managedProtocolPreset !== 'anytls-shadowtls')
                return
            const error = getManagedAnyTlsPresetError(anyTlsOptions(values))
            // RHF clears its reserved `root` errors before deciding whether to call
            // onValid. Cross-field preset validation must belong to a real field.
            if (error)
                context.addIssue({
                    code: 'custom',
                    path: ['managedProtocolPreset'],
                    message: error
                })
        })
}
export function configCreationBody(values: CreateValues): CreateConfigProfileCommand.RequestBody {
    const parsed = creationSchema('configProfile').parse(values)
    return {
        name: parsed.name,
        config: createManagedProtocolConfig(parsed.managedProtocolPreset, anyTlsOptions(parsed))
    }
}
export function templateCreationBody(
    values: CreateValues,
    templateType?: TSubscriptionTemplateType
) {
    return CreateSubscriptionTemplateCommand.RequestBodySchema.parse({
        name: values.name,
        templateType
    })
}
export function creationDestination(kind: CreateKind, result: CreatedEntity) {
    if (kind === 'externalSquad') return { type: 'externalSquad' as const, uuid: result.uuid }
    if (kind === 'internalSquad') return { type: 'internalSquad' as const, uuid: result.uuid }
    if (kind === 'template') {
        const templateType =
            CreateSubscriptionTemplateCommand.RequestBodySchema.shape.templateType.parse(
                result.templateType
            )
        return {
            type: 'navigate' as const,
            to: generatePath(ROUTES.DASHBOARD.TEMPLATES.TEMPLATE_EDITOR, {
                type: templateType,
                uuid: result.uuid
            })
        }
    }
    const routes = {
        configProfile: ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_BY_UUID,
        nodePlugin: ROUTES.DASHBOARD.MANAGEMENT.NODE_PLUGINS.NODE_PLUGIN_BY_UUID,
        subpageConfig: ROUTES.DASHBOARD.SUBPAGE_CONFIGS.SUBPAGE_CONFIG_BY_UUID
    }
    return { type: 'navigate' as const, to: generatePath(routes[kind], { uuid: result.uuid }) }
}
export type CreationDestination = ReturnType<typeof creationDestination>
