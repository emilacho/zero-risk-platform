/**
 * Sprint 8C · canonical writer to `public.tags`.
 *
 * CRM tag definitions per Zero Risk cliente. Sprint 9+ candidate ·
 * `tag_assignments` polymorphic join table to attach tags to contacts /
 * companies / deals. This writer ships the catalog · assignments deferred.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TagInput {
  name: string
  color?: string | null
  description?: string | null
  metadata?: Record<string, unknown>
}

export interface PersistTagsResult {
  attempted: number
  inserted_or_skipped: number
  error: string | null
}

export async function persistTags(
  supabase: SupabaseClient,
  clientId: string,
  tags: TagInput[],
): Promise<PersistTagsResult> {
  if (!clientId) return { attempted: 0, inserted_or_skipped: 0, error: 'missing client_id' }
  const rows = tags
    .map((t) => ({
      client_id: clientId,
      name: (t.name ?? '').trim(),
      color: t.color ?? null,
      description: t.description ?? null,
      metadata: t.metadata ?? {},
    }))
    .filter((r) => r.name.length > 0)

  if (rows.length === 0) return { attempted: 0, inserted_or_skipped: 0, error: null }

  try {
    const { error, count } = await supabase
      .from('tags')
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
