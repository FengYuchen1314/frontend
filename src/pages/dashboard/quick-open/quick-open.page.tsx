import { useTranslation } from 'react-i18next'
import { TbLink } from 'react-icons/tb'

import { OPEN_ENTITY_TARGETS } from '@shared/_modals/open-entity-targets'
import { TOpenEntity } from '@shared/constants'
import { Page } from '@shared/ui'

import { QuickOpenEntityCard } from './quick-open-entity-card'
import classes from './quick-open.module.css'

export function QuickOpenPage() {
    const { t } = useTranslation()
    const entities = Object.entries(OPEN_ENTITY_TARGETS) as [
        TOpenEntity,
        (typeof OPEN_ENTITY_TARGETS)[string]
    ][]

    return (
        <Page title={t('constants.quick-open')}>
            <header className={classes.pageHeader}>
                <h1>
                    <TbLink aria-hidden="true" size={24} />
                    {t('constants.quick-open')}
                </h1>
                <p>{t('quick-open.page.description')}</p>
            </header>
            <div className={classes.grid}>
                {entities.map(([entity, target]) => (
                    <QuickOpenEntityCard entity={entity} key={entity} target={target} />
                ))}
            </div>
        </Page>
    )
}
