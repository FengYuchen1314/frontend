import { GetRemnawaveHealthCommand, GetStatusCommand } from '@remnawave/backend-contract'
import { onlineManager } from '@tanstack/react-query'
import { CanceledError, isAxiosError, isCancel } from 'axios'

import { assertSessionGeneration, hasAuthorizationToken, instance } from '@shared/api/axios'

export function connectionProbeRetryDelay(attemptIndex: number) {
    return Math.min(1_000 * 2 ** attemptIndex, 30_000)
}

export function connectionProbeOptions(generation: number) {
    return {
        queryKey: ['connection-probe', generation] as const,
        networkMode: 'always' as const,
        retry: (_attemptIndex: number, error: unknown) => !isCancel(error),
        retryDelay: connectionProbeRetryDelay,
        staleTime: 0,
        gcTime: 0,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
            const assertCurrent = () => {
                if (signal.aborted) throw new CanceledError('Connection probe canceled')
                assertSessionGeneration(generation)
            }
            assertCurrent()
            const probeUrl = hasAuthorizationToken()
                ? GetRemnawaveHealthCommand.TSQ_url
                : GetStatusCommand.TSQ_url

            try {
                await instance.get(probeUrl, { signal, timeout: 5_000 })
            } catch (error) {
                // HTTP errors still prove transport reachability; network failures
                // retry. A canceled or previous-session probe proves neither.
                if (isCancel(error) || !isAxiosError(error) || !error.response) throw error
            }
            assertCurrent()
            onlineManager.setOnline(true)
            return true
        }
    }
}
