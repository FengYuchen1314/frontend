import type { THelpDrawerAvailableScreen } from './help-drawer.types'

import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { Alert, Button, Modal, Spinner } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { TbQuestionMark } from 'react-icons/tb'

import { HeroModalPresence, useHeroModal } from '@shared/_modals/use-hero-modal'

import { HelpArticleContent } from './help-article-content'
import classes from './help-drawer.module.css'
import { useHelpArticle } from './model/use-help-article'

interface IProps {
    screen: THelpDrawerAvailableScreen
}

export const HelpDrawerShared = NiceModal.create(({ screen }: IProps) => {
    const { t, i18n } = useTranslation()
    const niceModal = useModal()
    const modal = useHeroModal({ modal: niceModal, scopeKey: screen + ':' + i18n.language })
    const article = useHelpArticle(screen, i18n.language, modal)
    return (
        <Modal isOpen={modal.isOpen} onOpenChange={modal.onOpenChange}>
            <Modal.Backdrop>
                <HeroModalPresence onExitComplete={modal.afterClose} />
                <Modal.Container size="lg" scroll="inside">
                    <Modal.Dialog className="max-h-[90dvh]">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading className="flex items-center gap-2">
                                <TbQuestionMark aria-hidden="true" />
                                {t('help-action-icon.shared.help-article')}
                            </Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            {article.loading && (
                                <div
                                    role="status"
                                    className="flex min-h-56 items-center justify-center gap-3"
                                >
                                    <Spinner />
                                    Loading documentation…
                                </div>
                            )}
                            {article.error && (
                                <Alert status="danger">
                                    <Alert.Content>
                                        <Alert.Title>
                                            {t('help-drawer.shared.failed-to-load-documentation')}
                                        </Alert.Title>
                                        <Alert.Description>{article.error}</Alert.Description>
                                        <Button
                                            className="mt-3"
                                            variant="secondary"
                                            onPress={article.retry}
                                        >
                                            Retry
                                        </Button>
                                    </Alert.Content>
                                </Alert>
                            )}
                            {!article.loading && !article.error && (
                                <HelpArticleContent
                                    content={article.content}
                                    className={classes.root}
                                />
                            )}
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="secondary" onPress={modal.close}>
                                {t('common.action.close')}
                            </Button>
                        </Modal.Footer>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
})
