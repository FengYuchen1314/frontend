import type { IProps } from './interfaces/props.interface'

import { Box, Center, Checkbox, Text } from '@mantine/core'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'

import { FlatInboundCheckboxCardShared } from '../flat-inbound-checkbox-card/flat-inbound-checkbox-card.shared'
import classes from './VirtualizedFlatInboundsList.module.css'

const INBOUND_HEIGHT = 60

export const VirtualizedFlatInboundsListShared = memo((props: IProps) => {
    const { allInbounds, selectedInbounds, onInboundToggle, filterType } = props
    const { t } = useTranslation()

    const filteredInbounds = useMemo(() => {
        switch (filterType) {
            case 'selected':
                return allInbounds.filter(({ inbound }) => selectedInbounds.has(inbound.uuid))
            case 'unselected':
                return allInbounds.filter(({ inbound }) => !selectedInbounds.has(inbound.uuid))
            default:
                return allInbounds
        }
    }, [allInbounds, selectedInbounds, filterType])

    if (filteredInbounds.length === 0) {
        return (
            <Center h="100%">
                <Text c="dimmed" size="sm" ta="center">
                    {t('virtualized-flat-inbounds-list.shared.no-inbounds-found')}
                </Text>
            </Center>
        )
    }

    return (
        <Box
            style={{
                height: '100%',
                border: '1px solid var(--mantine-color-gray-7)',
                borderRadius: '8px',
                padding: '8px'
            }}
        >
            <Checkbox.Group className={classes.checkboxGroup}>
                <Virtuoso
                    computeItemKey={(_, { inbound }) => inbound.uuid}
                    data={filteredInbounds}
                    fixedItemHeight={INBOUND_HEIGHT}
                    increaseViewportBy={INBOUND_HEIGHT * 5}
                    itemContent={(_, { inbound, profileName }) => (
                        <div style={{ height: INBOUND_HEIGHT, paddingBottom: '4px' }}>
                            <FlatInboundCheckboxCardShared
                                inbound={inbound}
                                isSelected={selectedInbounds.has(inbound.uuid)}
                                onInboundToggle={onInboundToggle}
                                profileName={profileName}
                            />
                        </div>
                    )}
                    style={{ height: '100%' }}
                />
            </Checkbox.Group>
        </Box>
    )
})

VirtualizedFlatInboundsListShared.displayName = 'VirtualizedFlatInboundsListShared'
