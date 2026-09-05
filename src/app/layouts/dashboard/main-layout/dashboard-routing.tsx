import type { ReactNode } from 'react'

import { RouterProvider as AriaRouterProvider } from 'react-aria-components'
import { useHref, useNavigate } from 'react-router'

function useAriaHref(href: string) {
    // React Router's Link handles absolute URLs, but its useHref hook treats
    // them as route-relative paths. Aria invokes this hook for external links too.
    const routed = useHref(href)
    return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href) ? href : routed
}

export function DashboardRouting({ children }: { children: ReactNode }) {
    const navigate = useNavigate()
    return (
        <AriaRouterProvider navigate={navigate} useHref={useAriaHref}>
            {children}
        </AriaRouterProvider>
    )
}
