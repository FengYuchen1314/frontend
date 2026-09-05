import { useTranslation } from 'react-i18next'

import { CreationForm } from './creation-form'
import { useCreationForm, type CreationContentProps } from './model/use-creation-form'

export function CreateTemplateContent(props: CreationContentProps) {
    const { t } = useTranslation()
    const model = useCreationForm('template', props)
    return (
        <CreationForm
            model={model}
            modal={props.modal}
            nameLabel={t('header-action-buttons.feature.template-name')}
            namePlaceholder={'My Mihomo template'}
        />
    )
}
