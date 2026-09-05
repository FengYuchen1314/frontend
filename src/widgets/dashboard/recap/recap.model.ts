import type { CSSProperties } from 'react'

import {
    DEFAULT_SECTIONS,
    SWATCHES,
    type BgStyle,
    type CardSection,
    type MaskableField
} from './recap.constants'

export interface RecapPreferences {
    sections: CardSection[]
    maskedFields: MaskableField[]
    accent: string
    customNote: string
    bgStyle: BgStyle
}
export const createRecapPreferences = (): RecapPreferences => ({
    sections: [...DEFAULT_SECTIONS],
    maskedFields: [],
    accent: SWATCHES[0],
    customNote: '',
    bgStyle: 'solid'
})
export type RecapAction =
    | { type: 'section'; value: CardSection; selected: boolean }
    | { type: 'mask'; value: MaskableField }
    | { type: 'accent' | 'note'; value: string }
    | { type: 'background'; value: BgStyle }

function toggle<T>(values: T[], value: T, selected = !values.includes(value)) {
    return selected ? [...new Set([...values, value])] : values.filter((item) => item !== value)
}
export function recapReducer(state: RecapPreferences, action: RecapAction): RecapPreferences {
    switch (action.type) {
        case 'section':
            return { ...state, sections: toggle(state.sections, action.value, action.selected) }
        case 'mask':
            return { ...state, maskedFields: toggle(state.maskedFields, action.value) }
        case 'accent':
            return colorChannels(action.value) ? { ...state, accent: action.value } : state
        case 'note':
            return { ...state, customNote: action.value.slice(0, 40) }
        case 'background':
            return { ...state, bgStyle: action.value }
    }
}

function colorChannels(color: string): number[] | null {
    if (/^#[0-9a-f]{6}$/i.test(color))
        return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color)
    const channels = rgb?.slice(1).map(Number)
    return channels?.every((channel) => channel <= 255) ? channels : null
}
export function recapColorHex(color: string) {
    return `#${(colorChannels(color) ?? [21, 170, 191]).map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
export function recapColorAlpha(color: string, alpha: number) {
    return `rgba(${(colorChannels(color) ?? [21, 170, 191]).join(', ')}, ${Math.max(0, Math.min(1, alpha))})`
}
export function recapBackground(style: BgStyle, accent: string): CSSProperties | null {
    switch (style) {
        case 'dots':
            return {
                backgroundImage: `radial-gradient(${recapColorAlpha(accent, 0.12)} 1px, transparent 1px)`,
                backgroundSize: '16px 16px'
            }
        case 'gradient':
            return {
                background: `linear-gradient(135deg, transparent 0%, ${recapColorAlpha(accent, 0.08)} 50%, transparent 100%)`
            }
        case 'grid':
            return {
                backgroundImage: `linear-gradient(${recapColorAlpha(accent, 0.06)} 1px, transparent 1px), linear-gradient(90deg, ${recapColorAlpha(accent, 0.06)} 1px, transparent 1px)`,
                backgroundSize: '24px 24px'
            }
        default:
            return null
    }
}
export const recapField = (
    masked: MaskableField[],
    field: MaskableField,
    value: number | string | undefined
) => (masked.includes(field) ? '\u{1F648}' : value)

export type RecapExportKind = 'copy' | 'download'
export function createRecapExporter(deps: {
    isCurrent(): boolean
    getElement(): HTMLElement | null
    prepare(signal: AbortSignal): Promise<void>
    copy(target: () => Promise<HTMLElement>, signal: AbortSignal): Promise<void>
    download(element: HTMLElement, signal: AbortSignal): Promise<void>
    onState(kind: RecapExportKind | null): void
    onError(error: unknown): void
}) {
    let active: AbortController | null = null
    let disposed = false
    return {
        async run(kind: RecapExportKind) {
            if (disposed || active || !deps.isCurrent()) return false
            const controller = new AbortController()
            active = controller
            const current = () => !disposed && deps.isCurrent() && !controller.signal.aborted
            const target = async () => {
                await deps.prepare(controller.signal)
                if (!current()) controller.abort()
                controller.signal.throwIfAborted()
                const element = deps.getElement()
                if (!element) throw new Error('Recap is no longer available')
                return element
            }
            deps.onState(kind)
            try {
                // Keep clipboard invocation inside the original user gesture. Its
                // promised Blob waits for React layout and is canceled on close.
                if (kind === 'copy') await deps.copy(target, controller.signal)
                else await deps.download(await target(), controller.signal)
                return current()
            } catch (error) {
                if (current()) deps.onError(error)
                return false
            } finally {
                active = null
                if (current()) deps.onState(null)
            }
        },
        dispose() {
            disposed = true
            active?.abort()
            active = null
        }
    }
}

export function waitForRecapLayout(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        let frame: number | undefined
        const abort = () => {
            if (frame !== undefined) cancelAnimationFrame(frame)
            reject(new DOMException('Recap export canceled', 'AbortError'))
        }
        if (signal.aborted) {
            abort()
            return
        }
        signal.addEventListener('abort', abort, { once: true })
        frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
                signal.removeEventListener('abort', abort)
                resolve()
            })
        })
    })
}
