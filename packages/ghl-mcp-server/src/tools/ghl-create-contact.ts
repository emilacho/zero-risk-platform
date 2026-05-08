import { z } from 'zod'
import type { GHLClient } from '../client.js'

export const name = 'ghl_create_contact'
export const description = 'Create a new contact in GoHighLevel'

export const argsSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(50).optional(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(),
})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: GHLClient, raw: unknown): Promise<unknown> {
  const args = argsSchema.parse(raw)
  if (!args.email && !args.phone) {
    throw new Error('ghl_create_contact: at least one of email or phone is required')
  }
  return client.post('/contacts/', args)
}
