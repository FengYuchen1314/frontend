import { RegisterCommand } from '@remnawave/backend-contract'
import { z } from 'zod'

export const createRegistrationSchema = (mismatchMessage: string) =>
    RegisterCommand.RequestBodySchema.extend({
        username: RegisterCommand.RequestBodySchema.shape.username.min(1),
        confirmPassword: z.string()
    }).refine((value) => value.password === value.confirmPassword, {
        path: ['confirmPassword'],
        message: mismatchMessage
    })

/** Rejection sampling avoids modulo bias; required classes satisfy the server contract. */
export function generateRegistrationPassword(
    random = (bytes: Uint32Array) => crypto.getRandomValues(bytes)
) {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const lower = 'abcdefghijklmnopqrstuvwxyz'
    const digits = '0123456789'
    const alphabet = upper + lower + digits
    const index = (length: number) => {
        const limit = 2 ** 32 - (2 ** 32 % length)
        let value: number
        do {
            value = random(new Uint32Array(1))[0]
        } while (value >= limit)
        return value % length
    }
    const chars = [
        upper[index(upper.length)],
        lower[index(lower.length)],
        digits[index(digits.length)]
    ]
    while (chars.length < 32) chars.push(alphabet[index(alphabet.length)])
    for (let last = chars.length - 1; last > 0; last--) {
        const other = index(last + 1)
        ;[chars[last], chars[other]] = [chars[other], chars[last]]
    }
    return chars.join('')
}
