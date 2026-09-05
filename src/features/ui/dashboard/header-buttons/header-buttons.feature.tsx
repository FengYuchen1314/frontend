import { Button } from '@heroui/react'
import { PiArrowsClockwise, PiSignOutDuotone } from 'react-icons/pi'
import { useNavigate } from 'react-router'

import { clearQueryClient } from '@shared/api'
import { ROUTES } from '@shared/constants'
import { logoutEvents } from '@shared/emitters'
import { resetAllStores } from '@shared/hocs/store-wrapper'
import {
    logoutFromHeader,
    refreshFromHeader
} from '@shared/ui/header-buttons/header-controls.model'
import { LanguagePicker } from '@shared/ui/language-picker/language-picker.shared'

export const HeaderButtons = () => {
    const navigate = useNavigate()

    const handleLogout = () => {
        logoutFromHeader(
            () => logoutEvents.emit(),
            () => navigate(ROUTES.AUTH.LOGIN)
        )
    }

    const handleRefresh = () => {
        refreshFromHeader(resetAllStores, clearQueryClient, () => navigate(0))
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <LanguagePicker />

            <Button
                aria-label="Refresh dashboard"
                isIconOnly
                onPress={handleRefresh}
                size="lg"
                variant="secondary"
            >
                <PiArrowsClockwise aria-hidden size={24} />
            </Button>

            <Button
                aria-label="Log out"
                isIconOnly
                onPress={handleLogout}
                size="lg"
                variant="secondary"
            >
                <PiSignOutDuotone aria-hidden size={24} />
            </Button>
        </div>
    )
}
