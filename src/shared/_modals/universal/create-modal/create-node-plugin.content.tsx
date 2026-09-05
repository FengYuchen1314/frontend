import { useTranslation } from 'react-i18next'

import { CreationForm } from './creation-form'
import { useCreationForm, type CreationContentProps } from './model/use-creation-form'

export function CreateNodePluginContent(props: CreationContentProps) {
    const { t } = useTranslation()
    const model = useCreationForm('nodePlugin', props)
    return (
        <CreationForm
            model={model}
            modal={props.modal}
            nameLabel={t('common.field.name')}
            namePlaceholder={'My Node Plugin'}
        />
    )
}
