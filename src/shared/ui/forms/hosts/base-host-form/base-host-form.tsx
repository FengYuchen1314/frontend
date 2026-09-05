import { DeleteHostFeature } from '@features/ui/dashboard/hosts/delete-host'
import { HostSelectInboundFeature } from '@features/ui/dashboard/hosts/host-select-inbound/host-select-inbound.feature'
import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Group,
    Popover,
    NumberInput,
    Radio,
    Stack,
    Text,
    TextInput
} from '@mantine/core'
import {
    CreateHostCommand,
    UpdateHostCommand,
    UpdateManyHostsCommand
} from '@remnawave/backend-contract'
import { INTERNAL_SQUADS_MODE, SECURITY_LAYERS } from '@remnawave/backend-contract'
import { type FormEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HiQuestionMarkCircle } from 'react-icons/hi'
import { PiArrowsLeftRight, PiFloppyDiskDuotone } from 'react-icons/pi'

import { DrawerFooter } from '@shared/ui/drawer-footer'
import { TemplateInfoPopoverShared } from '@shared/ui/popovers'
import { PopoverWithInfoShared } from '@shared/ui/popovers/popover-with-info'
import { SectionCard } from '@shared/ui/section-card'

import { HostVisibility } from './host-visibility'
import { IProps } from './interfaces'
import { getHostJsonFields } from './json-fields'
import {
    inferMieruMappingMode,
    isManagedMieruInbound,
    resolveMieruPortMapping,
    type MieruMappingMode
} from './mieru-port-mapping'
import {
    HostFormDataProvider,
    HostOptionsProvider,
    HostOptionsSection,
    IHostFormData
} from './options'

export const BaseHostForm = <
    T extends
        | CreateHostCommand.RequestBody
        | UpdateHostCommand.RequestBody
        | UpdateManyHostsCommand.RequestBody
