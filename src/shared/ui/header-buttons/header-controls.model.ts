import semver from 'semver'

export function safeExternalUrl(value: string | undefined): string | undefined {
    if (!value) return undefined
    try {
        const url = new URL(value)
        return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
    } catch {
        return undefined
    }
}

export function versionPresentation(current: string, latest: string | undefined, branch: string) {
    const normalizedCurrent = semver.valid(current)
    const normalizedLatest = latest ? semver.valid(latest) : null
    return {
        isDev: branch !== 'main',
        isNewVersionAvailable: Boolean(
            normalizedCurrent && normalizedLatest && semver.gt(normalizedLatest, normalizedCurrent)
        )
    }
}

export function logoutFromHeader(emitLogout: () => void, navigateToLogin: () => void) {
    emitLogout()
    navigateToLogin()
}

export function refreshFromHeader(reset: () => void, clear: () => void, reload: () => void) {
    reset()
    clear()
    reload()
}

export function createDialogOperationScope() {
    let controller: AbortController | undefined
    let generation = 0
    return {
        open() {
            controller?.abort()
            controller = new AbortController()
            return { signal: controller.signal, generation: ++generation }
        },
        close() {
            controller?.abort()
        }
    }
}
