import type { ComponentProps } from 'react'

import { Button, Link } from '@heroui/react'

import { safeExternalUrl } from './header-controls.model'

const controlClassName =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold shadow-sm transition-colors'

export type HeaderControlProps = Omit<ComponentProps<typeof Button>, 'className'> & {
    className?: string
}

export function HeaderControl({ className = '', ...props }: HeaderControlProps) {
    return <Button className={`${controlClassName} ${className}`} variant="secondary" {...props} />
}

export function HeaderLink({
    href,
    children,
    className = '',
    ...props
}: Omit<ComponentProps<typeof Link>, 'className'> & { className?: string }) {
    const safeHref = safeExternalUrl(href)
    return (
        <Link
            className={`${controlClassName} ${className}`}
            href={safeHref}
            isDisabled={!safeHref}
            rel="noopener noreferrer"
            target="_blank"
            {...props}
        >
            {children}
        </Link>
    )
}
