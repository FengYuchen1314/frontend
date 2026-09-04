import { GetConfigProfilesCommand, TServerType } from '@remnawave/backend-contract'
import { ReactNode } from 'react'

export interface IProps {
    activeConfigProfileInbounds: null | string[] | undefined
    activeConfigProfileUuid: null | string | undefined
    configProfiles: GetConfigProfilesCommand.Response['response']['configProfiles']
    errors?: ReactNode
    managedProtocolCreationOnly?: boolean
    onSaveInbounds: (inbounds: string[], configProfileUuid: string) => void
    serverType?: TServerType
}
