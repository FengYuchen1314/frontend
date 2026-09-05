import { Link } from '@heroui/react'
import {
    IconCrownFilled,
    IconHeadset,
    IconMessageCircle2,
    IconRoute,
    IconUsersGroup
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import classes from './PrimeModal.module.css'

const PRIME_LINK = 'https://docs.rw/prime'

const FEATURES = [
    {
        icon: IconHeadset,
        titleKey: 'prime-modal.shared.priority-support-title',
        descriptionKey: 'prime-modal.shared.priority-support-description'
    },
    {
        icon: IconUsersGroup,
        titleKey: 'prime-modal.shared.private-community-title',
        descriptionKey: 'prime-modal.shared.private-community-description'
    },
    {
        icon: IconRoute,
        titleKey: 'prime-modal.shared.shape-the-roadmap-title',
        descriptionKey: 'prime-modal.shared.shape-the-roadmap-description'
    },
    {
        icon: IconMessageCircle2,
        titleKey: 'prime-modal.shared.direct-developer-access-title',
        descriptionKey: 'prime-modal.shared.direct-developer-access-description'
    }
] as const

export function PrimeModalContent() {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-6 pb-1">
            <div className={classes.hero}>
                <div className={classes.crownRing}>
                    <IconCrownFilled size={36} />
                </div>

                <h2 className={`${classes.title} mt-1 text-2xl`}>RW Prime</h2>
                <p className="mt-2 max-w-[380px] text-sm text-muted">
                    {t('prime-modal.shared.description')}
                </p>
            </div>

            <div className="flex flex-col gap-4">
                {FEATURES.map((feature) => (
                    <div className="flex items-start gap-4" key={feature.titleKey}>
                        <div className={classes.featureIcon}>
                            <feature.icon size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold">{t(feature.titleKey)}</h3>
                            <p className="text-xs text-muted">{t(feature.descriptionKey)}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div>
                <Link
                    className={`${classes.joinButton} flex w-full items-center justify-center gap-2 rounded-xl p-3`}
                    href={PRIME_LINK}
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    <IconCrownFilled aria-hidden size={18} />
                    {t('prime-modal.shared.join-button')}
                </Link>
            </div>
        </div>
    )
}
