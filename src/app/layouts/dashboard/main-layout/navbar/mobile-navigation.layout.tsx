import { Disclosure } from '@heroui/react'
import clsx from 'clsx'
import { PiArrowRight } from 'react-icons/pi'
import { Link, useLocation } from 'react-router'

import { useMobileMenuSections } from '../menu-sections/mobile-menu-sections'
import classes from './mobile-navigation.module.css'
import { isNavigationPathActive } from './navigation-model'

export const MobileNavigation = ({ onClose }: { onClose?: () => void }) => {
    const { pathname } = useLocation()
    const menu = useMobileMenuSections()

    return (
        <nav aria-label="Main navigation" className={classes.sections}>
            {menu.map((section) => (
                <section className={classes.section} key={section.id}>
                    <h2 className={classes.sectionTitle}>{section.header}</h2>
                    <div className={classes.links}>
                        {section.section.map((item) =>
                            item.dropdownItems ? (
                                <Disclosure
                                    defaultExpanded={item.dropdownItems.some((child) =>
                                        isNavigationPathActive(pathname, child.href)
                                    )}
                                    key={item.id}
                                >
                                    <Disclosure.Heading level={3}>
                                        <Disclosure.Trigger className={classes.sectionLink}>
                                            <span aria-hidden>{item.icon && <item.icon />}</span>
                                            <span>{item.name}</span>
                                            <Disclosure.Indicator className="ms-auto" />
                                        </Disclosure.Trigger>
                                    </Disclosure.Heading>
                                    <Disclosure.Content>
                                        {item.dropdownItems.map((child) => (
                                            <Link
                                                aria-current={
                                                    isNavigationPathActive(pathname, child.href)
                                                        ? 'page'
                                                        : undefined
                                                }
                                                className={clsx(
                                                    classes.sectionLink,
                                                    classes.childLink
                                                )}
                                                key={child.id}
                                                onClick={onClose}
                                                to={child.href}
                                            >
                                                <span aria-hidden>
                                                    {child.icon ? <child.icon /> : <PiArrowRight />}
                                                </span>
                                                <span>{child.name}</span>
                                            </Link>
                                        ))}
                                    </Disclosure.Content>
                                </Disclosure>
                            ) : (
                                <Link
                                    aria-current={
                                        isNavigationPathActive(pathname, item.href, item.newTab)
                                            ? 'page'
                                            : undefined
                                    }
                                    className={classes.sectionLink}
                                    key={item.id}
                                    onClick={onClose}
                                    rel={item.newTab ? 'noopener noreferrer' : undefined}
                                    target={item.newTab ? '_blank' : undefined}
                                    to={item.href}
                                >
                                    <span aria-hidden>{item.icon && <item.icon />}</span>
                                    <span>{item.name}</span>
                                </Link>
                            )
                        )}
                    </div>
                </section>
            ))}
        </nav>
    )
}
