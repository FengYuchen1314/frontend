import { Box, Center, Loader, MantineStyleProp, Stack, Text, ThemeIcon } from '@mantine/core'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCreditCard } from 'react-icons/tb'
import { Virtuoso } from 'react-virtuoso'

import { SectionCard } from '@shared/ui/section-card'

import styles from './fade-mask.module.css'
import { BillingRecord, groupRecordsByMonth } from './group-records-by-month'
import { MonthDivider } from './month-divider'
import { RecordCard } from './record-card'
import { useDeleteBillingRecord } from './use-delete-billing-record'

type Row =
    | { key: string; label: string; total: number; type: 'divider' }
    | { key: string; record: BillingRecord; type: 'record' }

const RECORD_ESTIMATE = 72
const ROW_GAP = 8
const REACH_BOTTOM_THRESHOLD = 300

function LoadingFooter({ context }: { context?: { isLoadingMore: boolean } }) {
    return context?.isLoadingMore ? (
        <Center py="sm">
            <Loader size="sm" />
        </Center>
    ) : null
}

const LIST_COMPONENTS = { Footer: LoadingFooter }

interface IProps {
    height: string
    isLoadingMore: boolean
    onReachBottom: () => void
    records: BillingRecord[]
    refetchRecords: () => void
    style?: MantineStyleProp
}

export function VirtualizedRecordsList(props: IProps) {
    const { height, isLoadingMore, onReachBottom, records, refetchRecords, style } = props
    const { i18n, t } = useTranslation()

    const handleDelete = useDeleteBillingRecord(refetchRecords)

    const rows = useMemo<Row[]>(() => {
        const groups = groupRecordsByMonth(records, i18n.language)
        const result: Row[] = []

        for (const group of groups) {
            result.push({
                type: 'divider',
                key: `divider-${group.label}`,
                label: group.label,
                total: group.total
            })

            for (const record of group.records) {
                result.push({ type: 'record', key: record.uuid, record })
            }
        }

        return result
    }, [records, i18n.language])

    const scrollRef = useRef<HTMLElement | null>(null)
    const [fade, setFade] = useState({ bottom: false, top: false })
    const setScrollElement = useCallback((element: HTMLElement | Window | null) => {
        scrollRef.current = element instanceof HTMLElement ? element : null
    }, [])

    const updateFade = useCallback(() => {
        const el = scrollRef.current
        if (!el) {
            return
        }

        const { scrollTop, scrollHeight, clientHeight } = el
        const isScrollable = scrollHeight - clientHeight > 1

        const top = isScrollable && scrollTop > 4
        const bottom = isScrollable && scrollTop + clientHeight < scrollHeight - 4
        setFade((previous) =>
            previous.top === top && previous.bottom === bottom ? previous : { top, bottom }
        )

        if (!isLoadingMore && scrollTop + clientHeight >= scrollHeight - REACH_BOTTOM_THRESHOLD) {
            onReachBottom()
        }
    }, [isLoadingMore, onReachBottom])

    if (records.length === 0) {
        return (
            <SectionCard.Root p="xl" style={style}>
                <SectionCard.Section>
                    <Center py="xl">
                        <Stack align="center" gap="lg">
                            <ThemeIcon color="gray" radius="xl" size={64} variant="soft">
                                <TbCreditCard size={32} />
                            </ThemeIcon>

                            <Stack align="center" gap="xs">
                                <Text c="dimmed" fw={600} size="md" ta="center">
                                    {t(
                                        'infra-billing-records-table.widget.no-billing-records-found'
                                    )}
                                </Text>
                            </Stack>
                        </Stack>
                    </Center>
                </SectionCard.Section>
            </SectionCard.Root>
        )
    }

    const fadeClassName =
        [fade.top && styles.fadeTop, fade.bottom && styles.fadeBottom].filter(Boolean).join(' ') ||
        undefined

    return (
        <Box className={fadeClassName} style={{ height, ...style }}>
            <Virtuoso
                components={LIST_COMPONENTS}
                computeItemKey={(_, row) => row.key}
                context={{ isLoadingMore }}
                data={rows}
                defaultItemHeight={RECORD_ESTIMATE}
                increaseViewportBy={RECORD_ESTIMATE * 8}
                itemContent={(_, row) => (
                    <Box style={{ paddingBottom: ROW_GAP }}>
                        {row.type === 'divider' ? (
                            <MonthDivider label={row.label} total={row.total} />
                        ) : (
                            <RecordCard onDelete={handleDelete} record={row.record} />
                        )}
                    </Box>
                )}
                onScroll={updateFade}
                scrollerRef={setScrollElement}
                style={{ height: '100%', overflowX: 'hidden' }}
                totalListHeightChanged={updateFade}
            />
        </Box>
    )
}
