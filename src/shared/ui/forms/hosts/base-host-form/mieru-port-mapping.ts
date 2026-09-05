export interface MappingInbound {
    uuid: string
    type: string
    port: number | null
    rawInbound: unknown
}

export type MieruMappingMode = 'ONE_TO_ONE' | 'MANUAL'

const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null

export const isManagedMieruInbound = (inbound: MappingInbound | undefined): boolean => {
    const raw = record(inbound?.rawInbound)
    return (
        inbound?.type.toLowerCase() === 'mieru' &&
        raw?.protocol === 'mieru' &&
        record(raw.settings)?.transport === 'TCP'
    )
}

const validPort = (value: unknown, minimum: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 65535

export const inferMieruMappingMode = (entryPort: unknown, ixPort: unknown): MieruMappingMode =>
    validPort(entryPort, 1) && entryPort !== ixPort ? 'MANUAL' : 'ONE_TO_ONE'

export type MieruMappingResult =
    | { valid: true; inboundUuid: string; entryPort: number; ixPort: number }
    | { valid: false; error: 'entry-port' | 'ix-port' | 'not-configured' | 'ambiguous' }

// Hosts describe client entry points; listener configuration remains owned by the profile.
// Resolve an existing TCP listener instead of silently changing a shared server's binding.
export function resolveMieruPortMapping(
    inbounds: readonly MappingInbound[],
    mode: MieruMappingMode,
    entryPort: unknown,
    manualIxPort: unknown
): MieruMappingResult {
    if (!validPort(entryPort, 1)) return { valid: false, error: 'entry-port' }
    const ixPort = mode === 'ONE_TO_ONE' ? entryPort : manualIxPort
    if (!validPort(ixPort, 1025)) return { valid: false, error: 'ix-port' }
    const matches = inbounds.filter(
        (inbound) => isManagedMieruInbound(inbound) && inbound.port === ixPort
    )
    if (matches.length === 0) return { valid: false, error: 'not-configured' }
    if (matches.length !== 1) return { valid: false, error: 'ambiguous' }
    return { valid: true, inboundUuid: matches[0].uuid, entryPort, ixPort }
}
