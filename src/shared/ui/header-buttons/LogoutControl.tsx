import { PiSignOut } from 'react-icons/pi'
import { useNavigate } from 'react-router'

import { ROUTES } from '@shared/constants'
import { logoutEvents } from '@shared/emitters'

import { logoutFromHeader } from './header-controls.model'
import { HeaderControl } from './HeaderControl'

export function LogoutControl() {
    const navigate = useNavigate()

    const handleLogout = () => {
        logoutFromHeader(
            () => logoutEvents.emit(),
            () => navigate(ROUTES.AUTH.LOGIN)
        )
    }

    return (
        <HeaderControl aria-label="Log out" isIconOnly onPress={handleLogout}>
            <PiSignOut aria-hidden size={22} />
        </HeaderControl>
    )
}