>(
    props: IProps<T>
) => {
    const {
        form,
        handleSubmit,
        configProfiles,
        isSubmitting,
        nodes,
        internalSquads,
        isBulkEdit,
        subscriptionTemplates,
        hostTags,
        removeRequiredFields,
        hostUuid
    } = props

    const { i18n, t } = useTranslation()
    const internalSquadsMode = form.useWatchValue('internalSquads.mode')
    const inbound = form.useWatchValue('inbound') as T['inbound']
    const entryPort = form.useWatchValue('port')
    const selectedProfile = configProfiles.find(
        (profile) => profile.uuid === inbound?.configProfileUuid
    )
    const selectedInbound = selectedProfile?.inbounds.find(
        (item) => item.uuid === inbound?.configProfileInboundUuid
    )
    const selectedMieruInbound = isManagedMieruInbound(selectedInbound)
        ? selectedInbound
        : undefined
    const [mieruDraft, setMieruDraft] = useState<{
        mode: MieruMappingMode
        ixPort: number | string
    } | null>(null)
    const mappingMode =
        mieruDraft?.mode ?? inferMieruMappingMode(entryPort, selectedMieruInbound?.port)
    const manualIxPort = mieruDraft?.ixPort ?? selectedMieruInbound?.port ?? ''
    const mapping =
        selectedMieruInbound && !isBulkEdit
            ? resolveMieruPortMapping(
                  selectedProfile?.inbounds ?? [],
                  mappingMode,
                  entryPort,
                  manualIxPort
              )
            : null
    const mappingError =
        mapping && (!mapping.valid || mapping.inboundUuid !== selectedMieruInbound?.uuid)
            ? t(
                  `base-host-form.mieru-mapping-error-${mapping.valid ? 'not-configured' : mapping.error}`
              )
            : null

    const applyMieruMapping = (mode: MieruMappingMode, port: unknown, ixPort: number | string) => {
        setMieruDraft({ mode, ixPort })
        if (!selectedProfile || !selectedMieruInbound || isBulkEdit) return
        const result = resolveMieruPortMapping(selectedProfile.inbounds, mode, port, ixPort)
        if (result.valid && result.inboundUuid !== selectedMieruInbound.uuid) {
            form.setValues({
                inbound: {
                    configProfileUuid: selectedProfile.uuid,
                    configProfileInboundUuid: result.inboundUuid
                }
            } as Partial<T>)
            form.setTouched((current) => ({ ...current, 'inbound.configProfileInboundUuid': true }))
            form.setDirty((current) => ({ ...current, 'inbound.configProfileInboundUuid': true }))
        }
    }

    const handleMappingSubmit = (event: FormEvent<HTMLFormElement>) => {
        if (mappingError) {
            event.preventDefault()
            return
        }
        handleSubmit(event)
    }

    const isAllowOnlyInternalSquads = internalSquadsMode === INTERNAL_SQUADS_MODE.ALLOW_ONLY
    const { error: _internalSquadsModeError, ...internalSquadsModeProps } =
        form.getInputProps('internalSquads.mode')

    const hostJsonFields = useMemo(() => getHostJsonFields(t), [t])

    const securityLayerLabels = {
        [SECURITY_LAYERS.TLS]: t('base-host-form.tls-transport-layer-security'),
        [SECURITY_LAYERS.NONE]: t('base-host-form.none'),
        [SECURITY_LAYERS.DEFAULT]: t('base-host-form.inbounds-default')
    }

    const resolveSelectedRawInbound = () => {
        const { inbound } = form.getValues()

        if (!inbound?.configProfileUuid || !inbound.configProfileInboundUuid) {
            return undefined
        }

        return configProfiles
            ?.find((configProfile) => configProfile.uuid === inbound.configProfileUuid)
            ?.inbounds.find(
                (profileInbound) => profileInbound.uuid === inbound.configProfileInboundUuid
            )?.rawInbound
    }

    const isXhttpExtraButtonDisabled = () => {
        const { inbound } = form.getValues()

        if (!inbound) {
            return true
        }

        if (!configProfiles || !inbound.configProfileInboundUuid || !inbound.configProfileUuid) {
            return true
        }

        return !configProfiles.some(
            (configProfile) =>
                configProfile.uuid === inbound.configProfileUuid &&
                configProfile.inbounds.some((inbound) => inbound.network === 'xhttp')
        )
    }

    const saveInbound = (inboundUuid: string, configProfileUuid: string) => {
        const currentInbound = form.getValues().inbound
        if (
            currentInbound?.configProfileInboundUuid === inboundUuid &&
            currentInbound?.configProfileUuid === configProfileUuid
        )
            return
        const selected = configProfiles
            .find((profile) => profile.uuid === configProfileUuid)
            ?.inbounds.find((item) => item.uuid === inboundUuid)
        setMieruDraft(null)
        form.setValues({
            ...(!isBulkEdit ? { port: selected?.port ?? 0 } : {}),
            inbound: {
                configProfileInboundUuid: inboundUuid,
                configProfileUuid
            }
        } as Partial<T>)
        form.setTouched((current) => ({
            ...current,
            'inbound.configProfileInboundUuid': true,
            'inbound.configProfileUuid': true
        }))
        form.setDirty((current) => ({
            ...current,
            'inbound.configProfileInboundUuid': true,
            'inbound.configProfileUuid': true
        }))
    }

    const patternHoverCard = (showSingle = true, showMulti = true, showWildcard = true) => {
        return (
            <Popover shadow="md" width={300} withArrow>
                <Popover.Target>
                    <ActionIcon
                        aria-label={t('base-host-form.single-domain')}
                        color="gray"
                        size="xs"
                        variant="subtle"
                    >
                        <HiQuestionMarkCircle aria-hidden size={20} />
                    </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                    <Stack gap="md">
                        <Stack gap="sm">
                            {showSingle && (
                                <Stack gap={0}>
                                    <Text fw={600} mb={4} size="sm">
                                        {t('base-host-form.single-domain')}
                                    </Text>
                                    <Text c="dimmed" mb={6} size="xs">
                                        {t('base-host-form.default-mode-for-one-domain')}
                                    </Text>
                                    <Text c="blue" ff="monospace" size="xs">
                                        eu.node.com
                                    </Text>
                                </Stack>
                            )}

                            {showMulti && (
                                <Stack gap={0}>
                                    <Text fw={600} mb={4} size="sm">
                                        {t('base-host-form.multi-domain')}
                                    </Text>
                                    <Text c="dimmed" mb={6} size="xs">
                                        {t('base-host-form.multi-domain-description')}
                                    </Text>
                                    <Text c="blue" ff="monospace" size="xs">
                                        eu.node.com,us.node.com,au.node.com
                                    </Text>
                                </Stack>
                            )}

                            {showWildcard && (
                                <Stack gap={0}>
                                    <Text fw={600} mb={4} size="sm">
                                        {t('base-host-form.wildcard-domain')}
                                    </Text>
                                    <Text c="dimmed" mb={6} size="xs">
                                        {t('base-host-form.wildcard-domain-description')}
                                    </Text>
                                    <Text c="blue" ff="monospace" size="xs">
                                        *.node.com
                                    </Text>
                                </Stack>
                            )}
                        </Stack>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        )
    }

    const tagsInputProps = form.getInputProps('tags')
    const entryPortProps = form.getInputProps('port')

    const handleTagsChange = (value: string[]) => {
        tagsInputProps.onChange?.(value)

        form.setErrors((errors) =>
            Object.fromEntries(
                Object.entries(errors).filter(([key]) => key !== 'tags' && !key.startsWith('tags.'))
            )
        )
        form.validateField('tags')
    }

    const hostFormData: IHostFormData = {
        form,
        handleTagsChange,
        hostJsonFields,
        hostTags,
        internalSquads,
        internalSquadsModeProps,
        isAllowOnlyInternalSquads,
        isXhttpExtraButtonDisabled,
        language: i18n.language,
        nodes,
        patternHoverCard,
        resolveSelectedRawInbound,
        securityLayerLabels,
        subscriptionTemplates,
        tagsInputProps
    }

    return (
        <form onSubmit={handleMappingSubmit}>
            <HostFormDataProvider value={hostFormData}>
                <HostOptionsProvider form={form} isBulkEdit={isBulkEdit}>
                    <Stack>
                        <SectionCard.Root>
                            <SectionCard.Section>
                                <HostVisibility />
                            </SectionCard.Section>
                            <SectionCard.Section>
                                <Stack gap="md">
                                    <TextInput
                                        key={form.key('remark')}
                                        label={t('base-host-form.remark')}
                                        {...form.getInputProps('remark')}
                                        leftSection={<TemplateInfoPopoverShared />}
                                        required={!removeRequiredFields}
                                    />

                                    <Stack gap="xs">
                                        <HostSelectInboundFeature
                                            activeConfigProfileInbound={
                                                form.getValues().inbound
                                                    ?.configProfileInboundUuid ?? undefined
                                            }
                                            activeConfigProfileUuid={
                                                form.getValues().inbound?.configProfileUuid ??
                                                undefined
                                            }
                                            configProfiles={configProfiles}
                                            error={
                                                form.errors['inbound.configProfileUuid'] ??
                                                form.errors['inbound.configProfileInboundUuid'] ??
                                                null
                                            }
                                            onSaveInbound={saveInbound}
                                        />
                                    </Stack>

                                    {selectedMieruInbound && (
                                        <Alert
                                            color="blue"
                                            icon={<PiArrowsLeftRight size={18} />}
                                            title={t('base-host-form.mieru-entry-mapping-title')}
                                            variant="light"
                                        >
                                            <Text size="sm">
                                                {t(
                                                    'base-host-form.mieru-entry-mapping-description',
                                                    { ixPort: selectedMieruInbound.port }
                                                )}
                                            </Text>
                                        </Alert>
                                    )}

                                    <Group
                                        gap="xs"
                                        grow
                                        justify="space-between"
                                        preventGrowOverflow={false}
                                        w="100%"
                                    >
                                        <TextInput
                                            key={form.key('address')}
                                            label={t(
                                                selectedMieruInbound
                                                    ? 'base-host-form.mieru-domestic-entry-ip'
                                                    : 'common.field.address'
                                            )}
                                            leftSection={
                                                <PopoverWithInfoShared
                                                    text={
                                                        selectedMieruInbound ? (
                                                            t(
                                                                'base-host-form.mieru-domestic-entry-ip-description'
                                                            )
                                                        ) : (
                                                            <>
                                                                {t(
                                                                    'base-host-form.address-description-line-1'
                                                                )}
                                                                <br />
                                                                {t(
                                                                    'base-host-form.address-description-line-2'
                                                                )}
                                                            </>
                                                        )
                                                    }
                                                />
                                            }
                                            {...form.getInputProps('address')}
                                            placeholder="example.com"
                                            required={!removeRequiredFields}
                                            rightSection={patternHoverCard(true, true, true)}
                                            rightSectionPointerEvents="auto"
                                            w="65%"
                                        />

                                        <NumberInput
                                            key={form.key('port')}
                                            label={t(
                                                selectedMieruInbound
                                                    ? 'base-host-form.mieru-domestic-entry-port'
                                                    : 'common.field.port'
                                            )}
                                            {...entryPortProps}
                                            onChange={(value) => {
                                                entryPortProps.onChange?.(value)
                                                if (selectedMieruInbound && !isBulkEdit) {
                                                    applyMieruMapping(
                                                        mappingMode,
                                                        value,
                                                        manualIxPort
                                                    )
                                                }
                                            }}
                                            allowDecimal={false}
                                            allowNegative={false}
                                            clampBehavior="strict"
                                            decimalScale={0}
                                            hideControls
                                            leftSection={
                                                <PopoverWithInfoShared
                                                    text={
                                                        selectedMieruInbound ? (
                                                            t(
                                                                'base-host-form.mieru-domestic-entry-port-description',
                                                                {
                                                                    ixPort: selectedMieruInbound.port
                                                                }
                                                            )
                                                        ) : (
                                                            <>
                                                                {t(
                                                                    'base-host-form.port-description-line-1'
                                                                )}
                                                                <br />
                                                                <br />
                                                                {t(
                                                                    'base-host-form.port-description-line-2'
                                                                )}
                                                            </>
                                                        )
                                                    }
                                                />
                                            }
                                            max={65535}
                                            min={1}
                                            placeholder="443"
                                            required={!removeRequiredFields}
                                            w="30%"
                                        />
                                    </Group>
                                    {selectedMieruInbound && !isBulkEdit && (
                                        <Stack gap="sm">
                                            <Radio.Group
                                                label={t('base-host-form.mieru-mapping-mode')}
                                                value={mappingMode}
                                                onChange={(value) =>
                                                    applyMieruMapping(
                                                        value as MieruMappingMode,
                                                        entryPort,
                                                        manualIxPort
                                                    )
                                                }
                                            >
                                                <Stack gap="xs" mt="xs">
                                                    <Radio
                                                        value="ONE_TO_ONE"
                                                        label={t('base-host-form.mieru-one-to-one')}
                                                    />
                                                    <Radio
                                                        value="MANUAL"
                                                        label={t('base-host-form.mieru-manual-ix')}
                                                    />
                                                </Stack>
                                            </Radio.Group>
                                            {mappingMode === 'MANUAL' && (
                                                <>
                                                    <NumberInput
                                                        label={t('base-host-form.mieru-ix-port')}
                                                        value={manualIxPort}
                                                        onChange={(value) =>
                                                            applyMieruMapping(
                                                                'MANUAL',
                                                                entryPort,
                                                                value
                                                            )
                                                        }
                                                        min={1025}
                                                        max={65535}
                                                        clampBehavior="none"
                                                        allowDecimal={false}
                                                        allowNegative={false}
                                                        required
                                                    />
                                                    <Text size="sm" c="orange">
                                                        {t(
                                                            'base-host-form.mieru-forwarding-required',
                                                            { entryPort, ixPort: manualIxPort }
                                                        )}
                                                    </Text>
                                                </>
                                            )}
                                            {mappingError && (
                                                <Alert color="red">{mappingError}</Alert>
                                            )}
                                            <Text size="xs" c="dimmed">
                                                {t('base-host-form.mieru-listener-help')}
                                            </Text>
                                            <Anchor
                                                href={`/dashboard/management/config-profiles/${selectedProfile?.uuid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                size="sm"
                                            >
                                                {t('base-host-form.mieru-edit-listeners')}
                                            </Anchor>
                                        </Stack>
                                    )}
                                </Stack>
                            </SectionCard.Section>
                        </SectionCard.Root>

                        <HostOptionsSection />
                    </Stack>
                </HostOptionsProvider>
            </HostFormDataProvider>
            <DrawerFooter>
                <Group gap="xs" justify="space-between" w="100%">
                    <Group gap="xs">
                        <Button
                            color="teal"
                            disabled={!form.isDirty() || !form.isTouched() || !!mappingError}
                            leftSection={<PiFloppyDiskDuotone size="16px" />}
                            loading={isSubmitting}
                            size="md"
                            type="submit"
                            variant="soft"
                        >
                            {t('common.action.save')}
                        </Button>
                    </Group>

                    {!!hostUuid && <DeleteHostFeature hostUuid={hostUuid} />}
                </Group>
            </DrawerFooter>
        </form>
    )
}
