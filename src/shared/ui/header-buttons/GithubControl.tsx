import { Spinner } from '@heroui/react'
import { TbBrandGithub, TbStar } from 'react-icons/tb'

import { HeaderLink } from './HeaderControl'

interface GithubControlProps {
    isLoading?: boolean
    link: string
    stars?: number
}

export function GithubControl({
    link,
    stars,
    isLoading,

    ...others
}: GithubControlProps) {
    return (
        <HeaderLink
            aria-label="GitHub"
            href={link}
            rel="noopener noreferrer"
            target="_blank"
            {...others}
        >
            <span className="flex items-center gap-2">
                <TbBrandGithub aria-hidden size={22} />
                {isLoading ? (
                    <span className="flex items-center gap-2">
                        <TbStar aria-hidden className="text-warning" size={16} />
                        <Spinner aria-label="Loading GitHub stars" size="sm" />
                    </span>
                ) : (
                    stars !== undefined && (
                        <span className="flex items-center gap-1">
                            <TbStar aria-hidden className="text-warning" size={16} />
                            {stars}
                        </span>
                    )
                )}
            </span>
        </HeaderLink>
    )
}
