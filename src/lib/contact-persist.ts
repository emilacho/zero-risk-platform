/**
 * contact-persist · CRM wire-in helper · Sprint 5 D1 2026-05-21.
 *
 * Single source of truth for writing contacts derived from onboarding /
 * intake / agent flows into `client_champions` (canonical CRM table per
 * Stack V4 · decision doc `crm-canonical-table-client-champions` ·
 * 2026-05-21).
 *
 * Usage ·
 *   import { persistContact } from './contact-persist'
 *   await persistContact(supabase, { clientId, championName, championEmail })
 *
 * Semantics ·
 *   - When `championEmail` is provided AND a row with same client_id +
 *     email exists · UPDATE (upsert) so re-runs are idempotent
 *   - When no email · INSERT new row (each call yields a new champion)
 *   - When `journeyStatus` provided · store in metadata so future filters
 *     can group contacts by journey phase
 *   - All errors surfaced via discriminated union · NEVER throws (caller
 *     decides whether to fail the parent flow)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PersistContactInput {
  clientId: string
  championName: string
  championEmail?: string | null
  championPhone?: string | null
  championRole?: string | null
  vertical?: string | null
  /** discovery · onboarding · activated · churned. Stored in metadata. */
  journeyStatus?: string | null
  /** Free-form notes from the upstream caller. */
  notes?: string | null
  /** Free-form metadata · merged into the row's metadata column. */
  extraMetadata?: Record<string, unknown>
}

export type PersistContactResult =
  | {
      ok: true
      id: string
      mode: 'inserted' | 'updated'
    }
  | {
      ok: false
      code: 'InvalidInput' | 'DbError' | 'NoClient'
      detail: string
    }

function trim(s: string | null | undefined): string {
  return (s ?? '').trim()
}

export async function persistContact(
  supabase: SupabaseClient,
  input: PersistContactInput,
): Promise<PersistContactResult> {
  if (!input.clientId) {
    return { ok: false, code: 'InvalidInput', detail: 'clientId_required' }
  }
  if (!trim(input.championName)) {
    return { ok: false, code: 'InvalidInput', detail: 'championName_required' }
  }

  const metadata: Record<string, unknown> = {
    ...(input.extraMetadata ?? {}),
    journey_status: input.journeyStatus ?? null,
    vertical: input.vertical ?? null,
    persisted_by: 'contact-persist',
    persisted_at: new Date().toISOString(),
  }

  const baseRow = {
    client_id: input.clientId,
    champion_name: trim(input.championName),
    champion_role: input.championRole ?? null,
    champion_email: trim(input.championEmail) || null,
    champion_phone: trim(input.championPhone) || null,
    notes: input.notes ?? null,
    metadata,
    updated_at: new Date().toISOString(),
  }

  // If an email is provided, attempt to find an existing row to UPDATE.
  // Otherwise straight INSERT.
  if (baseRow.champion_email) {
    const { data: existing, error: lookupErr } = await supabase
      .from('client_champions')
      .select('id')
      .eq('client_id', input.clientId)
      .eq('champion_email', baseRow.champion_email)
      .maybeSingle()
    if (lookupErr && lookupErr.code !== 'PGRST116') {
      return { ok: false, code: 'DbError', detail: lookupErr.message }
    }
    if (existing?.id) {
      const { error: updErr } = await supabase
        .from('client_champions')
        .update(baseRow)
        .eq('id', existing.id)
      if (updErr) {
        return { ok: false, code: 'DbError', detail: updErr.message }
      }
      return { ok: true, id: existing.id, mode: 'updated' }
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('client_champions')
    .insert(baseRow)
    .select('id')
    .single()
  if (insErr) {
    if (insErr.code === '23503') {
      return { ok: false, code: 'NoClient', detail: 'client_id_not_found' }
    }
    return { ok: false, code: 'DbError', detail: insErr.message }
  }
  return { ok: true, id: inserted.id as string, mode: 'inserted' }
}
