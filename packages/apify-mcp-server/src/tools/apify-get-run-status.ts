/**
 * apify_get_run_status · des-stubeado (ciclo CANDADO #1 · 2026-07-19).
 *
 * El poll del wiring lo necesita: tras `apify_run_actor` (fire-and-return · devuelve
 * el run id), este tool consulta el estado del run vía el endpoint `GET /actor-runs/{id}`
 * (el mismo que `runActorAndWait` usa internamente) y devuelve una forma normalizada
 * con el `dataset_id` (defaultDatasetId) para encadenar `apify_get_dataset`.
 */
import { z } from 'zod'
import type { ApifyClient } from '../client.js'

export const name = 'apify_get_run_status'

export const argsSchema = z.object({
  run_id: z.string().min(1).max(200),
})

/** Estados terminales de un run de Apify. */
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'])

export interface RunStatusResult {
  run_id: string
  status: string
  dataset_id: string | null
  is_terminal: boolean
  ok: boolean
  started_at: string | null
  finished_at: string | null
}

export async function handler(client: ApifyClient, raw: unknown): Promise<RunStatusResult> {
  const args = argsSchema.parse(raw)
  const res = (await client.get(`/actor-runs/${encodeURIComponent(args.run_id)}`)) as {
    data?: {
      id?: string
      status?: string
      defaultDatasetId?: string
      startedAt?: string
      finishedAt?: string
    }
  }
  const d = res?.data ?? {}
  const status = d.status ?? 'UNKNOWN'
  return {
    run_id: d.id ?? args.run_id,
    status,
    dataset_id: d.defaultDatasetId ?? null,
    is_terminal: TERMINAL.has(status),
    ok: status === 'SUCCEEDED',
    started_at: d.startedAt ?? null,
    finished_at: d.finishedAt ?? null,
  }
}
