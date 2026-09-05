export function createPageHeaderCopy(deps: {
    value: string | undefined
    isCurrent(): boolean
    write(value: string): Promise<void>
    success(value: string): void
    failure(error: unknown): void
}) {
    let pending = false
    let disposed = false
    const current = () => !disposed && deps.isCurrent()

    return {
        async copy(value: string | undefined) {
            if (!value || value !== deps.value || pending || !current()) return false
            pending = true
            try {
                await deps.write(value)
                if (!current()) return false
                deps.success(value)
                return true
            } catch (error) {
                if (current()) deps.failure(error)
                return false
            } finally {
                pending = false
            }
        },
        dispose() {
            disposed = true
        }
    }
}
