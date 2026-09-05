import { rem } from '@mantine/core'
import { PiSignOut } from 'react-icons/pi'
import { useNavigate } from 'react-router'

import { ROUTES } from '@shared/constants'
import { logoutEvents } from '@shared/emitters'

import { HeaderControl } from './HeaderControl'
import classes from './LogoutControl.module.css'

export function LogoutControl() {
    const navigate = useNavigate()

    const handleLogout = () => {
        logoutEvents.emit()
        navigate(ROUTES.AUTH.LOGIN)
    }

    return (
        <HeaderControl className={classes.logout} onClick={handleLogout}>
            <PiSignOut style={{ width: rem(22), height: rem(22) }} />
        </HeaderControl>
    )
}
