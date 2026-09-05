import { useModal } from '@ebay/nice-modal-react'
import { Card } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'

import type { TOpenEntityModalTarget } from '@shared/_modals/open-entity-targets'
import { OPEN_ENTITY_TARGETS } from '@shared/_modals/open-entity-targets'
import { ROUTES } from '@shared/constants'

import { createModalReturnTracker, resolveOpenEntity } from './open-entity.model'
import classes from './open-entity.module.css'

interface IModalRedirectProps {
    id: string
    target: TOpenEntityModalTarget
}

function OpenEntityStage(props: IModalRedirectProps) {
    const { id, target } = props

    const { t } = useTranslation()

    return (
        <div className={classes.stage}>
            <Card className={classes.card}>
                <Card.Content className={classes.content}>
                    <span aria-hidden="true" className={classes.icon}>
                        <target.Icon size={32} />
                    </span>
                    <Card.Title>{t(target.titleKey)}</Card.Title>
                    <code className={classes.identifier}>{id}</code>
                </Card.Content>
            </Card>
        </div>
    )
}

function OpenEntityModal(props: IModalRedirectProps) {
    const { id, target } = props

    const navigate = useNavigate()
    const modal = useModal(target.modalId)

    const [shouldReturn] = useState(createModalReturnTracker)

    useEffect(() => {
        target.open(id)
    }, [id, target])

    useEffect(() => {
        if (shouldReturn(modal.visible)) navigate(target.fallback, { replace: true })
    }, [modal.visible, navigate, target, shouldReturn])

    return <OpenEntityStage id={id} target={target} />
}

export function OpenEntityPage() {
    const { entity, id } = useParams()

    const result = resolveOpenEntity(OPEN_ENTITY_TARGETS, ROUTES.DASHBOARD.HOME, entity, id)
    if (result.kind === 'redirect') return <Navigate replace to={result.to} />
    return <OpenEntityModal id={result.id} key={result.key} target={result.target} />
}
