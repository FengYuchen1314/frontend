import { EvaluateVaultCommand } from '@remnawave/backend-contract'
import { ZodError } from 'zod'

import { instance } from '../../axios'
import { requestSessionResponse } from '../../session-response'

export const evaluateVault = async (blinded: string): Promise<string> => {
    try {
        const response = await requestSessionResponse(
            () => instance.post<unknown>(EvaluateVaultCommand.TSQ_url, { blinded }),
            EvaluateVaultCommand.ResponseSchema
        )
        return response.evaluated
    } catch (error) {
        if (error instanceof ZodError) throw new Error('Malformed vault evaluation response')
        throw error
    }
}
