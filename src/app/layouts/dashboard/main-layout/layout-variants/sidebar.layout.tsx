import { useState, type ReactNode } from 'react'

import { SidebarShellLayout } from './sidebar-shell.layout'

export const SidebarLayout = ({ headerControls }: { headerControls: ReactNode }) => {
    const [opened, setOpened] = useState(true)
    return (
        <SidebarShellLayout
            mode="desktop"
            headerControls={headerControls}
            opened={opened}
            onOpenChange={setOpened}
        />
    )
}
