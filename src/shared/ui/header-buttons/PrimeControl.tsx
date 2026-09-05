import { Modal } from '@heroui/react'
import { IconCrownFilled } from '@tabler/icons-react'

import { PrimeModalContent } from '../prime-modal/prime-modal.shared'
import { HeaderControl } from './HeaderControl'
import { useDialogSessionKey } from './use-control-lifetime'

export function PrimeControl() {
    const session = useDialogSessionKey()
    return (
        <Modal key={session}>
            <HeaderControl aria-label="RW Prime" className="text-warning" isIconOnly>
                <IconCrownFilled aria-hidden size={22} />
            </HeaderControl>
            <Modal.Backdrop>
                <Modal.Container placement="center" size="md">
                    <Modal.Dialog>
                        <Modal.CloseTrigger aria-label="Close RW Prime" />
                        <Modal.Header>
                            <Modal.Heading>RW Prime</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <PrimeModalContent />
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
}
