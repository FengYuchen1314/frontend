import { Button } from '@heroui/react'
import clsx from 'clsx'
import { TbArrowsMaximize, TbArrowsMinimize } from 'react-icons/tb'

import styles from './Fullscreen.module.css'

interface IProps {
    className?: string
    floating?: boolean
    iconSize?: number
    isFullscreen: boolean
    onToggle: () => void
    size?: number
    isDisabled?: boolean
}

export function FullscreenToggleButton(props: IProps) {
    const {
        className,
        floating = true,
        iconSize = 18,
        isFullscreen,
        onToggle,
        size = 36,
        isDisabled
    } = props

    return (
        <Button
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
            className={clsx(floating && styles.button, className)}
            isDisabled={isDisabled}
            isIconOnly
            onPress={onToggle}
            style={{ width: size, height: size, minWidth: size }}
            variant="secondary"
        >
            {isFullscreen ? (
                <TbArrowsMinimize size={iconSize} />
            ) : (
                <TbArrowsMaximize size={iconSize} />
            )}
        </Button>
    )
}

export { styles as fullscreenClasses }
