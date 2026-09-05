import { AnyTlsProfileExtensionSchema } from '@remnawave/backend-contract'

// Keep panel-owned identity and the strict encrypted extension out of the native
// Xray parser. The backend/Agent additionally validate live camouflage and ports.
export function prepareManagedXrayValidation(config: unknown) {
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        throw new Error('Config must be an object.')
    }
    const nativeConfig = structuredClone(config) as Record<string, unknown>
    const hasAnyTls = Object.hasOwn(nativeConfig, 'xboardAnyTls')
    if (hasAnyTls) {
        AnyTlsProfileExtensionSchema.parse(nativeConfig.xboardAnyTls)
        delete nativeConfig.xboardAnyTls
    }
    return { nativeConfig, hasAnyTls }
}
