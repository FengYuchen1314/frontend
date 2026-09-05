import type { PanelUpdateStatus } from '../header-buttons/panel-updater.model'
import type { GetMetadataCommand } from '@remnawave/backend-contract'

import { Alert, AlertDialog, Button, Chip, Spinner } from '@heroui/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbBrandGithub, TbBrandTelegram, TbGitBranch, TbRefresh, TbRocket } from 'react-icons/tb'

import { formatTimeUtil } from '@shared/utils/time-utils'

import { CopyValueButton } from '../header-buttons/CopyValueButton'
import { HeaderLink } from '../header-buttons/HeaderControl'
import { usePanelUpdater } from '../header-buttons/use-panel-updater'
import { Logo } from '../logo'

interface BuildInfoModalProps {
    isNewVersionAvailable: boolean
    remnawaveMetadata: GetMetadataCommand.Response['response']
    signal?: AbortSignal
}

const stateLabels = {
    UNCONFIGURED: 'build-info.updater.state-unconfigured',
    UNREACHABLE: 'build-info.updater.state-unreachable',
    IDLE: 'build-info.updater.state-idle',
    UPDATING: 'build-info.updater.state-updating',
    SUCCEEDED: 'build-info.updater.state-succeeded',
    FAILED: 'build-info.updater.state-failed'
} as const

