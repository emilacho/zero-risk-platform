/**
 * Sprint 8 A5 · canonical writer to `public.contacts`.
 *
 * Used by OnboardingOrchestrator (Day-1 web discovery) and future callers
 * (Tally form handler, NEXUS Phase 7, manual UI). Idempotent · upsert on
 * (client_id, kind, value) via the unique index from migration
 * 202605240700_crm_contacts_canonical.sql.
 *
 * Graceful · NEVER throws. Returns counts + first error if INSERT failed
 * so callers can log without breaking the parent flow (fire-and-forget
 * canon · sister of Sprint 7.5 Brain ingest hook).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactKind = 'email' | 'phone' | 'address' | 'social_handle' | 'other'

export interface ContactInput {
  kind: ContactKind
  value: string
  source?: string
  source_metadata?: Record<string, unknown>
  verified?: boolean
}

export interface PersistContactsResult {
  attempted: number
  inserted_or_skipped: number
  error: string | null
}

/**
 * Persist N contacts for a client. Empty input or zero-length values short-
 * circuit to a no-op. Strings are trimmed; empties dropped. Dedupe relies
 * on the DB unique index · `onConflict: 'client_id,kind,value'` with
 * `ignoreDuplicates: true` so re-runs of the same scrape produce zero
 * churn.
 */
export async function persistContacts(
  supabase: SupabaseClient,
  clientId: string,
  contacts: ContactInput[],
  defaultSource: string = 'manual',
): Promise<PersistContactsResult> {
  if (!clientId) return { attempted: 0, inserted_or_skipped: 0, error: 'missing client_id' }
  const rows = contacts
    .map((c) => ({
      client_id: clientId,
      kind: c.kind,
      value: (c.value ?? '').trim(),
      source: c.source ?? defaultSource,
      source_metadata: c.source_metadata ?? {},
      verified: c.verified ?? false,
    }))
    .filter((r) => r.value.length > 0)

  if (rows.length === 0) {
    return { attempted: 0, inserted_or_skipped: 0, error: null }
  }

  try {
    const { error, count } = await supabase
      .from('contacts')
      .upsert(rows, {
        onConflict: 'client_id,kind,value',
        ignoreDuplicates: true,
        count: 'exact',
      })
    if (error) {
      return { attempted: rows.length, inserted_or_skipped: 0, error: error.message }
    }
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
 * Convenience · convert WebDiscovery `contactInfo` shape into ContactInput[]
 * and persist. Caller decides source label (default `web_discovery`).
 */
export async function persistContactsFromDiscovery(
  supabase: SupabaseClient,
  clientId: string,
  contactInfo: {
    emails?: string[]
    phones?: string[]
    address?: string | null
  },
  source: string = 'web_discovery',
  sourceMetadata: Record<string, unknown> = {},
): Promise<PersistContactsResult> {
  const inputs: ContactInput[] = [
    ...(contactInfo.emails ?? []).map<ContactInput>((v) => ({
      kind: 'email',
      value: v,
      source,
      source_metadata: sourceMetadata,
    })),
    ...(contactInfo.phones ?? []).map<ContactInput>((v) => ({
      kind: 'phone',
      value: v,
      source,
      source_metadata: sourceMetadata,
    })),
    ...(contactInfo.address
      ? [
          {
            kind: 'address' as ContactKind,
            value: contactInfo.address,
            source,
            source_metadata: sourceMetadata,
          },
        ]
      : []),
  ]
  return persistContacts(supabase, clientId, inputs, source)
}
