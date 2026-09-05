import { TbHeartFilled } from 'react-icons/tb'

import { HeaderLink } from './HeaderControl'

export function SupportControl() {
    return (
        <HeaderLink
            aria-label="Support Remnawave"
            className="text-danger"
            href="https://docs.rw/docs/donate"
            rel="noopener noreferrer"
            target="_blank"
        >
            <TbHeartFilled aria-hidden size={22} />
        </HeaderLink>
    )
}
