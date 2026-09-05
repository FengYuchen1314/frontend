import type { MaskableField } from './recap.constants'

import { Alert, Button, Input, Label, Spinner, Switch, TextField, toast } from '@heroui/react'
import dayjs from 'dayjs'
import { motion } from 'motion/react'
import { useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbCheck, TbCopy, TbDownload, TbX } from 'react-icons/tb'

import { getSessionGeneration, subscribeSessionChanges } from '@shared/api/axios'
import { useGetRecap } from '@shared/api/hooks/system/system.query.hooks'
import { Logo } from '@shared/ui/logo'
import { prettifyBytesUtil } from '@shared/utils/bytes'
import { copyScreenshotToClipboard, downloadScreenshot } from '@shared/utils/copy-screenshot.util'

import { BG_STYLES, CARD_SECTIONS, MASKABLE_FIELDS, SWATCHES } from './recap.constants'
import classes from './recap.content.module.css'
import {
    createRecapExporter,
    createRecapPreferences,
    recapBackground,
    recapColorAlpha as alpha,
    recapColorHex,
    recapField,
    recapReducer,
    waitForRecapLayout,
    type RecapExportKind
} from './recap.model'

export function RecapContent({ signal }: { signal?: AbortSignal } = {}) {
    const { data: recap, isLoading, error, refetch, isFetching } = useGetRecap()
    const { t } = useTranslation()

    const [cardKey, setCardKey] = useState(0)
    const [{ sections, accent, maskedFields, customNote, bgStyle }, dispatch] = useReducer(
        recapReducer,
        undefined,
        createRecapPreferences
    )
    const [exporting, setExporting] = useState<RecapExportKind | null>(null)

    const ref = useRef<HTMLDivElement>(null)

    const exporter = useRef<ReturnType<typeof createRecapExporter> | null>(null)
    useEffect(() => {
        const session = getSessionGeneration()
        const filename = () => `remnawave-recap-${dayjs().format('YYYY-MM-DD')}.png`
        const controller = createRecapExporter({
            isCurrent: () => !signal?.aborted && getSessionGeneration() === session,
            getElement: () => ref.current,
            prepare: waitForRecapLayout,
            copy: (target, signal) => copyScreenshotToClipboard(target, filename(), signal),
            download: (element, signal) => downloadScreenshot(element, filename(), signal),
            onState: (kind) => {
                setExporting(kind)
                if (kind) setCardKey((key) => key + 1)
            },
            onError: (error) =>
                toast.danger('Recap export failed', {
                    description: error instanceof Error ? error.message : 'Could not export Recap'
                })
        })
        exporter.current = controller
        const abort = () => controller.dispose()
        signal?.addEventListener('abort', abort, { once: true })
        const unsubscribe = subscribeSessionChanges(() => controller.dispose())
        return () => {
            signal?.removeEventListener('abort', abort)
            unsubscribe()
            controller.dispose()
            exporter.current = null
        }
    }, [signal])

    if (isLoading) {
        return (
            <div className="flex min-h-72 items-center justify-center">
                <Spinner aria-label="Loading Recap" size="lg" />
            </div>
        )
    }
    if (!recap)
        return (
            <Alert role="alert" status="danger">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Recap unavailable</Alert.Title>
                    <Alert.Description>
                        {error?.message ?? 'No Recap data was returned.'}
                    </Alert.Description>
                    <Button
                        isDisabled={isFetching}
                        onPress={() => void refetch()}
                        size="sm"
                        variant="secondary"
                    >
                        {t('common.action.refresh')}
                    </Button>
                </Alert.Content>
            </Alert>
        )

    const gradientLine = {
        background: `linear-gradient(90deg, transparent, ${alpha(accent, 0.3)}, transparent)`
    }

    const formatInt = (value: number) => {
        return new Intl.NumberFormat('en', {
            notation: 'compact'
        }).format(value)
    }

    const bgOverlay = recapBackground(bgStyle, accent)
    const m = (field: MaskableField, value: number | string | undefined) =>
        recapField(maskedFields, field, value)

    return (
        <div className="flex flex-wrap items-center justify-center gap-4">
            <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
                <div className="flex w-[270px] shrink-0 flex-col gap-3">
                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>Sections</div>
                        <div className="flex flex-col gap-2">
                            {CARD_SECTIONS.map((s) => (
                                <Switch
                                    isSelected={sections.includes(s.value)}
                                    key={s.value}
                                    onChange={(selected) =>
                                        dispatch({ type: 'section', value: s.value, selected })
                                    }
                                    size="sm"
                                >
                                    <Switch.Content>
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch.Content>
                                    <Label>{s.label}</Label>
                                </Switch>
                            ))}
                        </div>
                    </div>

                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>Mask fields</div>
                        <div className="flex flex-wrap gap-1">
                            {MASKABLE_FIELDS.map((f) => {
                                const active = maskedFields.includes(f.value)
                                return (
                                    <Button
                                        aria-pressed={active}
                                        key={f.value}
                                        onPress={() => dispatch({ type: 'mask', value: f.value })}
                                        size="sm"
                                        variant={!active ? 'secondary' : 'tertiary'}
                                    >
                                        {!active ? (
                                            <TbCheck aria-hidden size={16} />
                                        ) : (
                                            <TbX aria-hidden size={16} />
                                        )}
                                        {f.label}
                                    </Button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>

            <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-[380px]"
                initial={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
                <div
                    className={classes.card}
                    key={cardKey}
                    ref={ref}
                    style={{ border: `3px solid ${alpha(accent, 0.3)}` }}
                >
                    {dayjs(recap.initDate).isBefore('2025-04-01') && (
                        <div className={classes.ribbon} style={{ background: accent }}>
                            Early Adopter
                        </div>
                    )}

                    <div
                        className={`${classes.glow} ${classes.glowTop}`}
                        style={{ background: accent }}
                    />
                    <div
                        className={`${classes.glow} ${classes.glowBottom}`}
                        style={{ background: accent }}
                    />

                    {bgOverlay && <div className={classes.bgOverlay} style={bgOverlay} />}

                    <div className={classes.brand}>
                        <Logo size={24} style={{ color: accent }} />
                        <span className={classes.brandName}>
                            <span style={{ color: accent }}>REMNA</span>WAVE
                        </span>
                    </div>

                    <div className={classes.hero}>
                        <div className={classes.heroValue} style={{ color: accent }}>
                            {m('totalUsers', formatInt(recap.total.users))}
                        </div>
                        <div className={classes.heroLabel}>total users</div>
                    </div>

                    {sections.includes('stats') && (
                        <div className={classes.statsRow}>
                            <div className={classes.stat}>
                                <div className={classes.statValue}>
                                    {m('nodes', formatInt(recap.total.nodes))}
                                </div>
                                <div className={classes.statLabel}>nodes</div>
                            </div>
                            <div className={classes.stat}>
                                <div className={classes.statValue}>
                                    {m(
                                        'totalTraffic',
                                        prettifyBytesUtil(recap.total.traffic, true)
                                    )}
                                </div>
                                <div className={classes.statLabel}>traffic</div>
                            </div>
                        </div>
                    )}

                    {sections.includes('month') && (
                        <>
                            <div className={classes.divider} style={gradientLine} />
                            <div className={classes.section}>
                                <div className={classes.sectionTitle}>
                                    {dayjs().format('MMMM YYYY')}
                                </div>
                                <div className={classes.monthGrid}>
                                    <div className={classes.monthItem}>
                                        <div className={classes.monthValue}>
                                            {m('monthUsers', formatInt(recap.thisMonth.users))}
                                        </div>
                                        <div className={classes.monthLabel}>new users</div>
                                    </div>
                                    <div className={classes.monthItem}>
                                        <div className={classes.monthValue}>
                                            {m(
                                                'monthTraffic',
                                                prettifyBytesUtil(recap.thisMonth.traffic)
                                            )}
                                        </div>
                                        <div className={classes.monthLabel}>traffic</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {sections.includes('infra') && (
                        <>
                            <div className={classes.divider} style={gradientLine} />
                            <div className={classes.section}>
                                <div className={classes.sectionTitle}>Infrastructure</div>
                                <div className={classes.infraGrid}>
                                    <div>
                                        <div className={classes.infraValue}>
                                            {m(
                                                'countries',
                                                formatInt(recap.total.distinctCountries)
                                            )}
                                        </div>
                                        <div className={classes.infraLabel}>countries</div>
                                    </div>
                                    <div>
                                        <div className={classes.infraValue}>
                                            {m('cpuCores', formatInt(recap.total.nodesCpuCores))}
                                        </div>
                                        <div className={classes.infraLabel}>CPU cores</div>
                                    </div>
                                    <div>
                                        <div className={classes.infraValue}>
                                            {m(
                                                'ram',
                                                prettifyBytesUtil(recap.total.nodesRam, true)
                                            )}
                                        </div>
                                        <div className={classes.infraLabel}>RAM</div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {sections.length > 0 && (
                        <div className={classes.divider} style={gradientLine} />
                    )}

                    {customNote && (
                        <div className={classes.customNote} style={{ color: accent }}>
                            {customNote}
                        </div>
                    )}

                    <div className={classes.footer}>
                        <span className={classes.since} style={{ color: accent }}>
                            Since {dayjs(recap.initDate).format('MMM D, YYYY')}
                        </span>
                        <span
                            className={classes.version}
                            style={{
                                background: alpha(accent, 0.1),
                                color: alpha(accent, 0.7)
                            }}
                        >
                            v{recap.version}
                        </span>
                    </div>
                </div>
            </motion.div>

            <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
                <div className="flex w-[270px] shrink-0 flex-col gap-3">
                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>Background</div>
                        <div className="flex flex-wrap gap-1">
                            {BG_STYLES.map((s) => (
                                <Button
                                    aria-pressed={bgStyle === s.value}
                                    key={s.value}
                                    onPress={() => dispatch({ type: 'background', value: s.value })}
                                    size="sm"
                                    variant={bgStyle === s.value ? 'secondary' : 'tertiary'}
                                >
                                    {s.label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>Custom note</div>
                        <TextField
                            aria-label="Custom note"
                            onChange={(value) => dispatch({ type: 'note', value })}
                            value={customNote}
                        >
                            <Input maxLength={40} placeholder="RW <3" />
                        </TextField>
                    </div>

                    <div className={classes.controlPanel}>
                        <div className={classes.controlLabel}>Accent color</div>
                        <input
                            aria-label="Accent color"
                            className="h-10 w-full cursor-pointer rounded-lg"
                            onChange={(event) =>
                                dispatch({ type: 'accent', value: event.currentTarget.value })
                            }
                            type="color"
                            value={recapColorHex(accent)}
                        />
                        <div className="mt-2 grid grid-cols-8 gap-1">
                            {SWATCHES.map((color) => (
                                <Button
                                    aria-label={`Accent ${color}`}
                                    aria-pressed={recapColorHex(accent) === recapColorHex(color)}
                                    className="size-6 min-w-0 rounded-full p-0"
                                    isIconOnly
                                    key={color}
                                    onPress={() => dispatch({ type: 'accent', value: color })}
                                    style={{ background: color }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            fullWidth
                            isDisabled={exporting !== null}
                            onPress={() => void exporter.current?.run('copy')}
                            size="sm"
                            variant="primary"
                        >
                            {exporting === 'copy' ? (
                                <Spinner aria-hidden size="sm" />
                            ) : (
                                <TbCopy aria-hidden size={14} />
                            )}
                            {t('common.action.copy')}
                        </Button>
                        <Button
                            fullWidth
                            isDisabled={exporting !== null}
                            onPress={() => void exporter.current?.run('download')}
                            size="sm"
                            variant="secondary"
                        >
                            {exporting === 'download' ? (
                                <Spinner aria-hidden size="sm" />
                            ) : (
                                <TbDownload aria-hidden size={14} />
                            )}
                            {t('common.action.download')}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
