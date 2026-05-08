import { z } from 'zod'
import type { DFSClient } from '../client.js'

export const name = 'dfs_serp_google'
export const description =
  'Google organic SERP for a keyword via DataForSEO live endpoint (POST /v3/serp/google/organic/live/regular)'

export const argsSchema = z.object({
  keyword: z.string().min(1).max(500),
  location_code: z.number().int().optional(),
  language_code: z.string().min(2).max(10).optional(),
  depth: z.number().int().min(1).max(700).optional(),
})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: DFSClient, raw: unknown): Promise<unknown> {
  const args = argsSchema.parse(raw)
  const result = await client.post('/v3/serp/google/organic/live/regular', [
    {
      keyword: args.keyword,
      location_code: args.location_code ?? 2840, // United States
      language_code: args.language_code ?? 'en',
      depth: args.depth ?? 100,
    },
  ])
  return {
    ...((result as Record<string, unknown>) ?? {}),
    estimated_cost_usd: client.estimateCost('serp.google'),
  }
}
