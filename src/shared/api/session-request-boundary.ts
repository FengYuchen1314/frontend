import {
    CanceledError,
    isAxiosError,
    type AxiosInstance,
    type InternalAxiosRequestConfig
} from 'axios'
import consola from 'consola/browser'

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
    const listeners = new Set<() => void>()

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
        subscribe: (listener: () => void) => {
            listeners.add(listener)
            return () => {
                listeners.delete(listener)
            }
        },
        setToken: (nextToken: string) => {
            if (nextToken === token) return
            token = nextToken
            generation++
            // Clear on login, account replacement AND expiration. Header-only
            // logout handlers otherwise leave cached records behind on a 401.
            try {
                onSessionChange()
            } finally {
                for (const listener of listeners) {
                    try {
                        listener()
                    } catch {
                        // One subscriber must not prevent other sensitive state from locking.
                        consola.error('Session change listener failed')
                    }
                }
            }
        }
    }
}
