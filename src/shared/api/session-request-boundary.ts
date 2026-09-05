import {
    CanceledError,
    isAxiosError,
    type AxiosInstance,
    type InternalAxiosRequestConfig
} from 'axios'

export class InactiveSessionError extends CanceledError<unknown> {
    constructor() {
        super('Request belongs to an inactive session')
    }
}

/** One authority for request ownership, independent of UI or stored credentials. */
export function createSessionRequestBoundary(
    client: AxiosInstance,
    onUnauthorized: () => void,
    onSessionChange: () => void
) {
    let token = ''
    let generation = 0
    const requests = new WeakMap<InternalAxiosRequestConfig, number>()

    const isStale = (config: InternalAxiosRequestConfig | undefined) =>
        config !== undefined && requests.has(config) && requests.get(config) !== generation

    client.interceptors.request.use(
        (config) => {
            requests.set(config, generation)
            if (token) config.headers.set('Authorization', `Bearer ${token}`)
            else config.headers.delete('Authorization')
            return config
        },
        undefined,
        { synchronous: true }
    )

    client.interceptors.response.use(
        (response) => {
            if (isStale(response.config)) {
                throw new InactiveSessionError()
            }
            return response
        },
        (error: unknown) => {
            if (isAxiosError(error)) {
                if (isStale(error.config)) {
                    throw new InactiveSessionError()
                }
                const status = error.response?.status
                // Preserve the backend's 401/403 expiration behavior, but never
                // expire a new login or broadcast logout for anonymous failures.
                if (
                    token &&
                    error.config &&
                    requests.has(error.config) &&
                    (status === 401 || status === 403)
                ) {
                    onUnauthorized()
                }
            }
            return Promise.reject(error)
        }
    )

    return {
        getToken: () => token,
        getGeneration: () => generation,
        assertGeneration: (expected: number) => {
            if (expected !== generation) throw new InactiveSessionError()
        },
        setToken: (nextToken: string) => {
            if (nextToken === token) return
            token = nextToken
            generation++
            // Clear on login, account replacement AND expiration. Header-only
            // logout handlers otherwise leave cached records behind on a 401.
            onSessionChange()
        }
    }
}
