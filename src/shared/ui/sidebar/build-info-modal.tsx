import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    CopyButton,
    Divider,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    Tooltip
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { GetMetadataCommand } from '@remnawave/backend-contract'
import { useTranslation } from 'react-i18next'
import {
    TbAlertCircle,
    TbBrandGithub,
    TbBrandTelegram,
    TbCalendar,
    TbCheck,
    TbCopy,
    TbGitBranch,
    TbHash,
    TbRefresh,
    TbRocket,
    TbServer,
    TbWorld
} from 'react-icons/tb'

import { useGetUpdateStatus, useTriggerUpdate } from '@shared/api/hooks'
import { formatTimeUtil } from '@shared/utils/time-utils'

import { CopyableCodeBlock } from '../copyable-code-block'
import { Logo } from '../logo'
import classes from './build-info-modal.module.css'

interface BuildInfoModalProps {
    isNewVersionAvailable: boolean
    remnawaveMetadata: GetMetadataCommand.Response['response']
}

export function BuildInfoModal({ remnawaveMetadata, isNewVersionAvailable }: BuildInfoModalProps) {
    const { t } = useTranslation()
    const {
        data: updaterStatus,
        error: updaterStatusError,
        isFetching: isCheckingUpdater,
        refetch: refetchUpdaterStatus
    } = useGetUpdateStatus()
    const { mutate: triggerUpdate, isPending: isTriggeringUpdate } = useTriggerUpdate({
        mutationFns: {
            onSuccess: (result) => {
                if (result.accepted) {
                    notifications.show({
                        color: 'teal',
                        title: t('build-info.updater.request-accepted-title'),
                        message: t('build-info.updater.request-accepted-message')
                    })
                } else {
                    notifications.show({
                        color: 'yellow',
                        title: t('build-info.updater.request-rejected-title'),
                        message: result.message ?? t('build-info.updater.request-rejected-message')
                    })
                }

                void refetchUpdaterStatus()
            },
            onError: (error) => {
                notifications.show({
                    color: 'red',
                    title: t('build-info.updater.request-failed-title'),
                    message: error.message
                })
            }
        }
    })

    const canTriggerUpdate =
        !updaterStatusError &&
        !isCheckingUpdater &&
        updaterStatus?.configured === true &&
        updaterStatus.reachable &&
        updaterStatus.updateAvailable === true &&
        updaterStatus.state !== 'UPDATING'

    const updaterStatusMessage = (() => {
        if (updaterStatusError) return t('build-info.updater.status-request-failed')
        if (!updaterStatus) return t('build-info.updater.checking')

        switch (updaterStatus.state) {
            case 'UNCONFIGURED':
                return t('build-info.updater.unconfigured')
            case 'UNREACHABLE':
                return t('build-info.updater.unreachable')
            case 'UPDATING':
                return t('build-info.updater.updating')
            case 'FAILED':
                return t('build-info.updater.failed')
        }

        if (updaterStatus.updateAvailable) {
            return t('build-info.updater.update-available', {
                version: updaterStatus.targetVersion ?? t('common.message.not-set')
            })
        }

        return updaterStatus.state === 'SUCCEEDED'
            ? t('build-info.updater.succeeded')
            : t('build-info.updater.no-update')
    })()

    const updaterStatusLabel = (() => {
        switch (updaterStatus?.state) {
            case 'UNCONFIGURED':
                return t('build-info.updater.state-unconfigured')
            case 'UNREACHABLE':
                return t('build-info.updater.state-unreachable')
            case 'IDLE':
                return t('build-info.updater.state-idle')
            case 'UPDATING':
                return t('build-info.updater.state-updating')
            case 'SUCCEEDED':
                return t('build-info.updater.state-succeeded')
            case 'FAILED':
                return t('build-info.updater.state-failed')
            default:
                return t('build-info.updater.checking')
        }
    })()

    const updaterStatusColor = (() => {
        switch (updaterStatus?.state) {
            case 'SUCCEEDED':
                return 'teal'
            case 'UPDATING':
                return 'blue'
            case 'FAILED':
            case 'UNREACHABLE':
                return 'red'
            case 'UNCONFIGURED':
                return 'gray'
            default:
                return updaterStatus?.updateAvailable ? 'yellow' : 'cyan'
        }
    })()

    const handleTriggerUpdate = () => {
        modals.openConfirmModal({
            centered: true,
            title: t('build-info.updater.confirm-title'),
            children: (
                <Text size="sm">
                    {t('build-info.updater.confirm-description', {
                        channel: updaterStatus?.channel ?? 'xboard-dev'
                    })}
                </Text>
            ),
            labels: {
                confirm: t('build-info.updater.confirm'),
                cancel: t('common.action.cancel')
            },
            confirmProps: { color: 'teal' },
            onConfirm: () => triggerUpdate({})
        })
    }

    return (
        <Stack gap="md">
            {isNewVersionAvailable && (
                <Paper className={classes.updateCard} p="md" radius="md">
                    <Group align="center" gap="md" wrap="wrap">
                        <Group gap="sm" wrap="nowrap">
                            <Box className={classes.updateIconBox}>
                                <Logo color="var(--mantine-color-teal-4)" size={24} />
                            </Box>
                            <Stack className={classes.updateTextWrapper} gap={4}>
                                <Text c="teal.4" fw={600} size="sm">
                                    Update available
                                </Text>
                                <Text c="dimmed" size="xs">
                                    A new version is available
                                </Text>
                            </Stack>
                        </Group>

                        <Button
                            color="teal"
                            component="a"
                            href="https://t.me/remnalog"
                            leftSection={<TbBrandTelegram size={14} />}
                            ml="auto"
                            radius="md"
                            size="xs"
                            target="_blank"
                            variant="light"
                        >
                            Check out
                        </Button>
                    </Group>
                </Paper>
            )}

            <Paper className={classes.updaterCard} p="md" radius="md">
                <Stack gap="sm">
                    <Group justify="space-between" wrap="wrap">
                        <Group gap="xs">
                            <TbRocket color="var(--mantine-color-teal-5)" size={18} />
                            <Text fw={600} size="sm">
                                {t('build-info.updater.title')}
                            </Text>
                        </Group>
                        <Badge color={updaterStatusColor} variant="light">
                            {updaterStatusLabel}
                        </Badge>
                    </Group>

                    <Text c="dimmed" size="xs">
                        {updaterStatusMessage}
                    </Text>

                    {updaterStatus?.lastError && (
                        <Alert
                            color="red"
                            icon={<TbAlertCircle size={16} />}
                            p="xs"
                            variant="light"
                        >
                            {updaterStatus.lastError}
                        </Alert>
                    )}

                    <Group grow>
                        <Button
                            leftSection={<TbRefresh size={15} />}
                            loading={isCheckingUpdater}
                            onClick={() => void refetchUpdaterStatus()}
                            size="xs"
                            variant="light"
                        >
                            {t('build-info.updater.check-status')}
                        </Button>
                        <Button
                            color="teal"
                            disabled={!canTriggerUpdate}
                            leftSection={<TbRocket size={15} />}
                            loading={isTriggeringUpdate}
                            onClick={handleTriggerUpdate}
                            size="xs"
                        >
                            {t('build-info.updater.update-now')}
                        </Button>
                    </Group>
                </Stack>
            </Paper>

            <Paper className={classes.mainCard} p="md">
                <Stack gap="md">
                    <Group justify="space-between">
                        <Group gap="sm">
                            <Badge
                                color="cyan"
                                leftSection={<Logo size={16} />}
                                size="lg"
                                variant="light"
                            >
                                {remnawaveMetadata.version}
                            </Badge>

                            <Badge
                                color={
                                    remnawaveMetadata.git.backend.branch === 'dev' ? 'red' : 'teal'
                                }
                                leftSection={<TbGitBranch size={16} />}
                                size="lg"
                                variant="light"
                            >
                                {remnawaveMetadata.git.backend.branch}
                            </Badge>
                        </Group>
                        <CopyButton
                            timeout={2000}
                            value={JSON.stringify(remnawaveMetadata, null, 2)}
                        >
                            {({ copied, copy }) => (
                                <Tooltip label="Copy build info">
                                    <ActionIcon
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={copy}
                                        size="md"
                                        variant="subtle"
                                    >
                                        {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>

                    <Divider className={classes.divider} />

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <Paper className={classes.buildTimeCard} p="sm" radius="md">
                            <Group gap="xs" mb={6}>
                                <TbCalendar color="var(--mantine-color-indigo-5)" size={14} />
                                <Text c="indigo.5" fw={600} size="xs" tt="uppercase">
                                    Build Time
                                </Text>
                            </Group>
                            <Text c="gray.3" ff="monospace" size="xs">
                                {formatTimeUtil({
                                    time: remnawaveMetadata.build.time,
                                    template: 'NUMERIC_DATETIME'
                                })}
                            </Text>
                        </Paper>

                        <Paper className={classes.buildNumberCard} p="sm" radius="md">
                            <Group gap="xs" mb={6}>
                                <TbHash color="var(--mantine-color-violet-5)" size={14} />
                                <Text c="violet.5" fw={600} size="xs" tt="uppercase">
                                    Build
                                </Text>
                            </Group>
                            <Text c="gray.3" ff="monospace" size="xs">
                                {remnawaveMetadata.build.number}
                            </Text>
                        </Paper>
                    </SimpleGrid>
                </Stack>
            </Paper>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Paper className={classes.backendCard} p="md" radius="md">
                    <Stack gap="sm">
                        <Group gap="xs" justify="space-between">
                            <Group gap="xs">
                                <TbServer color="var(--mantine-color-teal-5)" size={16} />
                                <Text c="teal.5" fw={600} size="sm">
                                    Backend
                                </Text>
                            </Group>
                            <Tooltip label="View on GitHub">
                                <ActionIcon
                                    color="teal"
                                    component="a"
                                    href={remnawaveMetadata.git.backend.commitUrl}
                                    size="sm"
                                    target="_blank"
                                    variant="subtle"
                                >
                                    <TbBrandGithub size={14} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>

                        <CopyableCodeBlock
                            size="small"
                            value={remnawaveMetadata.git.backend.commitSha}
                        />
                    </Stack>
                </Paper>

                <Paper className={classes.frontendCard} p="md" radius="md">
                    <Stack gap="sm">
                        <Group gap="xs" justify="space-between">
                            <Group gap="xs">
                                <TbWorld color="var(--mantine-color-cyan-5)" size={16} />
                                <Text c="cyan.5" fw={600} size="sm">
                                    Frontend
                                </Text>
                            </Group>
                            <Tooltip label="View on GitHub">
                                <ActionIcon
                                    color="cyan"
                                    component="a"
                                    href={remnawaveMetadata.git.frontend.commitUrl}
                                    size="sm"
                                    target="_blank"
                                    variant="subtle"
                                >
                                    <TbBrandGithub size={14} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>

                        <CopyableCodeBlock
                            size="small"
                            value={remnawaveMetadata.git.frontend.commitSha}
                        />
                    </Stack>
                </Paper>
            </SimpleGrid>

            <Group gap="sm" grow>
                <Button
                    color="cyan"
                    component="a"
                    href="https://t.me/remnawave"
                    leftSection={<TbBrandTelegram size={16} />}
                    radius="md"
                    size="sm"
                    target="_blank"
                    variant="light"
                >
                    Community
                </Button>
                <Button
                    component="a"
                    href="https://github.com/FengYuchen1314"
                    leftSection={<TbBrandGithub size={16} />}
                    radius="md"
                    size="sm"
                    target="_blank"
                    variant="default"
                >
                    GitHub
                </Button>
            </Group>
        </Stack>
    )
}
