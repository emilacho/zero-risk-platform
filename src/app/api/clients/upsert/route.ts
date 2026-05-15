/**
 * POST /api/clients/upsert — atomic persistence for onboarding pipeline.
 *
 * One call, three writes:
 *   1. UPSERT `clients` ON CONFLICT (slug) DO UPDATE
 *   2. INSERT `client_brand_books` (only when `brand_book` payload provided)
 *   3. INSERT `client_journey_state` (always · captures the trigger event)
 *
 * LOTE-C diagnostic #4: the Onboarding E2E v2 workflow runs the Auto-Discovery
 * agent but never persists the client identity, brand artifacts, or journey
 * state. This endpoint is the canonical persistence surface so any workflow
 * (or external caller) can land a new client + initial brand book + journey
 * row in a single round-trip.
 *
 * Design notes:
 *   - clients.slug is UNIQUE → safe upsert target. We derive slug from `name`
 *     when not provided; explicit `client_id` (UUID) takes precedence.
 *   - brand_book + journey_state both FK on clients.id, so the upserted
 *     clients.id is propagated downstream.
 *   - Errors on table 2 or 3 do NOT roll back table 1 (no SQL transaction
 *     wrapping · Supabase HTTP API doesn't support transactions). We return
 *     partial-success with explicit per-table booleans so the caller can see
 *     which write landed and which didn't.
 *   - All writes use service-role client → bypasses RLS (this endpoint is
 *     internal · gated by x-api-key).
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ClientsUpsertInput {
  name: string
  slug?: string
  client_id?: string
  website?: string | null
  website_url?: string | null
  industry?: string | null
  contact_email?: string | null
  country?: string | null
  language?: string | null
  status?: 'onboarding' | 'active' | 'paused' | 'churned' | 'trial'
  brand_book?: Record<string, unknown> | null
  journey?: 'ACQUIRE' | 'ONBOARD' | 'PRODUCE' | 'ALWAYS_ON' | 'REVIEW'
  journey_stage?: string | null
  journey_status?: 'initiated' | 'active' | 'paused_hitl' | 'completed' | 'failed' | 'abandoned'
  trigger_type?: 'manual' | 'webhook' | 'cron' | 'callback'
  trigger_source?: string | null
  trigger_payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

/**
 * Slugify · best-effort URL-safe identifier from a free-form name.
 * Lowercase · diacritics stripped via NFD + combining-mark removal · spaces
 * + non-alphanumerics collapsed to single hyphens · trimmed · empty fallback.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100) || 'client'
}

export async function POST(request: Request) {
  // Auth before validation (401 before 400)
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const v = await validateInput<ClientsUpsertInput>(request, 'clients-upsert')
  if (!v.ok) return v.response
  const body = v.data

  const slug = (body.slug && body.slug.trim()) || slugify(body.name)
  const websiteUrl = body.website_url ?? body.website ?? null

  let supabase
  try {
    supabase = getSupabaseAdmin()
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'supabase_unavailable', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }

  // ─── 1. UPSERT clients ──────────────────────────────────────────────────
  const clientRow: Record<string, unknown> = {
    name: body.name,
    slug,
    status: body.status ?? 'onboarding',
    preferred_language: body.language ?? 'es',
  }
  if (websiteUrl) clientRow.website_url = websiteUrl
  if (body.industry) clientRow.industry = body.industry
  if (body.country) clientRow.country = body.country
  if (body.language) clientRow.language = body.language
  if (body.client_id) clientRow.id = body.client_id

  const conflictTarget = body.client_id ? 'id' : 'slug'
  const { data: clientUpsert, error: clientErr } = await supabase
    .from('clients')
    .upsert(clientRow, { onConflict: conflictTarget })
    .select('id, name, slug, status, industry, website_url, created_at, updated_at')
    .single()

  if (clientErr || !clientUpsert) {
    return NextResponse.json(
      {
        error: 'clients_upsert_failed',
        detail: clientErr?.message?.slice(0, 400) ?? 'unknown error',
        slug,
      },
      { status: 502 },
    )
  }

  const clientId = clientUpsert.id as string

  // ─── 2. INSERT client_brand_books (optional) ────────────────────────────
  let brandBookId: string | null = null
  let brandBookError: string | null = null
  if (body.brand_book && Object.keys(body.brand_book).length > 0) {
    const bb = body.brand_book as Record<string, unknown>
    const brandBookRow: Record<string, unknown> = {
      client_id: clientId,
      brand_purpose: bb.brand_purpose ?? null,
      brand_vision: bb.brand_vision ?? null,
      brand_mission: bb.brand_mission ?? null,
      brand_values: bb.brand_values ?? [],
      brand_personality: bb.brand_personality ?? null,
      voice_description: bb.voice_description ?? null,
      tone_guidelines: bb.tone_guidelines ?? {},
      writing_style: bb.writing_style ?? null,
      tagline: bb.tagline ?? null,
      elevator_pitch: bb.elevator_pitch ?? null,
      key_messages: bb.key_messages ?? [],
      value_propositions: bb.value_propositions ?? [],
      primary_colors: bb.primary_colors ?? [],
      imagery_style: bb.imagery_style ?? null,
      forbidden_words: bb.forbidden_words ?? [],
      required_terminology: bb.required_terminology ?? [],
      competitor_mentions_policy: bb.competitor_mentions_policy ?? 'never_mention',
      content_text: bb.content_text ?? null,
      auto_generated: true,
      auto_generated_from: bb.auto_generated_from ?? body.trigger_source ?? 'api_clients_upsert',
      human_validated: false,
      version: 1,
    }
    const { data: bbData, error: bbErr } = await supabase
      .from('client_brand_books')
      .insert(brandBookRow)
      .select('id')
      .single()
    if (bbErr) {
      brandBookError = bbErr.message?.slice(0, 400) ?? 'unknown error'
    } else if (bbData) {
      brandBookId = bbData.id as string
    }
  }

  // ─── 3. INSERT client_journey_state ─────────────────────────────────────
  const journeyRow: Record<string, unknown> = {
    client_id: clientId,
    journey: body.journey ?? 'ONBOARD',
    current_stage: body.journey_stage ?? null,
    status: body.journey_status ?? 'active',
    trigger_type: body.trigger_type ?? 'webhook',
    trigger_source: body.trigger_source ?? null,
    trigger_payload: body.trigger_payload ?? {},
    metadata: body.metadata ?? {},
  }
  let journeyStateId: string | null = null
  let journeyStateError: string | null = null
  const { data: jsData, error: jsErr } = await supabase
    .from('client_journey_state')
    .insert(journeyRow)
    .select('id, journey, status, started_at')
    .single()
  if (jsErr) {
    journeyStateError = jsErr.message?.slice(0, 400) ?? 'unknown error'
  } else if (jsData) {
    journeyStateId = jsData.id as string
  }

  // ─── Response ───────────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    client_id: clientId,
    client: clientUpsert,
    brand_book_id: brandBookId,
    journey_state_id: journeyStateId,
    writes: {
      clients: true,
      client_brand_books: brandBookId !== null,
      client_journey_state: journeyStateId !== null,
    },
    ...(brandBookError ? { brand_book_error: brandBookError } : {}),
    ...(journeyStateError ? { journey_state_error: journeyStateError } : {}),
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/clients/upsert',
    method: 'POST',
    auth: 'x-api-key (INTERNAL_API_KEY)',
    body_schema: 'clients-upsert',
    purpose: 'Atomic 3-table persistence · clients (upsert) + client_brand_books (insert if provided) + client_journey_state (insert)',
  })
}
