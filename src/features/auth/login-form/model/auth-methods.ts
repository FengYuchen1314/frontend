import type { GetStatusCommand } from '@remnawave/backend-contract'

export const getAuthMethods = (authStatus: GetStatusCommand.Response['response'] | undefined) => {
    const isPasswordEnabled = authStatus?.authentication?.password?.enabled ?? false
    const isPasskeyEnabled = authStatus?.authentication?.passkey?.enabled ?? false
    const isOAuth2Enabled = Object.values(authStatus?.authentication?.oauth2?.providers ?? {}).some(
        Boolean
    )
    return {
        isPasswordEnabled,
        isPasskeyEnabled,
        isOAuth2Enabled,
        hasPrimaryMethods: isPasswordEnabled,
        hasAlternativeMethods: isPasskeyEnabled || isOAuth2Enabled,
        isRegister: !authStatus?.isLoginAllowed && Boolean(authStatus?.isRegisterAllowed)
    }
}
