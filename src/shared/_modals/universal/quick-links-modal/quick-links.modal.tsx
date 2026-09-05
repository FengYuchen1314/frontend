import type { QuickLinksContext, QuickLinksDraft } from './quick-links.model'
import type { Dispatch, SetStateAction } from 'react'

import NiceModal, { useModal } from '@ebay/nice-modal-react'
import {
    Button,
    FieldError,
    Input,
    Label,
    ListBox,
    Modal,
    Popover,
    Select,
    Tabs,
    TextField
} from '@heroui/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    TbBolt,
    TbChevronDown,
    TbChevronUp,
    TbDeviceFloppy,
    TbGripVertical,
    TbPlus,
    TbTrash
} from 'react-icons/tb'

import { HeroModalPresence, useHeroModal } from '@shared/_modals/use-hero-modal'
import type { IQuickLauncherRoute, TQuickLink } from '@shared/ui/quick-launcher'
import {
    isSafeExternalUrl,
    MAX_QUICK_LABEL,
    MAX_QUICK_LINKS,
    QUICK_ICON_NAMES,
    QUICK_ICONS,
    QUICK_MODAL_IDS,
    QUICK_MODALS
} from '@shared/ui/quick-launcher'
import {
    isLauncherLinkAvailable,
    quickLinkKey
} from '@shared/ui/quick-launcher/quick-launcher.model'

import {
    useExperimentalFeatures,
    useQuickLinks,
    useViewPreferencesStoreActions
} from '@entities/dashboard/view-preferences-store'

import {
    addQuickLink,
    createQuickLinksDraft,
    moveQuickLink,
    pendingQuickLink,
    removeQuickLink,
    saveQuickLinksDraft,
    searchQuickLinkRoutes,
    switchQuickLinkKind,
    syncQuickLinksDraft,
    visibleQuickLinks
} from './quick-links.model'

interface IProps {
    routes: IQuickLauncherRoute[]
}

