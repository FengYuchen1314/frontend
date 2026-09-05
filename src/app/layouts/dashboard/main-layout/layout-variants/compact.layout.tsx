import type { CSSProperties, ReactNode } from 'react'

import { Separator } from '@heroui/react'

import { LayoutBrand, LayoutMain } from '../layout-shared'
import classes from '../layout.module.css'
import { DesktopNavigation } from '../navbar/desktop-navigation.layout'

interface IProps {
    headerControls: ReactNode
    isHiResDesktop: boolean
}

export const CompactLayout = ({ headerControls, isHiResDesktop }: IProps) => (
    <div
        className={classes.shell}
        data-layout={isHiResDesktop ? 'compact-wide' : 'compact'}
        style={
            { '--app-shell-header-height': isHiResDesktop ? '4rem' : '7.25rem' } as CSSProperties
        }
    >
        <a className={classes.skipLink} href="#dashboard-main">
            Skip to content
        </a>
        <header className={classes.header}>
            <div className={classes.brandRow}>
                <div className={classes.brandAndNavigation}>
                    <LayoutBrand />
                    {isHiResDesktop && (
                        <>
                            <Separator className={classes.brandSeparator} orientation="vertical" />
                            <DesktopNavigation />
                        </>
                    )}
                </div>
                <div className={classes.headerControls}>{headerControls}</div>
            </div>
            {!isHiResDesktop && (
                <div className={classes.navRowDesktop}>
                    <DesktopNavigation />
                </div>
            )}
        </header>
        <LayoutMain className={isHiResDesktop ? classes.wideMain : undefined} />
    </div>
)
