import { Alert, Spinner } from '@heroui/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { PiWifiSlash } from 'react-icons/pi'

import { useConnectionProbe } from './use-connection-probe'

export function ConnectionStatusOverlay() {
    const { t } = useTranslation()

    const { isOnline } = useConnectionProbe()
    const reduceMotion = useReducedMotion()

    return (
        <AnimatePresence>
            {!isOnline && (
                <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    className="pointer-events-none fixed inset-x-0 top-4 z-[10000] flex justify-center px-4"
                    exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                    transition={{ duration: reduceMotion ? 0 : 0.15 }}
                >
                    <Alert className="w-fit max-w-full shadow-xl" role="status" status="danger">
                        <Alert.Indicator>
                            <PiWifiSlash aria-hidden size={20} />
                        </Alert.Indicator>
                        <Alert.Content>
                            <Alert.Title>
                                {t('connection-status-overlay.connection-lost')}
                            </Alert.Title>
                            <Alert.Description className="flex items-center gap-2">
                                <Spinner aria-hidden color="danger" size="sm" />
                                {t('connection-status-overlay.reconnecting')}
                            </Alert.Description>
                        </Alert.Content>
                    </Alert>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
