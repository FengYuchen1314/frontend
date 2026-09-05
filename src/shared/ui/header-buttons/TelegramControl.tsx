import { PiTelegramLogoBold } from 'react-icons/pi'

import { HeaderLink } from './HeaderControl'

interface TelegramControlProps {
    link: string
}

export function TelegramControl({ link, ...others }: TelegramControlProps) {
    return (
        <HeaderLink
            aria-label="Telegram community"
            className="text-accent"
            href={link}
            rel="noopener noreferrer"
            target="_blank"
            {...others}
        >
            <PiTelegramLogoBold aria-hidden size={22} />
        </HeaderLink>
    )
}
