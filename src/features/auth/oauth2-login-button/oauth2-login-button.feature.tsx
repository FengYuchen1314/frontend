import type { IProps } from './interfaces/props.interface'
import type { TOAuth2ProvidersKeys } from '@remnawave/backend-contract'

import { Button, Spinner } from '@heroui/react'
import { BiLogoGithub, BiLogoTelegram } from 'react-icons/bi'
import { SiKeycloak } from 'react-icons/si'
import { TbKey } from 'react-icons/tb'

import { PocketidLogo } from '@shared/ui/logos/pockeid-logo'
import { YandexLogo } from '@shared/ui/logos/yandex-logo'

import { oauthProviders } from './model/oauth-providers'
import { useOAuth2Login } from './model/use-oauth2-login'

function ProviderIcon({ provider }: { provider: TOAuth2ProvidersKeys }) {
    if (provider === 'telegram') return <BiLogoTelegram aria-hidden="true" size={20} />
    if (provider === 'github') return <BiLogoGithub aria-hidden="true" size={20} />
    if (provider === 'keycloak') return <SiKeycloak aria-hidden="true" size={20} />
    if (provider === 'pocketid') return <PocketidLogo aria-hidden="true" size={20} />
    if (provider === 'yandex') return <YandexLogo aria-hidden="true" size={20} />
    return <TbKey aria-hidden="true" size={20} />
}

export const OAuth2LoginButtonsFeature = ({ authentication }: IProps) => {
    const { loadingProvider, login } = useOAuth2Login()
    return (
        <div className="flex w-full flex-col gap-3">
            {oauthProviders
                .filter(({ id }) => authentication.oauth2.providers[id])
                .map(({ id, label, color }) => (
                    <Button
                        key={id}
                        variant="primary"
                        isPending={loadingProvider === id}
                        isDisabled={loadingProvider !== null && loadingProvider !== id}
                        onPress={() => {
                            void login(id)
                        }}
                        className="w-full text-white"
                        style={{ backgroundColor: color }}
                    >
                        {loadingProvider === id ? (
                            <Spinner size="sm" color="current" />
                        ) : (
                            <ProviderIcon provider={id} />
                        )}
                        {label}
                    </Button>
                ))}
        </div>
    )
}
