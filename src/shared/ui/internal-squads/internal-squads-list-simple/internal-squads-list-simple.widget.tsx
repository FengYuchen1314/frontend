import { Stack, Text } from '@mantine/core'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { PiEmpty } from 'react-icons/pi'
import { Virtuoso } from 'react-virtuoso'

import { InternalSquadCardShared } from '../internal-squad-card'
import { IProps } from './interfaces'

export const InternalSquadsListSimpleWidgetShared = memo((props: IProps) => {
    const { filteredInternalSquads } = props
    const { t } = useTranslation()

    return (
        <Stack gap="md" mt={10}>
            {filteredInternalSquads.length === 0 ? (
                <Stack align="center" gap="md" h={100} justify="center">
                    <PiEmpty size={48} />
                    <Text c="dimmed" size="sm" ta="center">
                        {t('internal-squads-list.widget.no-squads-found')}
                    </Text>
                </Stack>
            ) : (
                <div
                    style={{
                        height: Math.min(200, filteredInternalSquads.length * 80),
                        borderRadius: '8px',
                        padding: '8px'
                    }}
                >
                    <Virtuoso
                        computeItemKey={(_, squad) => squad.uuid}
                        data={filteredInternalSquads}
                        fixedItemHeight={60}
                        increaseViewportBy={600}
                        itemContent={(_, internalSquad) => (
                            <div style={{ height: 60 }}>
                                <InternalSquadCardShared internalSquad={internalSquad} />
                            </div>
                        )}
                        style={{ height: '100%' }}
                    />
                </div>
            )}
        </Stack>
    )
})
