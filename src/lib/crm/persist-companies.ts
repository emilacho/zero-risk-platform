/**
 * Sprint 8C · canonical writer to `public.companies`.
 *
 * Sister of Sprint 8 A5 `persist-contacts.ts`. Used by OnboardingOrchestrator
 * Day-1 (creates a self-row for the cliente's own company per scrape) and
 * future callers (competitive-intel agent, NEXUS Phase 7, manual UI).
 *
 * Graceful · NEVER throws. Returns counts + first error so callers can log
 * without breaking the parent flow.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type CompanyRelationship =
  | 'prospect'
  | 'competitor'
  | 'partner'
  | 'vendor'
  | 'customer'
  | 'other'

export interface CompanyInput {
  name: string
  domain?: string | null
  industry?: string | null
  employees_estimate?: number | null
  hq_location?: string | null
  relationship?: CompanyRelationship
  source?: string
  source_metadata?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface PersistCompaniesResult {
  attempted: number
  inserted_or_skipped: number
  error: string | null
}

export async function persistCompanies(
  supabase: SupabaseClient,
  clientId: string,
  companies: CompanyInput[],
  defaultSource = 'manual',
): Promise<PersistCompaniesResult> {
  if (!clientId) return { attempted: 0, inserted_or_skipped: 0, error: 'missing client_id' }
  const rows = companies
    .map((c) => ({
      client_id: clientId,
      name: (c.name ?? '').trim(),
      domain: c.domain ?? null,
      industry: c.industry ?? null,
      employees_estimate: c.employees_estimate ?? null,
      hq_location: c.hq_location ?? null,
      relationship: c.relationship ?? 'prospect',
      source: c.source ?? defaultSource,
      source_metadata: c.source_metadata ?? {},
      metadata: c.metadata ?? {},
    }))
    .filter((r) => r.name.length > 0)

  if (rows.length === 0) return { attempted: 0, inserted_or_skipped: 0, error: null }

  try {
    const { error, count } = await supabase
      .from('companies')
      .upsert(rows, {
        onConflict: 'client_id,name',
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (error) return { attempted: rows.length, inserted_or_skipped: 0, error: error.message }
    return { attempted: rows.length, inserted_or_skipped: count ?? rows.length, error: null }
  } catch (e) {
    return {
      attempted: rows.length,
      inserted_or_skipped: 0,
      error: e instanceof Error ? e.message : 'unknown error',
    }
  }
}