export function QuickLinksEditor({
    draft,
    setDraft,
    context,
    onSave,
    onCancel
}: {
    draft: QuickLinksDraft
    setDraft: Dispatch<SetStateAction<QuickLinksDraft>>
    context: QuickLinksContext
    onSave: () => void
    onCancel: () => void
}) {
    const { t } = useTranslation()
    const dragSource = useRef<TQuickLink | null>(null)
    const [iconsOpen, setIconsOpen] = useState(false)
    const rows = visibleQuickLinks(draft, context)
    const modalOptions = QUICK_MODAL_IDS.filter(
        (id) =>
            isLauncherLinkAvailable(
                { kind: 'modal', id },
                context.routes,
                context.flags,
                context.modals
            ) && !draft.links.some((link) => link.kind === 'modal' && link.id === id)
    )
    const routeOptions = context.routes.filter(
        (route) => !draft.links.some((link) => link.kind === 'route' && link.path === route.href)
    )
    const filteredRoutes = routeOptions.filter((route) =>
        (route.name + ' ' + route.href)
            .toLocaleLowerCase()
            .includes(draft.routeSearch.toLocaleLowerCase())
    )
    const PreviewIcon = QUICK_ICONS[draft.icon]
    const invalidUrl = draft.url.length > 0 && !isSafeExternalUrl(draft.url.trim())
    const usedKeys = new Map<string, number>()
    return (
        <div className="flex min-h-0 flex-col gap-4">
            <Tabs
                selectedKey={draft.kind}
                onSelectionChange={(key) => {
                    if (key === 'modal' || key === 'route' || key === 'external') {
                        setDraft((current) => switchQuickLinkKind(current, key))
                        setIconsOpen(false)
                    }
                }}
            >
                <Tabs.ListContainer>
                    <Tabs.List aria-label="Quick link type">
                        <Tabs.Tab id="modal">
                            Modals
                            <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="route">
                            Routes
                            <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="external">
                            External
                            <Tabs.Indicator />
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs.ListContainer>
                <Tabs.Panel className="pt-3" id="modal">
                    <Select
                        value={draft.modalId}
                        onChange={(value) =>
                            setDraft((current) => ({
                                ...current,
                                modalId: QUICK_MODAL_IDS.find((id) => id === value) ?? null
                            }))
                        }
                    >
                        <Label>{t('common.action.select')}</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox aria-label="Modals">
                                {modalOptions.map((id) => (
                                    <ListBox.Item
                                        id={id}
                                        key={id}
                                        textValue={t(context.modals[id].labelKey)}
                                    >
                                        {t(context.modals[id].labelKey)}
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </Tabs.Panel>
                <Tabs.Panel className="flex flex-col gap-3 pt-3" id="route">
                    <TextField
                        value={draft.routeSearch}
                        onChange={(routeSearch) =>
                            setDraft((current) => searchQuickLinkRoutes(current, routeSearch))
                        }
                    >
                        <Label>{t('common.action.search')}</Label>
                        <Input type="search" />
                    </TextField>
                    <Select
                        value={draft.routePath}
                        onChange={(value) =>
                            setDraft((current) => ({
                                ...current,
                                routePath: typeof value === 'string' ? value : null
                            }))
                        }
                    >
                        <Label>Routes</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox aria-label="Routes">
                                {filteredRoutes.map((route) => (
                                    <ListBox.Item
                                        id={route.href}
                                        key={route.href}
                                        textValue={route.name}
                                    >
                                        {route.name}
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </Tabs.Panel>
                <Tabs.Panel className="flex flex-col gap-3 pt-3" id="external">
                    <div className="flex items-end gap-2">
                        <Popover isOpen={iconsOpen} onOpenChange={setIconsOpen}>
                            <Button
                                aria-label="Choose quick link icon"
                                isIconOnly
                                variant="secondary"
                            >
                                <PreviewIcon size={18} />
                            </Button>
                            <Popover.Content>
                                <Popover.Dialog aria-label="Quick link icons">
                                    <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto p-2">
                                        {QUICK_ICON_NAMES.map((name) => {
                                            const Icon = QUICK_ICONS[name]
                                            return (
                                                <Button
                                                    aria-label={name}
                                                    aria-pressed={draft.icon === name}
                                                    isIconOnly
                                                    key={name}
                                                    onPress={() => {
                                                        setDraft((current) => ({
                                                            ...current,
                                                            icon: name
                                                        }))
                                                        setIconsOpen(false)
                                                    }}
                                                    size="sm"
                                                    variant={
                                                        draft.icon === name ? 'secondary' : 'ghost'
                                                    }
                                                >
                                                    <Icon size={18} />
                                                </Button>
                                            )
                                        })}
                                    </div>
                                </Popover.Dialog>
                            </Popover.Content>
                        </Popover>
                        <TextField
                            className="min-w-0 flex-1"
                            value={draft.label}
                            onChange={(label) => setDraft((current) => ({ ...current, label }))}
                        >
                            <Label>{t('common.field.name')}</Label>
                            <Input maxLength={MAX_QUICK_LABEL} />
                        </TextField>
                    </div>
                    <TextField
                        isInvalid={invalidUrl}
                        validationBehavior="aria"
                        value={draft.url}
                        onChange={(url) => setDraft((current) => ({ ...current, url }))}
                    >
                        <Label>HTTPS URL</Label>
                        <Input placeholder="https://example.com" type="url" />
                        <FieldError>
                            Only https:// links without embedded credentials are allowed.
                        </FieldError>
                    </TextField>
                </Tabs.Panel>
            </Tabs>
            <div className="flex items-center justify-between gap-2">
                <p aria-live="polite" className="text-sm text-muted">
                    {draft.links.length} / {MAX_QUICK_LINKS}
                </p>
                <Button
                    isDisabled={!pendingQuickLink(draft, context)}
                    onPress={() => setDraft((current) => addQuickLink(current, context))}
                    size="sm"
                    variant="secondary"
                >
                    <TbPlus size={18} />
                    {t('common.action.add')}
                </Button>
            </div>
            <ul
                aria-label="Quick links"
                className="flex max-h-64 min-h-20 flex-col gap-2 overflow-y-auto"
            >
                {rows.length === 0 && (
                    <li className="flex justify-center rounded-xl border border-border p-6 text-muted">
                        <TbBolt aria-label="No quick links" size={36} />
                    </li>
                )}
                {rows.map(({ link, index }, rowIndex) => {
                    const route =
                        link.kind === 'route'
                            ? context.routes.find((entry) => entry.href === link.path)
                            : null
                    const Icon =
                        link.kind === 'modal'
                            ? context.modals[link.id].Icon
                            : link.kind === 'external'
                              ? QUICK_ICONS[link.icon]
                              : (route?.icon ?? TbBolt)
                    const label =
                        link.kind === 'modal'
                            ? t(context.modals[link.id].labelKey)
                            : link.kind === 'external'
                              ? link.label
                              : (route?.name ?? link.path)
                    const description =
                        link.kind === 'modal'
                            ? 'Modals'
                            : link.kind === 'external'
                              ? link.url
                              : link.path
                    const identity = quickLinkKey(link)
                    const occurrence = usedKeys.get(identity) ?? 0
                    usedKeys.set(identity, occurrence + 1)
                    return (
                        <li
                            className="flex items-center gap-2 rounded-xl border border-border p-2"
                            key={identity + ':' + occurrence}
                            onDragOver={(event) => {
                                if (dragSource.current) {
                                    event.preventDefault()
                                    event.dataTransfer.dropEffect = 'move'
                                }
                            }}
                            onDrop={(event) => {
                                event.preventDefault()
                                const source = dragSource.current
                                dragSource.current = null
                                if (!source) return
                                setDraft((current) => {
                                    const visible = visibleQuickLinks(current, context)
                                    return moveQuickLink(
                                        current,
                                        visible.findIndex((row) => row.link === source),
                                        visible.findIndex((row) => row.link === link),
                                        context
                                    )
                                })
                            }}
                        >
                            <button
                                aria-label={'Drag ' + label}
                                className="cursor-grab rounded p-1 text-muted focus-visible:outline-2 focus-visible:outline-accent"
                                draggable
                                onDragStart={(event) => {
                                    dragSource.current = link
                                    event.dataTransfer.effectAllowed = 'move'
                                    event.dataTransfer.setData('text/plain', identity)
                                }}
                                onDragEnd={() => {
                                    dragSource.current = null
                                }}
                                tabIndex={-1}
                                type="button"
                            >
                                <TbGripVertical size={16} />
                            </button>
                            <Icon size={18} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{label}</p>
                                <p className="truncate text-xs text-muted">{description}</p>
                            </div>
                            <Button
                                aria-label={'Move up: ' + label}
                                isDisabled={rowIndex === 0}
                                isIconOnly
                                onPress={() =>
                                    setDraft((current) =>
                                        moveQuickLink(current, rowIndex, rowIndex - 1, context)
                                    )
                                }
                                size="sm"
                                variant="ghost"
                            >
                                <TbChevronUp size={16} />
                            </Button>
                            <Button
                                aria-label={'Move down: ' + label}
                                isDisabled={rowIndex === rows.length - 1}
                                isIconOnly
                                onPress={() =>
                                    setDraft((current) =>
                                        moveQuickLink(current, rowIndex, rowIndex + 1, context)
                                    )
                                }
                                size="sm"
                                variant="ghost"
                            >
                                <TbChevronDown size={16} />
                            </Button>
                            <Button
                                aria-label={t('common.action.delete') + ': ' + label}
                                isIconOnly
                                onPress={() =>
                                    setDraft((current) => removeQuickLink(current, index))
                                }
                                size="sm"
                                variant="ghost"
                            >
                                <TbTrash className="text-danger" size={16} />
                            </Button>
                        </li>
                    )
                })}
            </ul>
            {draft.error && (
                <p className="text-sm text-danger" role="alert">
                    {draft.error}
                </p>
            )}
            <div className="flex justify-end gap-2">
                <Button onPress={onCancel} variant="secondary">
                    {t('common.action.cancel')}
                </Button>
                <Button onPress={onSave}>
                    <TbDeviceFloppy size={18} />
                    {t('common.action.save')}
                </Button>
            </div>
        </div>
    )
}

export const QuickLinksModalShared = NiceModal.create(({ routes }: IProps) => {
    const { t } = useTranslation()
    const niceModal = useModal()
    const modal = useHeroModal({ modal: niceModal })
    const storedLinks = useQuickLinks()
    const flags = useExperimentalFeatures()
    const { setQuickLinks } = useViewPreferencesStoreActions()
    const [state, setDraft] = useState(() =>
        createQuickLinksDraft(storedLinks, modal.isOpen, niceModal.args)
    )
    const draft = syncQuickLinksDraft(state, storedLinks, modal.isOpen, niceModal.args)
    if (draft !== state) setDraft(draft)
    const context = { routes, flags, modals: QUICK_MODALS }
    const save = () => {
        const lease = modal.capture()
        if (!lease.isCurrent()) return
        const result = saveQuickLinksDraft(draft, setQuickLinks, modal.close)
        if (result !== draft) setDraft(result)
    }
    return (
        <Modal isOpen={modal.isOpen} onOpenChange={modal.onOpenChange}>
            <Modal.Backdrop>
                <HeroModalPresence onExitComplete={modal.afterClose} />
                <Modal.Container scroll="inside" size="lg">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="flex items-center gap-2">
                                <TbBolt aria-hidden="true" />
                                {t('constants.quick-launcher')}
                            </Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <QuickLinksEditor
                                context={context}
                                draft={draft}
                                onCancel={modal.close}
                                onSave={save}
                                setDraft={setDraft}
                            />
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
})
