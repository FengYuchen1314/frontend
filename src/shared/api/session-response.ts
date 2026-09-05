import type { z } from 'zod'

import { assertSessionGeneration, getSessionGeneration } from './axios'

/** Keep ownership through asynchronous schema validation, not just HTTP receipt. */
export async function requestSessionResponse<Schema extends z.ZodType<{ response: unknown }>>(
    request: () => Promise<{ data: unknown }>,
    schema: Schema
): Promise<z.infer<Schema>['response']> {
    const generation = getSessionGeneration()
    try {
        const response = await request()
        assertSessionGeneration(generation)
        const result = await schema.safeParseAsync(response.data)
        assertSessionGeneration(generation)
        if (!result.success) throw result.error
        return result.data.response
    } catch (error) {
        assertSessionGeneration(generation)
        throw error
    }
}
