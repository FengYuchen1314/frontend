import type { ComponentPropsWithoutRef } from 'react'

import clsx from 'clsx'
import { Outlet, ScrollRestoration } from 'react-router'

import { SidebarLogoShared } from '@shared/ui/sidebar/sidebar-logo'
import { SidebarTitleShared } from '@shared/ui/sidebar/sidebar-title'

import classes from './layout.module.css'

export const DASHBOARD_LINKS = {
    githubLink: 'https://github.com/remnawave/panel',
    telegramLink: 'https://t.me/remnawave'
} as const

export const LayoutMain = ({
    className,
    ...props
}: Omit<ComponentPropsWithoutRef<'main'>, 'children'>) => (
    <main className={clsx(classes.main, className)} id="dashboard-main" tabIndex={-1} {...props}>
        <Outlet />
        <ScrollRestoration />
    </main>
)

export const LayoutBrand = ({ className, ...props }: ComponentPropsWithoutRef<'div'>) => (
    <div className={clsx(classes.brand, className)} {...props}>
        <SidebarLogoShared />
        <SidebarTitleShared />
    </div>
)
