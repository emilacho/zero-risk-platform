/**
 * Sprint 8C · canonical writer to `public.crm_notes`.
 *
 * Freeform notes attached polymorphically to any CRM subject. Used by sales
 * rep manual UI · agent narrative captures · Camino III HITL annotations.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type NoteAttachedType =
  | 'contact'
  | 'company'
  | 'deal'
  | 'pipeline'
  | 'activity'
  | 'cliente'

export interface CrmNoteInput {
  attached_type: NoteAttachedType
  attached_id: string
  body: string
  author?: string | null
  pinned?: boolean
  metadata?: Record<string, unknown>
}

export interface PersistCrmNotesResult {
  attempted: number
  inserted: number
  error: string | null
}

export async function persistCrmNotes(
  supabase: SupabaseClient,
  clientId: string,
  notes: CrmNoteInput[],
): Promise<PersistCrmNotesResult> {
  if (!clientId) return { attempted: 0, inserted: 0, error: 'missing client_id' }
  const rows = notes
    .map((n) => ({
      client_id: clientId,
      attached_type: n.attached_type,
      attached_id: n.attached_id,
      body: (n.body ?? '').trim(),
      author: n.author ?? null,
      pinned: n.pinned ?? false,
      metadata: n.metadata ?? {},
    }))
    .filter((r) => r.body.length > 0 && r.attached_id)

  if (rows.length === 0) return { attempted: 0, inserted: 0, error: null }

  try {
    const { error, data } = await supabase.from('crm_notes').insert(rows).select('id')
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
