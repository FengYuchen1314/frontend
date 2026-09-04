import { TriggerUpdateCommand } from '@remnawave/backend-contract'

import { createMutationHook } from '../../tsq-helpers'

export const useTriggerUpdate = createMutationHook({
    endpoint: TriggerUpdateCommand.TSQ_url,
    responseSchema: TriggerUpdateCommand.ResponseSchema,
    requestMethod: TriggerUpdateCommand.endpointDetails.REQUEST_METHOD,
    rMutationParams: {}
})
