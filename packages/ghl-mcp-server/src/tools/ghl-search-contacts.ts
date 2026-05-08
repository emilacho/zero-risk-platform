import { z } from 'zod'
import type { GHLClient } from '../client.js'

export const name = 'ghl_search_contacts'
export const description = 'Search contacts in GoHighLevel by query string'

export const argsSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: GHLClient, raw: unknown): Promise<unknown> {
  const args = argsSchema.parse(raw)
  const limit = args.limit ?? 20
  const params = new URLSearchParams({
    query: args.query,
    limit: String(limit),
  })
  return client.get(`/contacts/search?${params.toString()}`)
}
