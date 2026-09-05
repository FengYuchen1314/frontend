import type { editor } from 'monaco-editor'

import { GetSnippetsCommand } from '@remnawave/backend-contract'
import consola from 'consola/browser'
import dayjs from 'dayjs'
import { RefObject } from 'react'
import { z } from 'zod'

import { prepareManagedXrayValidation } from '@shared/utils/managed-xray-validation'

const PROTECTED_ROOT_KEYS = new Set([
    'api',
    'inbounds',
    'metrics',
    'snippets',
    'stats',
    'xboardAnyTls'
])

const MieruProfileConfigSchema = z
    .object({
        runtime: z.literal('MIERU'),
        listeners: z
            .array(
                z
                    .object({
                        tag: z
                            .string()
                            .min(1)
                            .max(64)
                            .refine((tag) => !tag.includes(','), {
                                message: "Character ',' is not allowed in listener tag"
                            }),
                        port: z.int().min(1025).max(65535),
                        protocol: z.enum(['TCP', 'UDP'])
                    })
                    .strict()
            )
            .min(1)
            .max(128),
        mtu: z.int().min(1280).max(1500),
        multiplexing: z.literal('MULTIPLEXING_LOW'),
        handshakeMode: z.literal('HANDSHAKE_STANDARD'),
        userHintIsMandatory: z.literal(true),
        metricsLoggingInterval: z.literal('1m'),
        loggingLevel: z.enum(['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'])
    })
    .strict()
    .superRefine((config, context) => {
        const tags = new Set<string>()
        const bindings = new Set<string>()

        config.listeners.forEach((listener, index) => {
            if (tags.has(listener.tag)) {
                context.addIssue({
                    code: 'custom',
                    message: `Duplicate Mieru listener tag "${listener.tag}"`,
                    path: ['listeners', index, 'tag']
                })
            }
            tags.add(listener.tag)

            const binding = `${listener.protocol}:${listener.port}`
            if (bindings.has(binding)) {
                context.addIssue({
                    code: 'custom',
                    message: `Duplicate Mieru listener binding "${binding}"`,
                    path: ['listeners', index, 'port']
                })
            }
            bindings.add(binding)
        })
    })

const replaceSnippetsInRoot = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    snippetsMap: Map<string, unknown>
): void => {
    const names = config.snippets

    delete config.snippets

    if (!Array.isArray(names)) return

    const merged: Record<string, unknown> = {}

    for (const name of names) {
        const snippet = snippetsMap.get(name)

        if (!snippet) {
            consola.error(`Snippet ${name} not found`)
            continue
        }

        for (const part of Array.isArray(snippet) ? snippet : [snippet]) {
            if (!part || typeof part !== 'object' || Array.isArray(part)) continue

            Object.assign(merged, part)
        }
    }

    for (const [key, value] of Object.entries(merged)) {
        if (PROTECTED_ROOT_KEYS.has(key) || key in config) continue

        config[key] = value
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceSnippetsInArray = (array: any[], snippetsMap: Map<string, unknown>): void => {
    for (let i = array.length - 1; i >= 0; i--) {
        const item = array[i]

        if (item.snippet) {
            const snippet = snippetsMap.get(item.snippet)

            if (snippet) {
                if (Array.isArray(snippet)) {
                    array.splice(i, 1, ...snippet)
                } else {
                    // eslint-disable-next-line no-param-reassign
                    array[i] = snippet
                }
            } else {
                consola.error(`Snippet ${item.snippet} not found`)
                array.splice(i, 1)
            }
        }
    }
}

export const ConfigValidationFeature = {
    validate: (
        editorRef: RefObject<editor.IStandaloneCodeEditor | null>,

        setResult: (message: string) => void,
        setIsConfigValid: (isValid: boolean) => void,
        snippetsMap: Map<
            string,
            GetSnippetsCommand.Response['response']['snippets'][number]['snippet']
        >,
        runtime: 'MIERU' | 'XRAY' = 'XRAY'
    ) => {
        try {
            if (!editorRef.current) return

            const currentValue = editorRef.current.getValue()

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let clonedCurrentValue: any
            try {
                clonedCurrentValue = JSON.parse(currentValue)
            } catch {
                setResult(`${dayjs().format('HH:mm:ss')} | Invalid JSON.`)
                setIsConfigValid(false)
                return
            }

            if (runtime === 'MIERU') {
                const validationResult = MieruProfileConfigSchema.safeParse(clonedCurrentValue)

                if (validationResult.success) {
                    setResult(`${dayjs().format('HH:mm:ss')} | Mieru config is valid.`)
                    setIsConfigValid(true)
                    return
                }

                const issues = validationResult.error.issues
                    .map((issue) => {
                        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
                        return `${path}${issue.message}`
                    })
                    .join('; ')

                setResult(`${dayjs().format('HH:mm:ss')} | Invalid Mieru config: ${issues}`)
                setIsConfigValid(false)
                return
            }

            const prepared = prepareManagedXrayValidation(clonedCurrentValue)
            clonedCurrentValue = prepared.nativeConfig
            replaceSnippetsInRoot(clonedCurrentValue, snippetsMap)

            if (clonedCurrentValue.outbounds) {
                replaceSnippetsInArray(clonedCurrentValue.outbounds, snippetsMap)
            }

            if (clonedCurrentValue.routing?.rules) {
                replaceSnippetsInArray(clonedCurrentValue.routing.rules, snippetsMap)
            }

            if (clonedCurrentValue.routing?.balancers) {
                replaceSnippetsInArray(clonedCurrentValue.routing.balancers, snippetsMap)
            }

            const validationResult = window.XrayParseConfig(JSON.stringify(clonedCurrentValue))

            setResult(
                `${dayjs().format('HH:mm:ss')} | ${
                    validationResult ||
                    (prepared.hasAnyTls
                        ? 'Xray + encrypted AnyTLS config is structurally valid. Agent checks live camouflage.'
                        : 'Xray config is valid.')
                }`
            )
            setIsConfigValid(!validationResult)
        } catch (err: unknown) {
            const message = (err as Error).message
            if (message?.includes('Go program has already exited')) {
                setResult(`${dayjs().format('HH:mm:ss')} | WASM module crashed, restarting...`)
            } else {
                setResult(`${dayjs().format('HH:mm:ss')} | Validation error: ${message}`)
            }
            setIsConfigValid(false)
        }
    }
}
