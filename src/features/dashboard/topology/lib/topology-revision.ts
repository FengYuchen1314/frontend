export interface TopologyRevision {
    uuid: string
    version: number
}

// The expected version belongs to the loaded draft, never to a refreshed query.
export function getTopologyMutationRevision(
    selectedUuid: string,
    loadedRevision: TopologyRevision | null
): TopologyRevision {
    if (!loadedRevision || loadedRevision.uuid !== selectedUuid) {
        throw new Error('Wait for this topology to finish loading before saving.')
    }
    return { ...loadedRevision }
}
