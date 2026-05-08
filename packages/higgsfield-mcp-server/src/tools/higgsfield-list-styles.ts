import { z } from 'zod'
import type { HiggsfieldClient } from '../client.js'

export const name = 'higgsfield_list_styles'
export const description = 'List the generation styles available on Higgsfield Lite'

export const argsSchema = z.object({})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: HiggsfieldClient, raw: unknown): Promise<unknown> {
  argsSchema.parse(raw ?? {})
  return client.get('/v1/styles')
}
