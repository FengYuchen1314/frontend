import { TagsSchema } from '@remnawave/backend-contract'
import { z } from 'zod'

export const splitTagTokens = (input: string) => input.split(/[,;\s]+/u)
export const normalizeTags = (tags: readonly string[]) => [
    ...new Set(tags.map((tag) => tag.trim().toUpperCase()).filter(Boolean))
]
export const mergeTagDraft = (tags: readonly string[], draft: string) =>
    normalizeTags([...tags, ...splitTagTokens(draft)])
export const tagsFormSchema = z.object({ tags: TagsSchema.max(10), draft: z.string() })
