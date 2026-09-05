import {
    Alert,
    Description,
    FieldError,
    Input,
    Label,
    ListBox,
    NumberField,
    Select,
    TextField
} from '@heroui/react'
import { Controller, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
    getManagedAnyTlsPresetError,
    MANAGED_PROTOCOL_CREATION_WHITELIST
} from '@shared/constants/managed-protocols'

import { CreationForm, type CreationFormModel } from './creation-form'
import { anyTlsOptions, creationDefaults } from './model/create-draft'
import { useCreationForm, type CreationContentProps } from './model/use-creation-form'

const portFields = [
    { name: 'camouflagePort', label: 'anytls-camouflage-port', min: 1 },
    { name: 'wrapperPort', label: 'anytls-wrapper-port', min: 1024 },
    { name: 'innerPort', label: 'anytls-inner-port', min: 1024 }
] as const

export function ConfigProfileCreationForm({
    model,
    modal
}: { model: CreationFormModel } & Pick<CreationContentProps, 'modal'>) {
    const { t } = useTranslation()
    const { form, isPending } = model
    const watched = useWatch({ control: form.control })
    const values = { ...creationDefaults(), ...watched }
    const isAnyTls = values.managedProtocolPreset === 'anytls-shadowtls'
    const anyTlsError = isAnyTls ? getManagedAnyTlsPresetError(anyTlsOptions(values)) : null
    return (
        <CreationForm
            model={model}
            modal={modal}
            nameLabel={t('config-profiles-header-action-buttons.feature.profile-name')}
            namePlaceholder={t('config-profiles-header-action-buttons.feature.enter-profile-name')}
            isDisabled={!!anyTlsError}
            description={
                <p className="text-sm text-muted">
                    {t(
                        'config-profiles-header-action-buttons.feature.create-a-new-config-profile-by-entering-a-name-below'
                    )}
                    <br />
                    {t(
                        'config-profiles-header-action-buttons.feature.you-can-customize-xray-config-after-creation'
                    )}
                </p>
            }
        >
            <Controller
                control={form.control}
                name="managedProtocolPreset"
                render={({ field, fieldState }) => (
                    <Select
                        name={field.name}
                        value={field.value}
                        onChange={(value) => {
                            const preset = MANAGED_PROTOCOL_CREATION_WHITELIST.find(
                                (item) => item.id === value
                            )
                            if (preset) field.onChange(preset.id)
                        }}
                        onBlur={field.onBlur}
                        isRequired
                        isDisabled={isPending}
                        isInvalid={fieldState.invalid}
                        fullWidth
                    >
                        <Label>
                            {t('config-profiles-header-action-buttons.feature.managed-protocol')}
                        </Label>
                        <Select.Trigger ref={field.ref}>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Description>
                            {t(
                                'config-profiles-header-action-buttons.feature.managed-protocol-description'
                            )}
                        </Description>
                        <Select.Popover>
                            <ListBox>
                                {MANAGED_PROTOCOL_CREATION_WHITELIST.map((preset) => (
                                    <ListBox.Item
                                        key={preset.id}
                                        id={preset.id}
                                        textValue={preset.label}
                                    >
                                        {preset.label}
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                        <FieldError>{fieldState.error?.message}</FieldError>
                    </Select>
                )}
            />
            {isAnyTls && (
                <section className="flex flex-col gap-4" aria-label="AnyTLS + ShadowTLS">
                    <Alert status="accent">
                        <Alert.Indicator />
                        <Alert.Content>
                            <Alert.Description>
                                {t('config-profiles-header-action-buttons.feature.anytls-help')}
                            </Alert.Description>
                        </Alert.Content>
                    </Alert>
                    {(['serverName', 'address'] as const).map((name) => (
                        <Controller
                            key={name}
                            control={form.control}
                            name={name}
                            render={({ field, fieldState }) => (
                                <TextField
                                    name={field.name}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    isRequired
                                    isDisabled={isPending}
                                    isInvalid={fieldState.invalid}
                                >
                                    <Label>
                                        {t(
                                            name === 'serverName'
                                                ? 'config-profiles-header-action-buttons.feature.anytls-sni'
                                                : 'config-profiles-header-action-buttons.feature.anytls-address'
                                        )}
                                    </Label>
                                    <Input ref={field.ref} variant="secondary" />
                                    <FieldError>{fieldState.error?.message}</FieldError>
                                </TextField>
                            )}
                        />
                    ))}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {portFields.map(({ name, label, min }) => (
                            <Controller
                                key={name}
                                control={form.control}
                                name={name}
                                render={({ field, fieldState }) => (
                                    <NumberField
                                        name={field.name}
                                        value={field.value}
                                        onChange={field.onChange}
                                        onBlur={field.onBlur}
                                        minValue={min}
                                        maxValue={65535}
                                        step={1}
                                        formatOptions={{ useGrouping: false }}
                                        isRequired
                                        isDisabled={isPending}
                                        isInvalid={fieldState.invalid}
                                    >
                                        <Label>
                                            {t(
                                                `config-profiles-header-action-buttons.feature.${label}`
                                            )}
                                        </Label>
                                        <NumberField.Group>
                                            <NumberField.DecrementButton />
                                            <NumberField.Input ref={field.ref} />
                                            <NumberField.IncrementButton />
                                        </NumberField.Group>
                                        <FieldError>{fieldState.error?.message}</FieldError>
                                    </NumberField>
                                )}
                            />
                        ))}
                    </div>
                    {anyTlsError &&
                        (values.serverName || values.address || form.formState.submitCount > 0) && (
                            <p role="alert" className="text-sm text-danger">
                                {anyTlsError}
                            </p>
                        )}
                </section>
            )}
        </CreationForm>
    )
}

export function CreateConfigProfileContent(props: CreationContentProps) {
    const model = useCreationForm('configProfile', props)
    return <ConfigProfileCreationForm model={model} modal={props.modal} />
}
