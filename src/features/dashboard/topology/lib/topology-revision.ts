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

// Server revisions protect writes to the database. This independent epoch protects the local
// editor from responses belonging to another selection, an older draft or an earlier request.
export class TopologyDraftRequests {
    private epoch = 0
    private readonly requests = new Map<string, number>()

    invalidate(): void {
        this.epoch++
    }

    begin(channel: 'mutation' | 'preview' | 'reload'): () => boolean {
        const epoch = this.epoch
        const request = (this.requests.get(channel) ?? 0) + 1
        this.requests.set(channel, request)
        return () => this.epoch === epoch && this.requests.get(channel) === request
    }
}
