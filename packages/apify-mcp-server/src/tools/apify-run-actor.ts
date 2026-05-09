import { z } from 'zod'
import type { ApifyClient } from '../client.js'

export const name = 'apify_run_actor'
export const description =
  'Run an Apify actor with a JSON input. Optionally wait for the run to finish and return its dataset items (default: return immediately with the run id).'

export const argsSchema = z.object({
  actor_id: z.string().min(1).max(200),
  input: z.record(z.unknown()).default({}),
  wait_for_finish: z.boolean().optional(),
  timeout_ms: z.number().int().min(1000).max(600_000).optional(),
})

export type Args = z.infer<typeof argsSchema>

export async function handler(client: ApifyClient, raw: unknown): Promise<unknown> {
  const args = argsSchema.parse(raw)

  if (args.wait_for_finish === true) {
    return client.runActorAndWait(args.actor_id, args.input, args.timeout_ms ?? 120_000)
  }

  // Default · fire-and-return run id (caller polls via apify_get_run_status / apify_get_dataset).
  return client.post(`/acts/${encodeURIComponent(args.actor_id)}/runs`, args.input)
}
