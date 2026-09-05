import { Button, Card, FieldError, Input, Label, TextField } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbArrowRight, TbCheck, TbLink } from 'react-icons/tb'
import { useNavigate } from 'react-router'

import type { TOpenEntityTarget } from '@shared/_modals/open-entity-targets'
import type { TOpenEntity } from '@shared/constants'
import { ROUTES } from '@shared/constants'

import { createCopyRequest, resolveQuickOpenPath } from './quick-open.model'
import classes from './quick-open.module.css'

interface Props {
    entity: TOpenEntity
    target: TOpenEntityTarget
}

export function QuickOpenEntityCard({ entity, target }: Props) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [id, setId] = useState('')
    const [copyRequest] = useState(createCopyRequest)
    const [copyStatus, setCopyStatus] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle')
    const path = resolveQuickOpenPath(ROUTES.DASHBOARD.OPEN_ENTITY, entity, id, target.validate)
    const title = t(target.titleKey)

    useEffect(() => () => copyRequest.invalidate(), [copyRequest])
    useEffect(() => {
        if (copyStatus !== 'copied') return
        const timer = setTimeout(() => setCopyStatus('idle'), 1500)
        return () => clearTimeout(timer)
    }, [copyStatus])

    const copyLink = async () => {
        if (!path) return
        setCopyStatus('pending')
        const result = await copyRequest.copy(() =>
            navigator.clipboard.writeText(`${window.location.origin}${path}`)
        )
        if (result) setCopyStatus(result)
    }

    return (
        <Card aria-labelledby={`quick-open-${entity}`} className={classes.card}>
            <Card.Header className={classes.cardHeader}>
                <span aria-hidden="true" className={classes.icon}>
                    <target.Icon size={20} />
                </span>
                <div className={classes.heading}>
                    <Card.Title id={`quick-open-${entity}`}>{title}</Card.Title>
                    <code className={classes.pattern}>{`/dashboard/open/${entity}/:id`}</code>
                </div>
            </Card.Header>
            <Card.Content>
                <form
                    className={classes.form}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (path) navigate(path)
                    }}
                >
                    <TextField
                        className={classes.field}
                        isInvalid={Boolean(id) && !path}
                        name={entity}
                        onChange={(value) => {
                            copyRequest.invalidate()
                            setCopyStatus('idle')
                            setId(value.trim())
                        }}
                        validationBehavior="aria"
                        value={id}
                    >
                        <Label>{title} · ID</Label>
                        <Input
                            autoComplete="off"
                            placeholder={target.idPlaceholder}
                            spellCheck={false}
                        />
                        <FieldError>{t('common.message.error')} · ID</FieldError>
                    </TextField>
                    <div className={classes.actions}>
                        <Button
                            aria-label={`${t('common.action.copy-link')}: ${title}`}
                            isDisabled={!path}
                            isIconOnly
                            isPending={copyStatus === 'pending'}
                            onPress={copyLink}
                            type="button"
                            variant="secondary"
                        >
                            {copyStatus === 'copied' ? <TbCheck size={18} /> : <TbLink size={18} />}
                        </Button>
                        <Button
                            aria-label={`${t('common.action.open')}: ${title}`}
                            isDisabled={!path}
                            isIconOnly
                            type="submit"
                        >
                            <TbArrowRight size={18} />
                        </Button>
                    </div>
                </form>
                <p aria-live="polite" className={classes.copyStatus} role="status">
                    {copyStatus === 'copied' && t('common.message.copied')}
                    {copyStatus === 'error' && t('common.message.error')}
                </p>
            </Card.Content>
        </Card>
    )
}
