import { useCallback, useMemo, useState } from 'react'

interface InboundDraft {
    isOpen: boolean
    revision: number
    selectedInbounds: null | Set<string>
    squadUuid: string
}

export function createInboundDraft(squadUuid: string, isOpen: boolean): InboundDraft {
    return { squadUuid, isOpen, selectedInbounds: null, revision: 0 }
}

export function editInboundDraft(
    draft: InboundDraft,
    remoteSelection: Set<string>,
    update: (selection: Set<string>) => Set<string>
): InboundDraft {
    if (!draft.isOpen) return draft
    return {
        ...draft,
        revision: draft.revision + 1,
        selectedInbounds: update(new Set(draft.selectedInbounds ?? remoteSelection))
    }
}

export function useInternalSquadInboundsDraft(
    squadUuid: string,
    isOpen: boolean,
    inbounds: readonly { uuid: string }[] | undefined
) {
    const remoteSelection = useMemo(
        () => new Set(inbounds?.map((inbound) => inbound.uuid)),
        [inbounds]
    )
    const [draft, setDraft] = useState(() => createInboundDraft(squadUuid, isOpen))

    // A refetch can refresh an untouched form, but never replaces a local selection.
    // Changing the entity or opening the drawer again starts a fresh editing scope.
    let scopedDraft = draft
    if (draft.squadUuid !== squadUuid || draft.isOpen !== isOpen) {
        scopedDraft = createInboundDraft(squadUuid, isOpen)
        setDraft(scopedDraft)
    }

    const setSelectedInbounds = useCallback(
        (update: (selection: Set<string>) => Set<string>) => {
            setDraft((current) => {
                const scoped =
                    current.squadUuid === squadUuid && current.isOpen === isOpen
                        ? current
                        : createInboundDraft(squadUuid, isOpen)
                return editInboundDraft(scoped, remoteSelection, update)
            })
        },
        [squadUuid, isOpen, remoteSelection]
    )

    return {
        revision: scopedDraft.revision,
        selectedInbounds: scopedDraft.selectedInbounds ?? remoteSelection,
        setSelectedInbounds
    }
}
