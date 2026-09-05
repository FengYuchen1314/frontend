import { Checkbox, Stack, Text, TextInput } from '@mantine/core'
import { GetInternalSquadsCommand } from '@remnawave/backend-contract'
import { Key, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { PiEmpty } from 'react-icons/pi'
import { TbCirclesRelation } from 'react-icons/tb'
import { Virtuoso } from 'react-virtuoso'

import { InternalSquadCheckboxCard } from '../internal-squad-checkbox-card'

export interface IProps {
    description?: string
    filteredInternalSquads: GetInternalSquadsCommand.Response['response']['internalSquads']
    formKey: Key | null | undefined
    hideEditButton?: boolean
    label?: string
    searchQuery: string
    setSearchQuery: (value: string) => void
}

export const InternalSquadsListWidget = memo((props: IProps) => {
    const {
        filteredInternalSquads,
        formKey,
        searchQuery,
        setSearchQuery,
        label,
        description,
        hideEditButton,
        ...rest
    } = props
    const { t } = useTranslation()

    return (
        <Stack gap="md">
            <TextInput
                description={description}
                label={label}
                leftSection={<TbCirclesRelation size={16} />}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('internal-squads-list.widget.search-internal-squads')}
                value={searchQuery}
            />

            <Checkbox.Group key={formKey} {...rest}>
                <div
                    style={{
                        height:
                            filteredInternalSquads.length === 0
                                ? 200
                                : Math.min(200, filteredInternalSquads.length * 80),
                        border: '1px solid var(--mantine-color-gray-7)',
                        borderRadius: '8px',
                        padding: '8px'
                    }}
                >
                    {filteredInternalSquads.length === 0 ? (
                        <Stack align="center" gap="md" h="100%" justify="center">
                            <PiEmpty size={48} />
                            <Text c="dimmed" size="sm" ta="center">
                                {t('internal-squads-list.widget.no-squads-found')}
                            </Text>
                        </Stack>
                    ) : (
                        <Virtuoso
                            computeItemKey={(_, squad) => squad.uuid}
                            data={filteredInternalSquads}
                            fixedItemHeight={60}
                            increaseViewportBy={600}
                            itemContent={(_, internalSquad) => (
                                <div style={{ height: 60 }}>
                                    <InternalSquadCheckboxCard
                                        hideEditButton={hideEditButton}
                                        internalSquad={internalSquad}
                                    />
                                </div>
                            )}
                            style={{ height: '100%' }}
                        />
                    )}
                </div>
            </Checkbox.Group>
        </Stack>
    )
})
