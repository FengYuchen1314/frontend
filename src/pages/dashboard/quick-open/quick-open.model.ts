export function resolveQuickOpenPath(
    routePattern: string,
    entity: string,
    value: string,
    validate: (id: string) => boolean
): string | null {
    const id = value.trim()
    if (!id || !validate(id)) return null
    return routePattern.replace(':entity', entity).replace(':id', id)
}

export function createCopyRequest() {
    let generation = 0
    return {
        invalidate: () => {
            generation += 1
        },
        copy: async (write: () => Promise<void>): Promise<'copied' | 'error' | null> => {
            const current = ++generation
            try {
                await write()
                return current === generation ? 'copied' : null
            } catch {
                return current === generation ? 'error' : null
            }
        }
    }
}
