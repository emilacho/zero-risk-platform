/**
 * Sprint 8C · canonical writer to `public.deals`.
 *
 * Used by sales-side flows · Tally lead form submissions · NEXUS Phase 7
 * outcomes that generate proposals · manual UI. Graceful · never throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type DealStage =
  | 'prospecting'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'on_hold'

export interface DealInput {
  name: string
  company_id?: string | null
  contact_id?: string | null
  stage?: DealStage
  value_usd?: number | null
  currency?: string
  expected_close_date?: string | null
  closed_at?: string | null
  source?: string
  owner?: string | null
  metadata?: Record<string, unknown>
}

export interface PersistDealsResult {
  attempted: number
  inserted: number
  error: string | null
}

export async function persistDeals(
  supabase: SupabaseClient,
  clientId: string,
  deals: DealInput[],
  defaultSource = 'manual',
): Promise<PersistDealsResult> {
  if (!clientId) return { attempted: 0, inserted: 0, error: 'missing client_id' }
  const rows = deals
    .map((d) => ({
      client_id: clientId,
      name: (d.name ?? '').trim(),
      company_id: d.company_id ?? null,
      contact_id: d.contact_id ?? null,
      stage: d.stage ?? 'prospecting',
      value_usd: d.value_usd ?? null,
      currency: d.currency ?? 'USD',
      expected_close_date: d.expected_close_date ?? null,
      closed_at: d.closed_at ?? null,
      source: d.source ?? defaultSource,
      owner: d.owner ?? null,
      metadata: d.metadata ?? {},
    }))
    .filter((r) => r.name.length > 0)

  if (rows.length === 0) return { attempted: 0, inserted: 0, error: null }

  try {
    const { error, data } = await supabase.from('deals').insert(rows).select('id')
    if (error) return { attempted: rows.length, inserted: 0, error: error.message }
    return { attempted: rows.length, inserted: data?.length ?? rows.length, error: null }
  } catch (e) {
    return {
      attempted: rows.length,
      inserted: 0,
      error: e instanceof Error ? e.message : 'unknown error',
    }
  }
}
