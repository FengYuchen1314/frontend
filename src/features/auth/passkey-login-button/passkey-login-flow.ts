import type { SessionMutationBoundary } from '@shared/api/session-mutation'
import { InactiveSessionError } from '@shared/api/session-request-boundary'

interface PasskeyLoginSteps<Options, Credential, Result> {
    getOptions: () => Promise<Options>
    authenticate: (options: Options) => Promise<Credential>
    verify: (credential: Credential) => Promise<Result>
    onSuccess: (result: Result) => void
    onSettled: () => void
}

/** Own the entire options -> authenticator -> verification flow, not just each HTTP request. */
export function createPasskeyLoginFlow(boundary: SessionMutationBoundary) {
    let attempt = 0

    return {
        invalidate: () => {
            attempt++
        },
        async run<Options, Credential, Result>(
            steps: PasskeyLoginSteps<Options, Credential, Result>
        ) {
            const currentAttempt = ++attempt
            const generation = boundary.getGeneration()
            const assertCurrent = () => {
                if (attempt !== currentAttempt) throw new InactiveSessionError()
                boundary.assertGeneration(generation)
            }

            try {
                assertCurrent()
                const options = await steps.getOptions()
                assertCurrent()
                const credential = await steps.authenticate(options)
                assertCurrent()
                const result = await steps.verify(credential)
                assertCurrent()
                // The only token commit is synchronous and owned by this admitted flow.
                steps.onSuccess(result)
            } catch (error) {
                assertCurrent()
                throw error
            } finally {
                if (attempt === currentAttempt) steps.onSettled()
            }
        }
    }
}
