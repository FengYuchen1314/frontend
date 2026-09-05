import { useTranslation } from 'react-i18next'

import { CreationForm } from './creation-form'
import { useCreationForm, type CreationContentProps } from './model/use-creation-form'

export function CreateSubpageConfigContent(props: CreationContentProps) {
    const { t } = useTranslation()
    const model = useCreationForm('subpageConfig', props)
    return (
        <CreationForm
            model={model}
            modal={props.modal}
            nameLabel={t('common.field.name')}
            namePlaceholder={'My Subscription Page Config'}
        />
    )
}
