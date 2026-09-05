import './hero.css'
import '@mantine/carousel/styles.css'
import '@mantine/charts/styles.css'
import '@mantine/code-highlight/styles.css'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/dropzone/styles.css'
import '@mantine/notifications/styles.css'
import '@mantine/spotlight/styles.css'
import '@kastov/mantine-react-table-open/styles.css'
import '@kastov/mantine-datatable/styles.css'
import './global.css'
import { Toast } from '@heroui/react'
import { DirectionProvider, MantineProvider, v8CssVariablesResolver } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { I18nProvider as AriaI18nProvider } from '@react-aria/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
// import { hideSplashScreen } from 'vite-plugin-splash-screen/runtime'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { Suspense, useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'

import { theme } from '@shared/constants'
import { useAppearance } from '@shared/hocs/appearance/use-appearance'
import { AuthProvider } from '@shared/hocs/auth-provider'
// import { StrictMode } from 'react'
import { IsMobileProvider } from '@shared/hocs/is-mobile-provider'
import { LoadingScreen } from '@shared/ui'
import { ConnectionStatusOverlay } from '@shared/ui/connection-status-overlay'
import { NavigationProgressBar } from '@shared/ui/page/navigation-progress-bar'

import i18n from './app/i18n/i18n'
import { useAppLocale } from './app/i18n/use-app-locale'
import { Router } from './app/router/router'
import { initConnectionWatchdog, queryClient } from './shared/api'

dayjs.extend(customParseFormat)

polyfillCountryFlagEmojis()

initConnectionWatchdog()

export function App() {
    const isDev = __NODE_ENV__ === 'development'
    const appearance = useAppearance()
    const locale = useAppLocale()

    useEffect(() => {
        document.documentElement.dataset.theme = appearance
        document.documentElement.classList.toggle('dark', appearance === 'dark')
        document.documentElement.classList.toggle('light', appearance === 'light')
    }, [appearance])

    useEffect(() => {
        document.documentElement.lang = locale
        document.documentElement.dir = i18n.dir(locale)
    }, [locale])

    useEffect(() => {
        const root = document.getElementById('root')
        if (root) {
            const bottomBar = document.createElement('div')
            bottomBar.className = 'safe-area-bottom'
            root.appendChild(bottomBar)
            return () => bottomBar.remove()
        }
    }, [])

    // useEffect(() => {
    //     hideSplashScreen()
    // }, [])

    return (
        // <StrictMode>
        <I18nextProvider defaultNS="" i18n={i18n}>
            <AriaI18nProvider locale={locale}>
                <QueryClientProvider client={queryClient}>
                    {isDev && <ReactQueryDevtools initialIsOpen={false} />}
                    <AuthProvider>
                        <IsMobileProvider>
                            <DirectionProvider>
                                <MantineProvider
                                    cssVariablesResolver={v8CssVariablesResolver}
                                    defaultColorScheme="dark"
                                    forceColorScheme={appearance}
                                    theme={theme}
                                    deduplicateInlineStyles
                                >
                                    <ModalsProvider>
                                        <Notifications position="top-right" />
                                        <Toast.Provider placement="top end" />
                                        <ConnectionStatusOverlay />
                                        <NavigationProgressBar />
                                        <Suspense
                                            fallback={
                                                <div className="flex h-full items-center justify-center">
                                                    <LoadingScreen height="60vh" />
                                                </div>
                                            }
                                        >
                                            <Router />
                                        </Suspense>
                                    </ModalsProvider>
                                </MantineProvider>
                            </DirectionProvider>
                        </IsMobileProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </AriaI18nProvider>
        </I18nextProvider>
        // </StrictMode>
    )
}
