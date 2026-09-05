import type { IProps } from './interfaces/props.interface'

import { Checkbox } from '@mantine/core'
import { memo } from 'react'
import { Virtuoso } from 'react-virtuoso'

import { InboundCheckboxCardShared } from '../inbound-checkbox-card/inbound-checkbox-card.shared'

const INBOUND_HEIGHT = 60
const MAX_VISIBLE_INBOUNDS = 6

export const VirtualizedInboundsListShared = memo((props: IProps) => {
    const { profile, selectedInbounds, onInboundToggle } = props
    const containerHeight = Math.min(profile.inbounds.length, MAX_VISIBLE_INBOUNDS) * INBOUND_HEIGHT

    return (
        <Checkbox.Group>
            <Virtuoso
                computeItemKey={(_, inbound) => inbound.uuid}
                data={profile.inbounds}
                fixedItemHeight={INBOUND_HEIGHT}
                increaseViewportBy={INBOUND_HEIGHT * 2}
                itemContent={(_, inbound) => (
                    <div style={{ height: INBOUND_HEIGHT, cursor: 'pointer' }}>
                        <InboundCheckboxCardShared
                            inbound={inbound}
                            isSelected={selectedInbounds.has(inbound.uuid)}
                            onInboundToggle={onInboundToggle}
                        />
                    </div>
                )}
                style={{ height: containerHeight }}
            />
        </Checkbox.Group>
    )
})

VirtualizedInboundsListShared.displayName = 'VirtualizedInboundsListShared'
