import { useTranslation } from 'react-i18next'

import { CreationForm } from './creation-form'
import { useCreationForm, type CreationContentProps } from './model/use-creation-form'

export function CreateInternalSquadContent(props: CreationContentProps) {
    const { t } = useTranslation()
    const model = useCreationForm('internalSquad', props)
    return (
        <CreationForm
            model={model}
            modal={props.modal}
            nameLabel={t('internal-squad-header-action-buttons.feature.squad-name')}
            namePlaceholder={t('internal-squad-header-action-buttons.feature.enter-squad-name')}
        />
    )
}
