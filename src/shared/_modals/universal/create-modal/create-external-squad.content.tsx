import { useTranslation } from 'react-i18next'

import { CreationForm } from './creation-form'
import { useCreationForm, type CreationContentProps } from './model/use-creation-form'

export function CreateExternalSquadContent(props: CreationContentProps) {
    const { t } = useTranslation()
    const model = useCreationForm('externalSquad', props)
    return (
        <CreationForm
            model={model}
            modal={props.modal}
            nameLabel={t('header-action-buttons.feature.external-squad-name')}
            namePlaceholder={'My Awesome Squad'}
        />
    )
}
