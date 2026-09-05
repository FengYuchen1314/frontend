import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { parseColoredTextUtil } from '@shared/utils/misc/parse-colored-text'

import classes from './sidebar.module.css'

export const SidebarTitleShared = () => {
    const { data: authStatus } = useGetAuthStatus()
    const titleParts = authStatus?.branding.title
        ? parseColoredTextUtil(authStatus.branding.title, 'var(--foreground)')
        : [
              { text: 'Remna', color: 'var(--accent)' },
              { text: 'wave', color: 'var(--foreground)' }
          ]
    return (
        <span className={classes.logoTitle}>
            {titleParts.map((part, index) => (
                <span key={index} style={{ color: part.color || 'var(--foreground)' }}>
                    {part.text}
                </span>
            ))}
        </span>
    )
}
