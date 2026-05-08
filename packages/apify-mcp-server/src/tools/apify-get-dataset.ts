import { z } from 'zod'
import type { ApifyClient } from '../client.js'

export const name = 'apify_get_dataset'
export const description = 'Fetch items from an existing Apify dataset by id'

export const argsSchema = z.object({
  dataset_id: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(10000).optional(),
  offset: z.number().int().min(0).optional(),
})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: ApifyClient, raw: unknown): Promise<unknown> {
  const args = argsSchema.parse(raw)
  const extra: Record<string, string> = {
    limit: String(args.limit ?? 100),
  }
  if (args.offset !== undefined) extra.offset = String(args.offset)
  return client.get(`/datasets/${encodeURIComponent(args.dataset_id)}/items`, extra)
}
