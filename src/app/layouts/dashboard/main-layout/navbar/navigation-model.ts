import type { MenuItem } from '../menu-sections/interfaces/menu-item.interface'

import { matchPath } from 'react-router'

type NavigationLink = Pick<MenuItem['section'][number], 'id' | 'href' | 'name' | 'newTab'> & {
    icon?: MenuItem['section'][number]['icon']
    group?: string
}

export function isNavigationPathActive(pathname: string, href: string, external = false) {
    return (
        !external &&
        href.startsWith('/') &&
        matchPath({ path: href, end: false }, pathname) !== null
    )
}

export function isNavigationSectionActive(pathname: string, section: MenuItem) {
    return section.section.some((item) =>
        item.dropdownItems
            ? item.dropdownItems.some((child) =>
                  isNavigationPathActive(pathname, child.href, item.newTab)
              )
            : isNavigationPathActive(pathname, item.href, item.newTab)
    )
}

export function navigationSectionLanding(section: MenuItem) {
    const first = section.section.find((item) => !item.newTab)
    return first?.dropdownItems?.[0]?.href ?? first?.href
}

export function flattenNavigationSection(section: MenuItem) {
    return section.section.flatMap<NavigationLink>((item) =>
        item.dropdownItems
            ? item.dropdownItems.map((child) => ({
                  ...child,
                  id: item.id + '/' + child.id,
                  group: item.name,
                  newTab: item.newTab
              }))
            : [{ ...item, group: undefined }]
    )
}

export function nextNavigationIndex(key: string, current: number, length: number, rtl: boolean) {
    if (length === 0) return null
    if (key === 'Home') return 0
    if (key === 'End') return length - 1
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
    const delta = (key === 'ArrowRight') !== rtl ? 1 : -1
    return (current + delta + length) % length
}
