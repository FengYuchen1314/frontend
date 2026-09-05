import { Link } from 'react-router'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { ROUTES } from '@shared/constants/routes'

import { Logo } from '../logo'
import classes from './sidebar.module.css'

export const SidebarLogoShared = () => {
    const { data: authStatus } = useGetAuthStatus()
    return (
        <Link aria-label="Home" className={classes.logoLink} to={ROUTES.DASHBOARD.HOME}>
            {authStatus?.branding.logoUrl ? (
                <img
                    alt=""
                    className={classes.brandImage}
                    key={authStatus.branding.logoUrl}
                    onError={(event) => {
                        if (event.currentTarget.dataset.fallbackApplied) return
                        event.currentTarget.dataset.fallbackApplied = 'true'
                        event.currentTarget.src = '/favicons/logo.svg'
                    }}
                    src={authStatus.branding.logoUrl}
                />
            ) : (
                <Logo aria-hidden color="var(--accent)" size="2.5rem" />
            )}
        </Link>
    )
}
