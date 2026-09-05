import { useOAuth2CallbackFlow } from '@features/auth/oauth2-login-button/model/use-oauth2-callback'
import { Alert, Button, Spinner } from '@heroui/react'
import { TbCircleCheck } from 'react-icons/tb'

import { Page } from '@shared/ui/page'

export const Oauth2CallbackPage = () => {
    const { isValid, isSuccess, backToLogin } = useOAuth2CallbackFlow()
    return (
        <Page title="OAuth2 Authentication">
            <section
                className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center"
                aria-live="polite"
            >
                {!isValid ? (
                    <Alert status="danger" className="max-w-md">
                        <Alert.Content>
                            <Alert.Title>OAuth2 Authentication</Alert.Title>
                            <Alert.Description>
                                Missing or invalid callback parameters.
                            </Alert.Description>
                            <Button variant="secondary" className="mt-4" onPress={backToLogin}>
                                Back to login
                            </Button>
                        </Alert.Content>
                    </Alert>
                ) : (
                    <>
                        {isSuccess ? (
                            <TbCircleCheck aria-hidden="true" size={48} className="text-success" />
                        ) : (
                            <Spinner size="lg" />
                        )}
                        <div>
                            <h1 className="text-2xl font-semibold">Authenticating…</h1>
                            <p className="mt-3 text-muted">Verifying credentials…</p>
                        </div>
                    </>
                )}
            </section>
        </Page>
    )
}

export default Oauth2CallbackPage
