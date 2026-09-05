import type { CreateKind, CreationDestination } from './model/create-draft'
import type { TSubscriptionTemplateType } from '@remnawave/backend-contract'
import type { NavigateFunction } from 'react-router'

import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Modal } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { TbNewSection } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'
import { HeroModalPresence, useHeroModal } from '@shared/_modals/use-hero-modal'

import { CreateExternalSquadContent } from './create-external-squad.content'
import { CreateInternalSquadContent } from './create-internal-squad.content'
import { CreateNodePluginContent } from './create-node-plugin.content'
import { CreateSubpageConfigContent } from './create-subpage-config.content'
import { CreateTemplateContent } from './create-template.content'
import { CreateConfigProfileContent } from './create-сonfig-profile.content'

interface IProps {
    createFrom: CreateKind
    contentOptions: { navigate?: NavigateFunction; templateType?: TSubscriptionTemplateType }
}

const contents = {
    template: CreateTemplateContent,
    externalSquad: CreateExternalSquadContent,
    internalSquad: CreateInternalSquadContent,
    configProfile: CreateConfigProfileContent,
    nodePlugin: CreateNodePluginContent,
    subpageConfig: CreateSubpageConfigContent
}

export const CreateModal = NiceModal.create(({ createFrom, contentOptions }: IProps) => {
    const niceModal = useModal()
    const modal = useHeroModal({
        modal: niceModal,
        scopeKey: createFrom + ':' + (contentOptions.templateType ?? '')
    })
    const { t } = useTranslation()
    const Content = contents[createFrom]
    const contextReady =
        (createFrom === 'internalSquad' ||
            createFrom === 'externalSquad' ||
            typeof contentOptions.navigate === 'function') &&
        (createFrom !== 'template' || !!contentOptions.templateType)
    const onCreated = (destination: CreationDestination) => {
        if (destination.type === 'navigate') void contentOptions.navigate?.(destination.to)
        else if (destination.type === 'externalSquad')
            void showModal('externalSquads_externalSquadsDrawer', { uuid: destination.uuid })
        else
            void showModal('internalSquads_internalSquadsInboundsDrawer', {
                squadUuid: destination.uuid
            })
    }
    return (
        <Modal isOpen={modal.isOpen} onOpenChange={modal.onOpenChange}>
            <Modal.Backdrop>
                <HeroModalPresence onExitComplete={modal.afterClose} />
                <Modal.Container
                    size={createFrom === 'configProfile' ? 'lg' : 'sm'}
                    scroll="inside"
                >
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="flex items-center gap-2">
                                <TbNewSection aria-hidden="true" />
                                {t('common.field.creation')}
                            </Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            {contextReady ? (
                                <Content
                                    key={modal.presentationKey}
                                    modal={modal}
                                    onCreated={onCreated}
                                    templateType={contentOptions.templateType}
                                />
                            ) : (
                                <div className="flex flex-col gap-4">
                                    <Alert status="danger">
                                        <Alert.Indicator />
                                        <Alert.Content>
                                            <Alert.Description>
                                                {t('shared-dialogs.creation-context-unavailable')}
                                            </Alert.Description>
                                        </Alert.Content>
                                    </Alert>
                                    <Button variant="secondary" onPress={modal.close}>
                                        {t('common.action.cancel')}
                                    </Button>
                                </div>
                            )}
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
})
