import type { THelpDrawerAvailableScreen } from './help-drawer.types'
import type { IconBaseProps } from 'react-icons/lib'

import { Button, type ButtonProps, Tooltip } from '@heroui/react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { TbQuestionMark } from 'react-icons/tb'

import { showModal } from '@shared/_modals/show-modal'

interface IProps {
    buttonProps?: Omit<ButtonProps, 'onPress' | 'children'>
    hidden?: boolean
    iconProps?: IconBaseProps
    screen: THelpDrawerAvailableScreen
}
export const HelpActionIconShared = memo(({ buttonProps, hidden, iconProps, screen }: IProps) => {
    const { t } = useTranslation()
    if (hidden) return null
    return (
        <Tooltip>
            <Button
                isIconOnly
                variant="secondary"
                aria-label={t('help-action-icon.shared.help-article')}
                {...buttonProps}
                onPress={() => {
                    void showModal('helpDrawer', { screen })
                }}
            >
                <TbQuestionMark aria-hidden="true" size={24} {...iconProps} />
            </Button>
            <Tooltip.Content>{t('help-action-icon.shared.help-article')}</Tooltip.Content>
        </Tooltip>
    )
})
