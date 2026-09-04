import { Button, Group, Stack, Text } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PiCheck } from 'react-icons/pi'
import { SiDocker } from 'react-icons/si'

import { useCreateNodeBootstrap } from '@shared/api/hooks'
import { CopyableCodeBlock } from '@shared/ui/copyable-code-block'

interface IProps {
    onGenerated?: () => void
    port?: number
}

export const CopyDockerComposeWidget = ({ onGenerated, port }: IProps) => {
    const { t } = useTranslation()
    const clipboard = useClipboard({ timeout: 2000 })
    const { mutate: createBootstrap, isPending } = useCreateNodeBootstrap()
    const [bootstrap, setBootstrap] = useState<{
        expiresAt: string
        expiresInSeconds: number
        installCommand: string
    }>()

    const copyInstallCommand = () => {
        createBootstrap({
            variables: { nodePort: port ?? 2222 },
            mutationFns: {
                onSuccess: (data) => {
                    setBootstrap(data)
                    clipboard.copy(data.installCommand)
                    onGenerated?.()
                }
            }
        })
    }

    return (
        <Stack gap="xs" mt="lg">
            {bootstrap && (
                <>
                    <CopyableCodeBlock size="small" value={bootstrap.installCommand} />
                    <Text c="orange" size="xs">
                        {t('copy-docker-compose.widget.install-command-expiry', {
                            minutes: Math.ceil(bootstrap.expiresInSeconds / 60),
                            time: new Date(bootstrap.expiresAt).toLocaleTimeString()
                        })}
                    </Text>
                </>
            )}

            <Group>
                <Button
                    color={clipboard.copied ? 'teal' : 'gray'}
                    fullWidth
                    leftSection={clipboard.copied ? <PiCheck size={18} /> : <SiDocker size={18} />}
                    loading={isPending}
                    onClick={copyInstallCommand}
                    size="md"
                >
                    {t('copy-docker-compose.widget.copy-docker-compose-yml')}
                </Button>
            </Group>
        </Stack>
    )
}
