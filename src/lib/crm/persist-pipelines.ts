/**
 * Sprint 8C · canonical writer to `public.pipelines`.
 *
 * Sales-pipeline configurations per Zero Risk cliente. Used by onboarding
 * (creates default pipeline) and manual UI (custom stage configs).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PipelineInput {
  name: string
  is_default?: boolean
  stages?: string[]
  description?: string | null
  metadata?: Record<string, unknown>
}

export interface PersistPipelinesResult {
  attempted: number
  inserted_or_skipped: number
  error: string | null
}

export async function persistPipelines(
  supabase: SupabaseClient,
  clientId: string,
  pipelines: PipelineInput[],
): Promise<PersistPipelinesResult> {
  if (!clientId) return { attempted: 0, inserted_or_skipped: 0, error: 'missing client_id' }
  const rows = pipelines
    .map((p) => ({
      client_id: clientId,
      name: (p.name ?? '').trim(),
      is_default: p.is_default ?? false,
      stages: p.stages ?? [
        'prospecting',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'lost',
      ],
      description: p.description ?? null,
      metadata: p.metadata ?? {},
    }))
    .filter((r) => r.name.length > 0)

  if (rows.length === 0) return { attempted: 0, inserted_or_skipped: 0, error: null }

  try {
    const { error, count } = await supabase
      .from('pipelines')
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

/**
 * Convenience · ensures the default pipeline exists for a cliente. Idempotent
 * via the (client_id, name) unique index.
 */
export async function ensureDefaultPipeline(
  supabase: SupabaseClient,
  clientId: string,
): Promise<PersistPipelinesResult> {
  return persistPipelines(supabase, clientId, [
    {
      name: 'Default Sales Pipeline',
      is_default: true,
      description: 'Canonical Zero Risk sales pipeline · auto-created on cliente onboarding',
    },
  ])
}