export function BuildInfoModal({
    remnawaveMetadata: metadata,
    isNewVersionAvailable,
    signal
}: BuildInfoModalProps) {
    const { t } = useTranslation()
    const updater = usePanelUpdater(signal)
    const [confirmation, setConfirmation] = useState<PanelUpdateStatus | null>(null)
    const status = updater.data
    const statusMessage = (() => {
        if (updater.error) return t('build-info.updater.status-request-failed')
        if (!status) return t('build-info.updater.checking')
        switch (status.state) {
            case 'UNCONFIGURED':
                return t('build-info.updater.unconfigured')
            case 'UNREACHABLE':
                return t('build-info.updater.unreachable')
            case 'UPDATING':
                return t('build-info.updater.updating')
            case 'FAILED':
                return t('build-info.updater.failed')
        }
        if (status.updateAvailable)
            return t('build-info.updater.update-available', {
                version: status.targetVersion ?? t('common.message.not-set')
            })
        return t(
            status.state === 'SUCCEEDED'
                ? 'build-info.updater.succeeded'
                : 'build-info.updater.no-update'
        )
    })()
    const confirmUpdate = async () => {
        if (!confirmation) return
        const approved = confirmation
        setConfirmation(null)
        await updater.confirm(approved)
    }

    return (
        <div className="flex flex-col gap-4">
            {isNewVersionAvailable && (
                <Alert status="accent">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Update available</Alert.Title>
                        <Alert.Description>
                            <HeaderLink href="https://t.me/remnalog">
                                <TbBrandTelegram aria-hidden size={16} />
                                Release notes
                            </HeaderLink>
                        </Alert.Description>
                    </Alert.Content>
                </Alert>
            )}

            <section
                aria-label={t('build-info.updater.title')}
                className="rounded-xl border border-border bg-surface-secondary p-4"
            >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-semibold">
                        <TbRocket aria-hidden size={18} />
                        {t('build-info.updater.title')}
                    </h3>
                    <Chip
                        color={
                            status?.state === 'FAILED' || status?.state === 'UNREACHABLE'
                                ? 'danger'
                                : status?.state === 'SUCCEEDED'
                                  ? 'success'
                                  : 'accent'
                        }
                        size="sm"
                    >
                        {t(status ? stateLabels[status.state] : 'build-info.updater.checking')}
                    </Chip>
                </div>
                <p className="text-sm text-muted" role="status">
                    {statusMessage}
                </p>
                {status?.lastError && (
                    <Alert className="mt-3" role="alert" status="danger">
                        <Alert.Indicator />
                        <Alert.Content>
                            <Alert.Description>{status.lastError}</Alert.Description>
                        </Alert.Content>
                    </Alert>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                        isDisabled={updater.isFetching}
                        onPress={() => void updater.refetch()}
                        size="sm"
                        variant="secondary"
                    >
                        {updater.isFetching ? (
                            <Spinner aria-hidden size="sm" />
                        ) : (
                            <TbRefresh aria-hidden size={16} />
                        )}
                        {t('build-info.updater.check-status')}
                    </Button>
                    <AlertDialog
                        isOpen={confirmation !== null}
                        onOpenChange={(open) => {
                            if (!open) setConfirmation(null)
                        }}
                    >
                        <Button
                            isDisabled={!updater.canUpdate}
                            onPress={() => {
                                if (updater.data) setConfirmation(updater.data)
                            }}
                            size="sm"
                        >
                            {updater.isTriggering ? (
                                <Spinner aria-hidden size="sm" />
                            ) : (
                                <TbRocket aria-hidden size={16} />
                            )}
                            {t('build-info.updater.update-now')}
                        </Button>
                        <AlertDialog.Backdrop isKeyboardDismissDisabled={false}>
                            <AlertDialog.Container placement="center" size="md">
                                <AlertDialog.Dialog>
                                    <AlertDialog.Header>
                                        <AlertDialog.Heading>
                                            {t('build-info.updater.confirm-title')}
                                        </AlertDialog.Heading>
                                    </AlertDialog.Header>
                                    <AlertDialog.Body>
                                        {t('build-info.updater.confirm-description', {
                                            channel: confirmation?.channel ?? 'xboard-dev'
                                        })}
                                    </AlertDialog.Body>
                                    <AlertDialog.Footer>
                                        <Button
                                            onPress={() => setConfirmation(null)}
                                            variant="secondary"
                                        >
                                            {t('common.action.cancel')}
                                        </Button>
                                        <Button
                                            isDisabled={!updater.canUpdate || updater.isTriggering}
                                            onPress={() => void confirmUpdate()}
                                        >
                                            {t('build-info.updater.confirm')}
                                        </Button>
                                    </AlertDialog.Footer>
                                </AlertDialog.Dialog>
                            </AlertDialog.Container>
                        </AlertDialog.Backdrop>
                    </AlertDialog>
                </div>
            </section>

            <section className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Chip color="accent">
                            <Logo size={16} />
                            {metadata.version}
                        </Chip>
                        <Chip
                            color={metadata.git.backend.branch === 'main' ? 'success' : 'warning'}
                        >
                            <TbGitBranch aria-hidden size={16} />
                            {metadata.git.backend.branch}
                        </Chip>
                    </div>
                    <CopyValueButton
                        label="Copy build info"
                        signal={signal}
                        value={JSON.stringify(metadata, null, 2)}
                    />
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                        <dt className="text-muted">Build time</dt>
                        <dd className="font-mono">
                            {formatTimeUtil({
                                time: metadata.build.time,
                                template: 'NUMERIC_DATETIME'
                            })}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted">Build</dt>
                        <dd className="font-mono">{metadata.build.number}</dd>
                    </div>
                </dl>
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
                {(['backend', 'frontend'] as const).map((part) => (
                    <section className="min-w-0 rounded-xl border border-border p-3" key={part}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-semibold capitalize">{part}</h3>
                            <HeaderLink
                                aria-label={`View ${part} commit on GitHub`}
                                href={metadata.git[part].commitUrl}
                            >
                                <TbBrandGithub aria-hidden size={16} />
                            </HeaderLink>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <code className="min-w-0 flex-1 break-all text-xs">
                                {metadata.git[part].commitSha}
                            </code>
                            <CopyValueButton
                                label={`Copy ${part} commit`}
                                signal={signal}
                                value={metadata.git[part].commitSha}
                            />
                        </div>
                    </section>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <HeaderLink href="https://t.me/remnawave">
                    <TbBrandTelegram aria-hidden size={16} />
                    Community
                </HeaderLink>
                <HeaderLink href="https://github.com/FengYuchen1314">
                    <TbBrandGithub aria-hidden size={16} />
                    GitHub
                </HeaderLink>
            </div>
        </div>
    )
}
