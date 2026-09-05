import {
    HELP_DRAWER_AVAILABLE_SCREENS,
    type THelpDrawerAvailableScreen
} from '../help-drawer.types'

const supportedLanguages = new Set(['en', 'fa', 'ru', 'zh'])
export function helpLanguage(language: string) {
    const base = language.toLowerCase().split(/[-_]/)[0]
    return supportedLanguages.has(base) ? base : 'en'
}
export function resolveDocsUrl(screen: THelpDrawerAvailableScreen, language: string) {
    if (!Object.values(HELP_DRAWER_AVAILABLE_SCREENS).includes(screen))
        throw new Error('Unknown help article')
    return `https://raw.githubusercontent.com/remnawave/panel/refs/heads/main/_panel-docs/help-articles/${helpLanguage(language)}/${screen}.md`
}
export async function loadHelpArticle(
    screen: THelpDrawerAvailableScreen,
    language: string,
    signal: AbortSignal,
    fetcher: typeof fetch = fetch
) {
    const preferred = helpLanguage(language)
    for (const candidate of preferred === 'en' ? ['en'] : [preferred, 'en']) {
        signal.throwIfAborted()
        try {
            const response = await fetcher(resolveDocsUrl(screen, candidate), { signal })
            if (!response.ok) throw new Error(`Documentation request failed (${response.status})`)
            const content = await response.text()
            signal.throwIfAborted()
            return { content, language: candidate }
        } catch (error) {
            signal.throwIfAborted()
            if (candidate === 'en') throw error
        }
    }
    throw new Error('Documentation unavailable')
}
