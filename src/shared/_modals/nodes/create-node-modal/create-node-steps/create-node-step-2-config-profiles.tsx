import { ShowConfigProfilesWithInboundsFeature } from '@features/ui/dashboard/nodes/show-config-profiles-with-inbounds'
import { Alert, Button, Group, Skeleton, Stack, Text } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateNodeCommand, SERVER_TYPES, TNodeCreationMode } from '@remnawave/backend-contract'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiArrowLeft } from 'react-icons/pi'
import { SiSecurityscorecard } from 'react-icons/si'
import { TbAlertTriangle, TbCheck, TbInfoCircle } from 'react-icons/tb'

import { useGetConfigProfiles } from '@shared/api/hooks'
import {
    isManagedProtocolCreationInboundForServerType,
    shouldRestrictNodeCreationToManagedProtocols
} from '@shared/constants'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

import { CopyDockerComposeWidget } from './copy-docker-compose.widget'

interface IProps {
    // oxlint-disable-next-line
    form: UseFormReturnType<CreateNodeCommand.RequestBody, any>
    creationMode: TNodeCreationMode
    isCreating: boolean
    onCreateNode: () => void
    onPrev: () => void
    port: number
}

export const CreateNodeStep2ConfigProfiles = ({
    creationMode,
    form,
    isCreating,
    onCreateNode,
    onPrev,
    port
}: IProps) => {
    const { t } = useTranslation()
    const [generatedBootstrapKey, setGeneratedBootstrapKey] = useState<string>()
    const isManagedCreation = shouldRestrictNodeCreationToManagedProtocols(creationMode)

    const { data: configProfiles, isLoading: isConfigProfilesLoading } = useGetConfigProfiles()
    const serverType = form.getValues().serverType ?? SERVER_TYPES.PUBLIC_DIRECT
    const bootstrapKey = `${serverType}-${port}`
    const isBootstrapGenerated = generatedBootstrapKey === bootstrapKey
    const isBroadbandLanding = isManagedCreation && serverType === SERVER_TYPES.BROADBAND_LANDING
    const isLeasedLine = isManagedCreation && serverType === SERVER_TYPES.LEASED_LINE
    const selectedInboundUuids = new Set(form.getValues().configProfile?.activeInbounds ?? [])
    const isSocksSelected = (configProfiles?.configProfiles ?? []).some((profile) =>
        profile.inbounds.some(
            (inbound) =>
                selectedInboundUuids.has(inbound.uuid) && inbound.type.toLowerCase() === 'socks'
        )
    )

    const compatibleInboundUuids = useMemo(() => {
        if (!isManagedCreation) {
            return new Set(
                (configProfiles?.configProfiles ?? []).flatMap((profile) =>
                    profile.inbounds.map((inbound) => inbound.uuid)
                )
            )
        }

        return new Set(
            (configProfiles?.configProfiles ?? []).flatMap((profile) =>
                profile.inbounds
                    .filter((inbound) =>
                        isManagedProtocolCreationInboundForServerType(inbound, serverType)
                    )
                    .map((inbound) => inbound.uuid)
            )
        )
    }, [configProfiles, isManagedCreation, serverType])

    useEffect(() => {
        const selectedInbounds = form.getValues().configProfile?.activeInbounds ?? []
        if (selectedInbounds.some((uuid) => !compatibleInboundUuids.has(uuid))) {
            form.setValues({
                configProfile: {
                    activeConfigProfileUuid: '',
                    activeInbounds: []
                }
            })
        }
    }, [compatibleInboundUuids, form])

    const saveInbounds = (inbounds: string[], configProfileUuid: string) => {
        form.setValues({
            configProfile: {
                activeInbounds: inbounds,
                activeConfigProfileUuid: configProfileUuid
            }
        })
        form.setTouched({
            activeConfigProfileUuid: true,
            activeInbounds: true
        })
        form.setDirty({
            activeConfigProfileUuid: true,
            activeInbounds: true
        })
    }

    const handleCreateNode = () => {
        const configProfileErrors = form.validateField('configProfile')
        const activeConfigProfileUuidErrors = form.validateField(
            'configProfile.activeConfigProfileUuid'
        )
        const activeInboundsErrors = form.validateField('configProfile.activeInbounds')

        if (
            !configProfileErrors.hasError &&
            !activeConfigProfileUuidErrors.hasError &&
            !activeInboundsErrors.hasError
        ) {
            onCreateNode()
        }
    }

    return (
        <Stack gap="xl" mih={400}>
            <SectionCard.Root>
                <SectionCard.Section>
                    <BaseOverlayHeader
                        iconColor="teal"
                        IconComponent={SiSecurityscorecard}
                        iconVariant="soft"
                        title={t('base-node-form.core-configuration')}
                        titleOrder={5}
                    />
                </SectionCard.Section>
                <SectionCard.Section>
                    {isConfigProfilesLoading && (
                        <Stack gap="md">
                            <Skeleton height={24} width="40%" />
                            <Skeleton height={16} width="60%" />
                            <Skeleton height={76} radius="md" />
                            <Skeleton height={25} radius="sm" width="100%" />
                        </Stack>
                    )}

                    {!isConfigProfilesLoading && configProfiles && (
                        <>
                            {isLeasedLine && (
                                <Alert
                                    color="blue"
                                    icon={<TbInfoCircle size={18} />}
                                    mb="md"
                                    title={t('create-node-modal.widget.mieru-only-title')}
                                    variant="light"
                                >
                                    <Text size="sm">
                                        {t('create-node-modal.widget.mieru-only-description')}
                                    </Text>
                                </Alert>
                            )}

                            {!isManagedCreation && (
                                <Alert
                                    color="blue"
                                    icon={<TbInfoCircle size={18} />}
                                    mb="md"
                                    title={t('create-node-modal.widget.external-import-title')}
                                    variant="light"
                                >
                                    <Text size="sm">
                                        {t('create-node-modal.widget.external-import-description')}
                                    </Text>
                                </Alert>
                            )}

                            <ShowConfigProfilesWithInboundsFeature
                                activeConfigProfileInbounds={
                                    form.getValues().configProfile?.activeInbounds ?? []
                                }
                                activeConfigProfileUuid={
                                    form.getValues().configProfile?.activeConfigProfileUuid
                                }
                                configProfiles={configProfiles.configProfiles}
                                errors={form.errors.configProfile}
                                managedProtocolCreationOnly={isManagedCreation}
                                onSaveInbounds={saveInbounds}
                                serverType={isManagedCreation ? serverType : undefined}
                            />

                            {isManagedCreation && (isBroadbandLanding || isSocksSelected) && (
                                <Alert
                                    color={isBroadbandLanding ? 'orange' : 'red'}
                                    icon={<TbAlertTriangle size={18} />}
                                    mt="md"
                                    title={t(
                                        isBroadbandLanding
                                            ? 'create-node-modal.widget.socks5-warning-title'
                                            : 'create-node-modal.widget.socks5-public-direct-warning-title'
                                    )}
                                    variant="light"
                                >
                                    <Text size="sm">
                                        {t(
                                            isBroadbandLanding
                                                ? 'create-node-modal.widget.socks5-warning-description'
                                                : 'create-node-modal.widget.socks5-public-direct-warning-description'
                                        )}
                                    </Text>
                                </Alert>
                            )}
                        </>
                    )}
                </SectionCard.Section>
            </SectionCard.Root>

            <Stack gap="xs" mt="auto">
                {isManagedCreation && (
                    <CopyDockerComposeWidget
                        key={bootstrapKey}
                        onGenerated={() => setGeneratedBootstrapKey(bootstrapKey)}
                        port={port}
                        serverType={serverType}
                    />
                )}

                <Group justify="space-between">
                    <Button
                        color="gray"
                        disabled={isManagedCreation && isBootstrapGenerated}
                        leftSection={<PiArrowLeft size={18} />}
                        onClick={onPrev}
                        size="md"
                    >
                        {t('create-node-modal.widget.back')}
                    </Button>
                    <Button
                        color="teal"
                        disabled={isManagedCreation && !isBootstrapGenerated}
                        leftSection={<TbCheck size={18} />}
                        loading={isCreating}
                        onClick={handleCreateNode}
                        size="md"
                        type="submit"
                    >
                        {t(
                            isManagedCreation
                                ? 'create-node-modal.widget.create-node'
                                : 'create-node-modal.widget.import-external-node'
                        )}
                    </Button>
                </Group>
            </Stack>
        </Stack>
    )
}
