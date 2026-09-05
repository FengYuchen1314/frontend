import type { HTMLAttributes } from 'react'

import { GithubControl } from './GithubControl'
import { LanguageControl } from './LanguageControl'
import { LogoutControl } from './LogoutControl'
import { PrimeControl } from './PrimeControl'
import { RecapControl } from './RecapControl'
import { SupportControl } from './SupportControl'
import { TelegramControl } from './TelegramControl'
import { VersionControl } from './VersionControl'

interface HeaderControlsProps extends HTMLAttributes<HTMLDivElement> {
    githubLink?: string
    isGithubLoading?: boolean
    stars?: number
    telegramLink: string
    withGithub?: boolean
    withLanguage?: boolean
    withLogout?: boolean
    withPrime?: boolean
    withRecap?: boolean
    withSupport?: boolean
    withTelegram?: boolean
    withVersion?: boolean
}

export function HeaderControls({
    githubLink,
    withGithub = true,
    withTelegram = true,
    withSupport = true,
    withLogout = true,
    withLanguage = true,
    withVersion = true,
    withRecap = false,
    withPrime = false,
    telegramLink,
    stars,
    isGithubLoading,
    className = '',
    ...others
}: HeaderControlsProps) {
    return (
        <div className={`flex flex-wrap items-center gap-2 ${className}`} {...others}>
            {withTelegram && <TelegramControl link={telegramLink} />}
            {withPrime && <PrimeControl />}
            {withSupport && <SupportControl />}

            {withVersion && <VersionControl />}
            {withGithub && githubLink && (
                <GithubControl isLoading={isGithubLoading} link={githubLink} stars={stars} />
            )}
            {withRecap && <RecapControl />}
            {withLanguage && <LanguageControl />}
            {withLogout && <LogoutControl />}
        </div>
    )
}
