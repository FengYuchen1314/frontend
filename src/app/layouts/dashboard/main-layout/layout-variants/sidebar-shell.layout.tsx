import type { ReactNode } from 'react'

import { Button, Modal } from '@heroui/react'
import { TbMenu2, TbX } from 'react-icons/tb'

import { LayoutBrand, LayoutMain } from '../layout-shared'
import classes from '../layout.module.css'
import { MobileNavigation } from '../navbar/mobile-navigation.layout'

interface IProps {
    mode: 'desktop' | 'mobile'
    footer?: ReactNode
    headerControls: ReactNode
    opened: boolean
    onOpenChange: (opened: boolean) => void
}

export const SidebarShellLayout = ({
    mode,
    footer,
    headerControls,
    opened,
    onOpenChange
}: IProps) => {
    const mobile = mode === 'mobile'
    const contents = (
        <>
            <div className={classes.logoSection}>
                <LayoutBrand />
            </div>
            <div className={classes.scrollArea}>
                <MobileNavigation onClose={mobile ? () => onOpenChange(false) : undefined} />
            </div>
            {footer && <div className={classes.footerSection}>{footer}</div>}
        </>
    )

    return (
        <div className={classes.shell} data-layout={mode} data-sidebar-open={!mobile && opened}>
            <a className={classes.skipLink} href="#dashboard-main">
                Skip to content
            </a>
            <header className={classes.header}>
                <div className={classes.brandRow}>
                    <Button
                        aria-label={opened ? 'Close navigation' : 'Open navigation'}
                        aria-expanded={opened}
                        aria-controls={opened ? 'dashboard-sidebar' : undefined}
                        isIconOnly
                        onPress={() => onOpenChange(!opened)}
                        variant="ghost"
                    >
                        {opened ? <TbX size={22} /> : <TbMenu2 size={22} />}
                    </Button>
                    <div className={classes.headerControls}>{headerControls}</div>
                </div>
            </header>
            {mobile ? (
                <Modal.Backdrop isOpen={opened} onOpenChange={onOpenChange}>
                    <Modal.Container
                        className={classes.mobileContainer}
                        placement="top"
                        scroll="inside"
                    >
                        <Modal.Dialog
                            aria-label="Navigation"
                            className={classes.mobileDialog}
                            id="dashboard-sidebar"
                        >
                            <Modal.CloseTrigger aria-label="Close navigation" />
                            {contents}
                        </Modal.Dialog>
                    </Modal.Container>
                </Modal.Backdrop>
            ) : (
                opened && (
                    <aside
                        aria-label="Navigation"
                        className={classes.sidebarWrapper}
                        id="dashboard-sidebar"
                    >
                        {contents}
                    </aside>
                )
            )}
            <LayoutMain />
        </div>
    )
}
