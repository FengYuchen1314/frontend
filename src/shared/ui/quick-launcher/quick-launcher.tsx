import type { ILauncherPosition, IQuickLauncherRoute } from './quick-links.types'
import type { CSSProperties, PointerEvent } from 'react'

import { Button } from '@heroui/react'
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { TbArrowsMove, TbGripHorizontal, TbPlus, TbSettings } from 'react-icons/tb'
import { useNavigate } from 'react-router'

import { showModal } from '@shared/_modals/show-modal'
import { registerScrollLockShard } from '@shared/utils/scroll-lock-shards'

import {
    useExperimentalFeature,
    useExperimentalFeatures,
    useLauncherColumns,
    useLauncherPosition,
    useQuickLinks,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

import {
    clampLauncherPosition,
    createLauncherGesture,
    isLauncherLinkAvailable,
    launcherColumns,
    LAUNCHER_CELL_SIZE,
    LAUNCHER_HEADER_HEIGHT,
    LAUNCHER_HOLD_DELAY,
    LAUNCHER_OFFSET,
    observeLauncherPointerEnd,
    quickLinkKey,
    resizeLauncherColumns,
    runLauncherLink
} from './quick-launcher.model'
import { QUICK_ICONS, QUICK_MODALS } from './quick-links.catalog'
import { MAX_QUICK_COLUMNS } from './quick-links.types'
import classes from './QuickLauncher.module.css'

interface IProps {
    routes: IQuickLauncherRoute[]
}

const subscribeViewport = (notify: () => void) => {
    window.addEventListener('resize', notify)
    return () => window.removeEventListener('resize', notify)
}
const viewportSnapshot = () => `${window.innerWidth}:${window.innerHeight}`
const serverViewport = () => '1024:768'

export const QuickLauncher = ({ routes }: IProps) => {
    const enabled = useExperimentalFeature('quickLauncher')
    return enabled ? <QuickLauncherWindow routes={routes} /> : null
}

export const QuickLauncherWindow = ({ routes }: IProps) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const experimental = useExperimentalFeatures()
    const storedPosition = useLauncherPosition()
    const storedColumns = useLauncherColumns()
    const links = useQuickLinks()
    const { setLauncherColumns, setLauncherPosition } = useViewPreferencesStoreActions()
    const [viewportWidth, viewportHeight] = useSyncExternalStore(
        subscribeViewport,
        viewportSnapshot,
        serverViewport
    )
        .split(':')
        .map(Number)
    const [gesture] = useState(createLauncherGesture)
    const [isHeaderVisible, setIsHeaderVisible] = useState(false)
    const [isGrabbing, setIsGrabbing] = useState(false)
    const nodeRef = useRef<HTMLElement | null>(null)
    const positionRef = useRef<ILauncherPosition | null>(null)
    const lastStoredPosition = useRef(storedPosition)
    const pendingShift = useRef(0)
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const resolved = links.filter((link) =>
        isLauncherLinkAvailable(link, routes, experimental, QUICK_MODALS)
    )
    const columns = launcherColumns(storedColumns, resolved.length, viewportWidth)
    const showHeader = isHeaderVisible || resolved.length === 0

    const registerShard = useCallback((node: HTMLElement | null) => {
        nodeRef.current = node
        return node ? registerScrollLockShard(node) : undefined
    }, [])
    const place = useCallback((position: ILauncherPosition) => {
        const node = nodeRef.current
        if (!node) return
        const next = clampLauncherPosition(position, node.getBoundingClientRect(), {
            width: window.innerWidth,
            height: window.innerHeight
        })
        node.style.left = `${next.x}px`
        node.style.top = `${next.y}px`
        node.style.bottom = 'auto'
        positionRef.current = next
    }, [])
    useLayoutEffect(() => {
        const node = nodeRef.current
        if (!node) return
        const changed = lastStoredPosition.current !== storedPosition
        lastStoredPosition.current = storedPosition
        const position = (changed ? storedPosition : positionRef.current) ??
            storedPosition ?? {
                x: LAUNCHER_OFFSET,
                y: viewportHeight - node.getBoundingClientRect().height - LAUNCHER_OFFSET
            }
        place({ x: position.x, y: position.y + pendingShift.current })
        pendingShift.current = 0
    }, [storedPosition, columns, showHeader, viewportWidth, viewportHeight, place])
    useEffect(() => {
        const node = nodeRef.current
        if (!node) return
        const observer = new ResizeObserver(() => {
            if (positionRef.current) place(positionRef.current)
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [place])
    useEffect(() => {
        const stopObserving = observeLauncherPointerEnd(window, gesture, () => {
            if (holdTimer.current !== null) clearTimeout(holdTimer.current)
            holdTimer.current = null
            setIsGrabbing(false)
        })
        return () => {
            stopObserving()
            if (holdTimer.current !== null) clearTimeout(holdTimer.current)
            if (clickTimer.current !== null) clearTimeout(clickTimer.current)
            gesture.cancel()
        }
    }, [gesture])

    const cancelHold = () => {
        if (holdTimer.current !== null) clearTimeout(holdTimer.current)
        holdTimer.current = null
    }
    const toggleHeader = () => {
        pendingShift.current =
            resolved.length === 0
                ? 0
                : isHeaderVisible
                  ? LAUNCHER_HEADER_HEIGHT
                  : -LAUNCHER_HEADER_HEIGHT
        setIsHeaderVisible(!isHeaderVisible)
    }
    const openEditor = () => {
        void showModal('quickLinksModal', { routes })
    }
    const cancelPointer = (event: PointerEvent<HTMLElement>) => {
        // Normal release fires lostpointercapture after finish; keep its click suppression.
        if (!gesture.hasPointer(event.pointerId)) return
        cancelHold()
        gesture.cancel()
        setIsGrabbing(false)
    }
    const pointerDown = (event: PointerEvent<HTMLElement>) => {
        if (
            event.button !== 0 ||
            !(event.target instanceof Element) ||
            event.target.closest('[data-launcher-settings], [data-launcher-resizer]')
        )
            return
        const node = event.currentTarget
        const rect = node.getBoundingClientRect()
        const immediate = Boolean(event.target.closest('[data-launcher-handle]'))
        if (
            !gesture.begin(
                event.pointerId,
                event.clientX,
                event.clientY,
                { x: rect.left, y: rect.top },
                immediate
            )
        )
            return
        if (clickTimer.current !== null) clearTimeout(clickTimer.current)
        if (immediate) {
            node.setPointerCapture(event.pointerId)
            setIsGrabbing(true)
        } else {
            holdTimer.current = setTimeout(() => {
                holdTimer.current = null
                if (!gesture.activate(event.pointerId)) return
                node.setPointerCapture(event.pointerId)
                setIsGrabbing(true)
            }, LAUNCHER_HOLD_DELAY)
        }
    }
    const pointerUp = (event: PointerEvent<HTMLElement>) => {
        if (!gesture.hasPointer(event.pointerId)) return
        cancelHold()
        const dragged = gesture.finish(event.pointerId)
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
        setIsGrabbing(false)
        if (dragged) {
            if (positionRef.current) setLauncherPosition(positionRef.current)
            clickTimer.current = setTimeout(() => gesture.clearSuppressedClick(), 0)
        }
    }
    const usedKeys = new Map<string, number>()
    const content = (
        <section
            aria-label={t('constants.quick-launcher')}
            className={classes.window}
            onContextMenu={(event) => {
                event.preventDefault()
                toggleHeader()
            }}
            onKeyDown={(event) => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                    event.preventDefault()
                    toggleHeader()
                }
            }}
            onLostPointerCapture={cancelPointer}
            onPointerCancel={cancelPointer}
            onPointerDown={pointerDown}
            onPointerMove={(event) => {
                const position = gesture.move(
                    event.pointerId,
                    event.clientX,
                    event.clientY,
                    event.currentTarget.getBoundingClientRect(),
                    { width: window.innerWidth, height: window.innerHeight }
                )
                if (position) place(position)
            }}
            onPointerUp={pointerUp}
            ref={registerShard}
            style={
                {
                    '--cell': `${LAUNCHER_CELL_SIZE}px`,
                    '--columns': columns,
                    '--header-height': `${LAUNCHER_HEADER_HEIGHT}px`,
                    left: storedPosition?.x ?? LAUNCHER_OFFSET,
                    top: storedPosition?.y,
                    bottom: storedPosition ? undefined : LAUNCHER_OFFSET
                } as CSSProperties
            }
        >
            {isGrabbing && (
                <div className={classes.grabOverlay}>
                    <TbArrowsMove size={22} />
                </div>
            )}
            {showHeader && (
                <>
                    <div className={classes.header}>
                        <Button
                            aria-label="Move quick launcher (arrow keys)"
                            className={classes.handle}
                            data-launcher-handle
                            isIconOnly
                            onKeyDown={(event) => {
                                const directions: Record<string, [number, number]> = {
                                    ArrowLeft: [-1, 0],
                                    ArrowRight: [1, 0],
                                    ArrowUp: [0, -1],
                                    ArrowDown: [0, 1]
                                }
                                const direction = directions[event.key]
                                if (!direction || !positionRef.current) return
                                event.preventDefault()
                                const step = event.shiftKey ? 5 : 20
                                place({
                                    x: positionRef.current.x + direction[0] * step,
                                    y: positionRef.current.y + direction[1] * step
                                })
                                if (positionRef.current) setLauncherPosition(positionRef.current)
                            }}
                            variant="ghost"
                        >
                            <TbGripHorizontal size={16} />
                        </Button>
                        <Button
                            aria-label={t('constants.quick-launcher')}
                            className={classes.settings}
                            data-launcher-settings
                            isIconOnly
                            onPress={openEditor}
                            variant="ghost"
                        >
                            <TbSettings size={13} />
                        </Button>
                    </div>
                    <div
                        aria-label="Quick launcher columns"
                        aria-valuemax={MAX_QUICK_COLUMNS}
                        aria-valuemin={1}
                        aria-valuenow={columns}
                        className={classes.resizer}
                        data-launcher-resizer
                        role="slider"
                        tabIndex={0}
                        onKeyDown={(event) => {
                            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                            event.preventDefault()
                            setLauncherColumns(
                                Math.min(
                                    MAX_QUICK_COLUMNS,
                                    Math.max(1, columns + (event.key === 'ArrowRight' ? 1 : -1))
                                )
                            )
                        }}
                        onPointerDown={(event) => {
                            event.stopPropagation()
                            if (event.button === 0)
                                event.currentTarget.setPointerCapture(event.pointerId)
                        }}
                        onPointerMove={(event) => {
                            event.stopPropagation()
                            if (
                                !event.currentTarget.hasPointerCapture(event.pointerId) ||
                                !nodeRef.current
                            )
                                return
                            setLauncherColumns(
                                resizeLauncherColumns(
                                    event.clientX,
                                    nodeRef.current.getBoundingClientRect().left,
                                    window.innerWidth
                                )
                            )
                        }}
                        onPointerUp={(event) => {
                            event.stopPropagation()
                            if (event.currentTarget.hasPointerCapture(event.pointerId))
                                event.currentTarget.releasePointerCapture(event.pointerId)
                        }}
                    />
                </>
            )}
            {resolved.length === 0 ? (
                <Button
                    aria-label={t('common.action.add')}
                    className={classes.empty}
                    isIconOnly
                    onPress={() => {
                        if (!gesture.shouldSuppressClick()) openEditor()
                    }}
                    variant="ghost"
                >
                    <TbPlus size={20} />
                </Button>
            ) : (
                <div className={classes.grid}>
                    {resolved.map((link) => {
                        const identity = quickLinkKey(link)
                        const occurrence = usedKeys.get(identity) ?? 0
                        usedKeys.set(identity, occurrence + 1)
                        const route =
                            link.kind === 'route'
                                ? routes.find((item) => item.href === link.path)
                                : undefined
                        const Icon =
                            link.kind === 'modal'
                                ? QUICK_MODALS[link.id].Icon
                                : link.kind === 'external'
                                  ? QUICK_ICONS[link.icon]
                                  : route!.icon
                        const label =
                            link.kind === 'modal'
                                ? t(QUICK_MODALS[link.id].labelKey)
                                : link.kind === 'external'
                                  ? link.label
                                  : route!.name
                        return (
                            <Button
                                aria-label={label}
                                className={classes.item}
                                isIconOnly
                                key={`${identity}:${occurrence}`}
                                onPress={() => {
                                    if (!gesture.shouldSuppressClick())
                                        runLauncherLink(
                                            link,
                                            routes,
                                            experimental,
                                            QUICK_MODALS,
                                            navigate,
                                            (url, target, features) => {
                                                window.open(url, target, features)
                                            }
                                        )
                                }}
                                variant="ghost"
                            >
                                <Icon size={20} />
                            </Button>
                        )
                    })}
                </div>
            )}
        </section>
    )
    return typeof document === 'undefined' ? content : createPortal(content, document.body)
}
