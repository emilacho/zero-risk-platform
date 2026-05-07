import { z } from 'zod'
import type { DFSClient } from '../client.js'

export const name = 'dfs_keywords_for_keyword'
export const description =
  'Get keyword ideas + monthly search volume for a seed keyword via DataForSEO'

export const argsSchema = z.object({
  keyword: z.string().min(1).max(200),
  location_code: z.number().int().optional(),
  language_code: z.string().min(2).max(10).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: DFSClient, raw: unknown): Promise<unknown> {
  const args = argsSchema.parse(raw)
  const result = await client.post('/v3/keywords_data/google/keywords_for_keyword/live', [
    {
      keyword: args.keyword,
      location_code: args.location_code ?? 2840, // United States
      language_code: args.language_code ?? 'en',
      limit: args.limit ?? 10,
    },
  ])
  return {
    ...((result as Record<string, unknown>) ?? {}),
    estimated_cost_usd: client.estimateCost('keywords.for_keyword'),
  }
}
