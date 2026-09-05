import { useState, type ReactNode } from 'react'

import { HeaderControls } from '@shared/ui/header-buttons'

import { IRemnawaveInfo } from '@entities/dashboard/updates-store'

import { DASHBOARD_LINKS } from '../layout-shared'
import { SidebarShellLayout } from './sidebar-shell.layout'

interface IProps {
    headerControls: ReactNode
    isLoadingUpdates: boolean
    isSocialButtons: boolean
    remnawaveInfo: IRemnawaveInfo
}

export const MobileLayout = ({
    headerControls,
    isLoadingUpdates,
    isSocialButtons,
    remnawaveInfo
}: IProps) => {
    const [opened, setOpened] = useState(false)
    return (
        <SidebarShellLayout
            mode="mobile"
            footer={
                isSocialButtons && (
                    <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 pt-4">
                        <HeaderControls
                            {...DASHBOARD_LINKS}
                            isGithubLoading={isLoadingUpdates}
                            stars={remnawaveInfo.starsCount || undefined}
                            withLanguage={false}
                            withLogout={false}
                            withVersion={false}
                        />
                    </div>
                )
            }
            headerControls={headerControls}
            opened={opened}
            onOpenChange={setOpened}
        />
    )
}
