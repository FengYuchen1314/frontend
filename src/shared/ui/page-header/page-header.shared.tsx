import { Button, Card } from '@heroui/react'
import { motion } from 'motion/react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import classes from './page-header.module.css'
import { usePageHeaderCopy } from './use-page-header-copy'

export interface PageHeaderSharedProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    actions?: ReactNode
    customThemeIcon?: ReactNode
    description?: string
    icon?: ReactNode
    title: ReactNode
    wrapActions?: boolean
}

const entrance = {
    animate: { opacity: 1, y: 0 },
    initial: { opacity: 0, y: -10 },
    transition: { duration: 0.5, ease: [0, 0.71, 0.2, 1.01] as const }
}

export const PageHeaderShared = forwardRef<HTMLDivElement, PageHeaderSharedProps>(
    function PageHeaderShared(
        {
            icon,
            title,
            description,
            actions,
            customThemeIcon,
            wrapActions = false,
            className = '',
            children,
            ...props
        },
        ref
    ) {
        const { t } = useTranslation()
        const copy = usePageHeaderCopy(description)

        return (
            <Card className={`${classes.card} ${className}`} ref={ref} {...props}>
                <motion.div {...entrance} className={classes.headerWrapper}>
                    <div className={classes.contentSection}>
                        <motion.div {...entrance} className={classes.iconSection}>
                            {customThemeIcon || (
                                <span aria-hidden="true" className={classes.icon}>
                                    {icon}
                                </span>
                            )}
                        </motion.div>
                        <div className={classes.headingSection}>
                            <motion.div {...entrance}>
                                <h4 className={classes.title}>{title}</h4>
                            </motion.div>
                            {description && (
                                <motion.div {...entrance}>
                                    <Button
                                        aria-label={`${t('common.action.copy')}: ${description}`}
                                        className={classes.description}
                                        onPress={() => void copy()}
                                        variant="ghost"
                                    >
                                        <span>{description}</span>
                                    </Button>
                                </motion.div>
                            )}
                        </div>
                    </div>
                    {actions && (
                        <motion.div {...entrance} className={classes.actionsSection}>
                            <div className={classes.actions} data-wrap={wrapActions}>
                                {actions}
                            </div>
                        </motion.div>
                    )}
                </motion.div>
                {children}
            </Card>
        )
    }
)
