import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { app } from 'src/config'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'

import { formatPageTitle } from './page-title'

interface PageProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
    children: ReactNode
    meta?: ReactNode
    title: string
}

export const Page = forwardRef<HTMLDivElement, PageProps>(
    ({ children, title = '', meta, ...other }, ref) => {
        const { data: authStatus } = useGetAuthStatus()
        const reduceMotion = useReducedMotion()
        const pageTitle = formatPageTitle(title, authStatus?.branding.title, app.name)

        return (
            <>
                <title>{pageTitle}</title>
                {meta}

                <AnimatePresence mode="wait">
                    <motion.div
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        initial={reduceMotion ? false : { opacity: 0 }}
                        transition={{
                            duration: reduceMotion ? 0 : 0.3,
                            ease: 'easeInOut'
                        }}
                    >
                        <div ref={ref} {...other}>
                            {children}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </>
        )
    }
)
