/**
 * Sprint 8C · canonical writer to `public.activities`.
 *
 * Time-series activity log per CRM subject (contact / company / deal /
 * cliente). Polymorphic via (subject_type, subject_id). Used by NEXUS
 * Phase 7 hooks · agent_invocations summary writes · sales rep manual UI.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivitySubjectType = 'contact' | 'company' | 'deal' | 'cliente'
export type ActivityKind =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'task'
  | 'agent_run'
  | 'system_event'
  | 'other'

export interface ActivityInput {
  subject_type: ActivitySubjectType
  subject_id: string
  kind: ActivityKind
  summary: string
  body?: string | null
  occurred_at?: string
  agent_run_id?: string | null
  metadata?: Record<string, unknown>
}

export interface PersistActivitiesResult {
  attempted: number
  inserted: number
  error: string | null
}

export async function persistActivities(
  supabase: SupabaseClient,
  clientId: string,
  activities: ActivityInput[],
): Promise<PersistActivitiesResult> {
  if (!clientId) return { attempted: 0, inserted: 0, error: 'missing client_id' }
  const rows = activities
    .map((a) => ({
      client_id: clientId,
      subject_type: a.subject_type,
      subject_id: a.subject_id,
      kind: a.kind,
      summary: (a.summary ?? '').trim(),
      body: a.body ?? null,
      occurred_at: a.occurred_at ?? new Date().toISOString(),
      agent_run_id: a.agent_run_id ?? null,
      metadata: a.metadata ?? {},
    }))
    .filter((r) => r.summary.length > 0 && r.subject_id)

  if (rows.length === 0) return { attempted: 0, inserted: 0, error: null }

  try {
    const { error, data } = await supabase.from('activities').insert(rows).select('id')
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
