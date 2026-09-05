import { ActionIcon, Group } from '@mantine/core'
import { PiArrowsClockwise, PiSignOutDuotone } from 'react-icons/pi'
import { useNavigate } from 'react-router'

import { clearQueryClient } from '@shared/api'
import { ROUTES } from '@shared/constants'
import { logoutEvents } from '@shared/emitters'
import { resetAllStores } from '@shared/hocs/store-wrapper'
import { LanguagePicker } from '@shared/ui/language-picker/language-picker.shared'

export const HeaderButtons = () => {
    const navigate = useNavigate()

    const handleLogout = () => {
        logoutEvents.emit()
        navigate(ROUTES.AUTH.LOGIN)
    }

    const handleRefresh = () => {
        resetAllStores()
        clearQueryClient()
        navigate(0)
    }

    return (
        <Group grow preventGrowOverflow={false} wrap="wrap">
            <LanguagePicker />

            <ActionIcon color="gray" onClick={handleRefresh} size="xl">
                <PiArrowsClockwise size="24px" />
            </ActionIcon>

            <ActionIcon color="cyan" onClick={handleLogout} size="xl">
                <PiSignOutDuotone size="24px" />
            </ActionIcon>
        </Group>
    )
}
