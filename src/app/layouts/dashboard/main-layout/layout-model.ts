export function resolveDashboardLayout(isMobile: boolean, legacy: boolean, isHiRes: boolean) {
    if (isMobile) return 'mobile'
    if (legacy) return 'sidebar'
    return isHiRes ? 'compact-wide' : 'compact'
}
