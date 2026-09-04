import { Stack, TextInput, Group, Button, Text, Select } from '@mantine/core'
import { useField } from '@mantine/form'
import { CreateConfigProfileCommand } from '@remnawave/backend-contract'
import { t } from 'i18next'
import { useState } from 'react'
import { generatePath, NavigateFunction } from 'react-router'

import { queryClient } from '@shared/api'
import { useCreateConfigProfile } from '@shared/api/hooks/config-profiles/config-profiles.mutation.hooks'
import { QueryKeys } from '@shared/api/hooks/keys-factory'
import {
    createManagedProtocolConfig,
    DEFAULT_MANAGED_PROTOCOL_CREATION_PRESET,
    MANAGED_PROTOCOL_CREATION_WHITELIST,
    ManagedProtocolCreationPresetId
} from '@shared/constants'
import { ROUTES } from '@shared/constants/routes'

interface IProps {
    onClose: () => void
    navigate: NavigateFunction
}

export const CreateConfigProfileContent = (props: IProps) => {
    const { onClose, navigate } = props
    const [managedProtocolPreset, setManagedProtocolPreset] =
        useState<ManagedProtocolCreationPresetId>(DEFAULT_MANAGED_PROTOCOL_CREATION_PRESET)

    const handleUpdate = async () => {
        await queryClient.refetchQueries({
            queryKey: QueryKeys.configProfiles.getConfigProfiles.queryKey
        })
    }

    const nameField = useField<CreateConfigProfileCommand.RequestBody['name']>({
        initialValue: '',
        validateOnChange: true,
        validate: (value) => {
            const result = CreateConfigProfileCommand.RequestBodySchema.omit({
                config: true
            }).safeParse({ name: value })
            return result.success ? null : result.error.issues[0]?.message
        }
    })
    const { mutate: createConfigProfile, isPending } = useCreateConfigProfile({
        mutationFns: {
            onSuccess: (data) => {
                onClose()

                handleUpdate()
                navigate(
                    generatePath(ROUTES.DASHBOARD.MANAGEMENT.CONFIG_PROFILE_BY_UUID, {
                        uuid: data.uuid
                    })
                )
            }
        }
    })

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                createConfigProfile({
                    variables: {
                        name: nameField.getValue(),
                        config: createManagedProtocolConfig(managedProtocolPreset)
                    }
                })
            }}
        >
            <Stack gap="md">
                <Text size="sm">
                    {t(
                        'config-profiles-header-action-buttons.feature.create-a-new-config-profile-by-entering-a-name-below'
                    )}
                    <br />

                    {t(
                        'config-profiles-header-action-buttons.feature.you-can-customize-xray-config-after-creation'
                    )}
                </Text>
                <TextInput
                    data-autofocus
                    label={t('config-profiles-header-action-buttons.feature.profile-name')}
                    placeholder={t(
                        'config-profiles-header-action-buttons.feature.enter-profile-name'
                    )}
                    required
                    {...nameField.getInputProps()}
                />
                <Select
                    allowDeselect={false}
                    data={MANAGED_PROTOCOL_CREATION_WHITELIST.map(({ id, label }) => ({
                        label,
                        value: id
                    }))}
                    description={t(
                        'config-profiles-header-action-buttons.feature.managed-protocol-description'
                    )}
                    label={t('config-profiles-header-action-buttons.feature.managed-protocol')}
                    onChange={(value) => {
                        const selectedPreset = MANAGED_PROTOCOL_CREATION_WHITELIST.find(
                            (preset) => preset.id === value
                        )
                        if (selectedPreset) setManagedProtocolPreset(selectedPreset.id)
                    }}
                    value={managedProtocolPreset}
                />
                <Group justify="flex-end">
                    <Button color="gray" onClick={onClose} variant="light">
                        {t('common.action.cancel')}
                    </Button>

                    <Button color="teal" loading={isPending} type="submit">
                        {t('common.action.create')}
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
