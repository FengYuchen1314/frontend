import type { ElementType, ReactNode } from 'react'

import { Button, Dropdown, Header, Label } from '@heroui/react'
import clsx from 'clsx'
import { useContext, useState } from 'react'
import { RootMenuTriggerStateContext } from 'react-aria-components/Menu'
import { PiCaretDownBold } from 'react-icons/pi'
import { Link, useLocation } from 'react-router'

import { useDesktopMenuSections } from '../menu-sections/desktop-menu-sections'
import classes from './desktop-navigation.module.css'
import {
    flattenNavigationSection,
    isNavigationPathActive,
    isNavigationSectionActive,
    navigationSectionLanding,
    nextNavigationIndex
} from './navigation-model'
import { useNavigationMenu } from './use-navigation-menu'

const NavIcon = ({ icon: Icon }: { icon?: ElementType }) =>
    Icon ? (
        <span aria-hidden className={classes.icon}>
            <Icon />
        </span>
    ) : null

function SectionLandingLink({
    href,
    className,
    onClick,
    onKeyboardOpen,
    children
}: {
    href: string
    className: string
    onClick: () => void
    onKeyboardOpen: () => void
    children: ReactNode
}) {
    const menu = useContext(RootMenuTriggerStateContext)
    return (
        <Link
            className={className}
            data-dashboard-nav-trigger
            to={href}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && menu?.isOpen) {
                    event.preventDefault()
                    menu.close()
                    return
                }
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                event.preventDefault()
                menu?.open(event.key === 'ArrowUp' ? 'last' : 'first')
                // The previous menu can still exist during its exit animation.
                // Give an explicit keyboard opening a fresh autofocus lifecycle.
                onKeyboardOpen()
            }}
        >
            {children}
        </Link>
    )
}

export const DesktopNavigation = () => {
    const { pathname } = useLocation()
    const menu = useDesktopMenuSections()
    const state = useNavigationMenu()
    const [keyboardOpening, setKeyboardOpening] = useState({ section: '', key: 0 })

    return (
        <nav
            aria-label="Main navigation"
            className={classes.navBar}
            onKeyDown={(event) => {
                if (!(event.target instanceof HTMLElement)) return
                const triggers = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                        '[data-dashboard-nav-trigger]'
                    )
                )
                const current = triggers.indexOf(event.target)
                if (current < 0) return
                const next = nextNavigationIndex(
                    event.key,
                    current,
                    triggers.length,
                    document.documentElement.dir === 'rtl'
                )
                if (next === null) return
                event.preventDefault()
                triggers[next]?.focus()
            }}
        >
            {menu.map((section, index) => {
                const sectionId = section.id ?? String(index)
                const active = isNavigationSectionActive(pathname, section)
                const landing = navigationSectionLanding(section)
                const single =
                    section.section.length === 1 &&
                    !section.section[0].dropdownItems &&
                    !section.section[0].newTab
                        ? section.section[0]
                        : null
                const groups = section.section.map((item) => ({
                    label: item.dropdownItems ? item.name : undefined,
                    id: item.id,
                    items: flattenNavigationSection({ ...section, section: [item] })
                }))
                return single ? (
                    <Link
                        aria-current={active ? 'page' : undefined}
                        className={clsx(classes.navItem, active && classes.navItemActive)}
                        data-dashboard-nav-trigger
                        key={sectionId}
                        to={single.href}
                    >
                        <NavIcon icon={section.icon ?? single.icon} />
                        <span>{section.header}</span>
                    </Link>
                ) : (
                    <Dropdown
                        isOpen={state.openId === sectionId}
                        key={sectionId}
                        onOpenChange={(open) => state.setOpen(sectionId, open)}
                    >
                        <div
                            className={classes.sectionEntry}
                            onPointerEnter={(event) => {
                                if (event.pointerType === 'mouse') state.setOpen(sectionId, true)
                            }}
                            onPointerLeave={(event) => {
                                if (event.pointerType === 'mouse') state.scheduleClose(sectionId)
                            }}
                        >
                            {landing && (
                                <SectionLandingLink
                                    className={clsx(
                                        classes.navItem,
                                        active && classes.navItemActive
                                    )}
                                    href={landing}
                                    onClick={() => state.setOpen(sectionId, false)}
                                    onKeyboardOpen={() =>
                                        setKeyboardOpening((current) => ({
                                            section: sectionId,
                                            key: current.key + 1
                                        }))
                                    }
                                >
                                    <NavIcon icon={section.icon} />
                                    <span>{section.header}</span>
                                </SectionLandingLink>
                            )}
                            <Button
                                aria-label={section.header ?? 'Navigation'}
                                className={clsx(
                                    classes.navItem,
                                    landing && classes.caretButton,
                                    active && classes.navItemActive
                                )}
                                data-dashboard-nav-trigger
                                variant="ghost"
                            >
                                {!landing && (
                                    <>
                                        <NavIcon icon={section.icon} />
                                        <span>{section.header}</span>
                                    </>
                                )}
                                <PiCaretDownBold aria-hidden size={11} />
                            </Button>
                        </div>
                        <Dropdown.Popover
                            className={classes.popover}
                            onPointerEnter={state.cancelClose}
                            onPointerLeave={() => state.scheduleClose(sectionId)}
                            placement="bottom end"
                            isNonModal
                        >
                            <Dropdown.Menu
                                aria-label={section.header ?? 'Navigation'}
                                key={
                                    keyboardOpening.section === sectionId ? keyboardOpening.key : 0
                                }
                            >
                                {groups.map((group) => (
                                    <Dropdown.Section
                                        key={group.id}
                                        aria-label={group.label ?? section.header}
                                    >
                                        {group.label && <Header>{group.label}</Header>}
                                        {group.items.map((item) => (
                                            <Dropdown.Item
                                                aria-current={
                                                    isNavigationPathActive(
                                                        pathname,
                                                        item.href,
                                                        item.newTab
                                                    )
                                                        ? 'page'
                                                        : undefined
                                                }
                                                className={
                                                    isNavigationPathActive(
                                                        pathname,
                                                        item.href,
                                                        item.newTab
                                                    )
                                                        ? classes.menuItemActive
                                                        : undefined
                                                }
                                                href={item.href}
                                                id={item.id}
                                                key={item.id}
                                                rel={
                                                    item.newTab ? 'noopener noreferrer' : undefined
                                                }
                                                target={item.newTab ? '_blank' : undefined}
                                                textValue={item.name}
                                            >
                                                <NavIcon icon={item.icon} />
                                                <Label>{item.name}</Label>
                                            </Dropdown.Item>
                                        ))}
                                    </Dropdown.Section>
                                ))}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                )
            })}
        </nav>
    )
}
