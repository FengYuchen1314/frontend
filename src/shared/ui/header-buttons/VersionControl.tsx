import { Modal } from '@heroui/react'
import { TbRefresh } from 'react-icons/tb'

import { useGetRemnawaveMetadata } from '@shared/api/hooks'

import { useRemnawaveInfo } from '@entities/dashboard/updates-store'

import { Logo } from '../logo'
import { BuildInfoModal } from '../sidebar/build-info-modal'
import { versionPresentation } from './header-controls.model'
import { HeaderControl } from './HeaderControl'
import { SkeletonHeaderControl } from './SkeletonHeaderControl'
import { useDialogOperationScope, useDialogSessionKey } from './use-control-lifetime'

export function VersionControl() {
    const remnawaveInfo = useRemnawaveInfo()
    const { data: metadata, isLoading, isFetching, error, refetch } = useGetRemnawaveMetadata()
    const session = useDialogSessionKey()
    const scope = useDialogOperationScope()
    if (isLoading) return <SkeletonHeaderControl width={85} />
    if (!metadata)
        return (
            <HeaderControl
                aria-label="Retry loading build information"
                isDisabled={isFetching}
                onPress={() => void refetch()}
            >
                <TbRefresh aria-hidden size={20} />
                {error ? 'Build info unavailable' : 'Build info'}
            </HeaderControl>
        )
    const { isNewVersionAvailable, isDev } = versionPresentation(
        metadata.version,
        remnawaveInfo.latestVersion,
        metadata.git.backend.branch
    )
    return (
        <Modal key={session} onOpenChange={scope.onOpenChange}>
            <HeaderControl
                aria-label={`Build info: ${metadata.version}`}
                className={isDev ? 'text-warning' : isNewVersionAvailable ? 'text-accent' : ''}
            >
                <Logo size={20} />
                {metadata.version}
            </HeaderControl>
            <Modal.Backdrop>
                <Modal.Container placement="center" size="lg">
                    <Modal.Dialog>
                        <Modal.CloseTrigger aria-label="Close build information" />
                        <Modal.Header>
                            <Modal.Heading>Build Info</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <BuildInfoModal
                                isNewVersionAvailable={isNewVersionAvailable}
                                key={scope.generation}
                                remnawaveMetadata={metadata}
                                signal={scope.signal}
                            />
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
}
