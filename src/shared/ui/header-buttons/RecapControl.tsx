import { Modal } from '@heroui/react'
import { RecapContent } from '@widgets/dashboard/recap/recap.content.widget'
import { TbSparkles } from 'react-icons/tb'

import { HeaderControl } from './HeaderControl'
import { useDialogOperationScope, useDialogSessionKey } from './use-control-lifetime'

export function RecapControl() {
    const session = useDialogSessionKey()
    const scope = useDialogOperationScope()
    return (
        <Modal key={session} onOpenChange={scope.onOpenChange}>
            <HeaderControl aria-label="Recap" isIconOnly>
                <TbSparkles aria-hidden size={22} />
            </HeaderControl>
            <Modal.Backdrop>
                <Modal.Container className="max-w-[1100px]" placement="center" size="cover">
                    <Modal.Dialog>
                        <Modal.CloseTrigger aria-label="Close Recap" />
                        <Modal.Header>
                            <Modal.Heading>Recap</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <RecapContent key={scope.generation} signal={scope.signal} />
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
}
