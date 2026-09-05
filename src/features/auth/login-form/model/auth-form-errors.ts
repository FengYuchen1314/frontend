import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'

import { isCancel } from 'axios'

const record = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined

/** Accept validation details, never serialize response values or submitted credentials. */
export function mapAuthFormErrors(error: unknown, fields: readonly string[]) {
    const fieldErrors: Record<string, string> = {}
    const formErrors: string[] = []
    if (isCancel(error)) return { fieldErrors, formErrors }
    const outer = record(error)
    const details = record(outer?.cause) ?? outer
    const add = (path: unknown, message: unknown) => {
        if (typeof message !== 'string' || !message) return
        if (typeof path === 'string' && fields.includes(path)) fieldErrors[path] = message
        else formErrors.push(message)
    }
    for (const source of [details, record(details?.errors)]) {
        if (!source) continue
        const issues = source.issues ?? source.errors
        if (Array.isArray(issues)) {
            for (const issue of issues) {
                const value = record(issue)
                add(Array.isArray(value?.path) ? value.path[0] : undefined, value?.message)
            }
        }
        const mapped = record(source.fieldErrors)
        if (mapped) {
            for (const [field, messages] of Object.entries(mapped)) {
                add(
                    field,
                    Array.isArray(messages)
                        ? messages.filter((item) => typeof item === 'string').join(', ')
                        : messages
                )
            }
        }
        if (Array.isArray(source.formErrors))
            source.formErrors.forEach((message) => add(undefined, message))
    }
    if (!Object.keys(fieldErrors).length && !formErrors.length) {
        add(undefined, typeof outer?.message === 'string' ? outer.message : 'Request failed')
    }
    return { fieldErrors, formErrors: [...new Set(formErrors)] }
}

export function applyAuthFormErrors<T extends FieldValues>(
    error: unknown,
    setError: UseFormSetError<T>,
    fields: readonly FieldPath<T>[]
) {
    const mapped = mapAuthFormErrors(error, fields)
    Object.entries(mapped.fieldErrors).forEach(([name, message], index) => {
        setError(name as FieldPath<T>, { type: 'server', message }, { shouldFocus: index === 0 })
    })
    if (mapped.formErrors.length)
        setError('root.server', { type: 'server', message: mapped.formErrors.join('\n') })
}
