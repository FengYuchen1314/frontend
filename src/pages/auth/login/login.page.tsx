import { LoginFormFeature } from '@features/auth/login-form'
import { getAuthMethods } from '@features/auth/login-form/model/auth-methods'
import { OAuth2LoginButtonsFeature } from '@features/auth/oauth2-login-button/oauth2-login-button.feature'
import { PasskeyLoginButtonFeature } from '@features/auth/passkey-login-button'
import { RegisterFormFeature } from '@features/auth/register-form'
import { Alert, Button, Card, Separator, Spinner } from '@heroui/react'
import { useMemo } from 'react'

import { useGetAuthStatus } from '@shared/api/hooks/auth/auth.query.hooks'
import { Logo } from '@shared/ui/logo'
import { Page } from '@shared/ui/page'
import { parseColoredTextUtil } from '@shared/utils/misc/parse-colored-text'

export const LoginPage = () => {
    const { data: authStatus, isPending, refetch } = useGetAuthStatus()
    const methods = getAuthMethods(authStatus)
    const brandingTitle = authStatus?.branding.title
    const titleParts = useMemo(
        () =>
            brandingTitle
                ? parseColoredTextUtil(brandingTitle, 'var(--foreground)')
                : [
                      { text: 'Remna', color: 'var(--accent)' },
                      { text: 'wave', color: 'var(--foreground)' }
                  ],
        [brandingTitle]
    )

    return (
        <Page title="Login">
            <div className="flex w-full flex-col items-center gap-7">
                <header className="flex max-w-full items-center justify-center gap-2">
                    {authStatus?.branding.logoUrl ? (
                        <img
                            src={authStatus.branding.logoUrl}
                            alt="logo"
                            className="h-10 w-10 shrink-0 object-contain"
                        />
                    ) : (
                        <Logo color="var(--accent)" size="3rem" />
                    )}
                    <h1
                        className="break-words text-center text-3xl font-semibold tracking-tight"
                        style={{ fontFamily: 'Unbounded, sans-serif' }}
                    >
                        {titleParts.map((part, index) => (
                            <span key={index} style={{ color: part.color }}>
                                {part.text}
                            </span>
                        ))}
                    </h1>
                </header>
                {!authStatus &&
                    (isPending ? (
                        <div role="status" className="flex items-center gap-3 text-muted">
                            <Spinner size="sm" />
                            Loading authentication methods…
                        </div>
                    ) : (
                        <Alert status="danger" className="w-full">
                            <Alert.Content>
                                <Alert.Title>Server is not responding</Alert.Title>
                                <Alert.Description>
                                    Check the server logs or try again.
                                </Alert.Description>
                                <Button
                                    className="mt-3"
                                    variant="secondary"
                                    onPress={() => {
                                        void refetch()
                                    }}
                                >
                                    Retry
                                </Button>
                            </Alert.Content>
                        </Alert>
                    ))}
                {authStatus && (methods.isRegister || authStatus.isLoginAllowed) && (
                    <Card className="w-full rounded-3xl p-6 shadow-lg sm:p-8">
                        <Card.Content className="flex flex-col gap-6 p-0">
                            {methods.isRegister ? (
                                <RegisterFormFeature />
                            ) : (
                                <>
                                    {methods.isPasswordEnabled && <LoginFormFeature />}
                                    {methods.hasPrimaryMethods && methods.hasAlternativeMethods && (
                                        <div className="flex items-center gap-4" aria-hidden="true">
                                            <Separator className="flex-1" />
                                            <span className="text-xs font-medium text-muted">
                                                OR
                                            </span>
                                            <Separator className="flex-1" />
                                        </div>
                                    )}
                                    {authStatus.authentication && methods.hasAlternativeMethods && (
                                        <div className="flex flex-col gap-3">
                                            {methods.isPasskeyEnabled && (
                                                <PasskeyLoginButtonFeature
                                                    authentication={authStatus.authentication}
                                                />
                                            )}
                                            {methods.isOAuth2Enabled && (
                                                <OAuth2LoginButtonsFeature
                                                    authentication={authStatus.authentication}
                                                />
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </Card.Content>
                    </Card>
                )}
                {authStatus && !methods.isRegister && !authStatus.isLoginAllowed && (
                    <Alert status="warning">
                        <Alert.Content>
                            <Alert.Description>
                                Authentication is currently unavailable.
                            </Alert.Description>
                        </Alert.Content>
                    </Alert>
                )}
            </div>
        </Page>
    )
}

export default LoginPage
