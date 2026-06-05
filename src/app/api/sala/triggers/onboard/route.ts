/**
 * Track Q · Sprint 12 Fase 0 · ENCENDIDO escalón 5 prep · HTTP wrapper.
 *
 * `POST /api/sala/triggers/onboard` ·
 *   - Wrapper sobre `dispatchSalaTrigger` · auth + shape parsing.
 *   - SHADOW only · canon-canon-NO despacha real · canon-canon-NO flip
 *     enforce · canon-canon-protegido por dos flags (master + sub-gate
 *     `webhook_onboarding_form`).
 *
 * Body shape canon · `SalaTriggerInput` ·
 *   {
 *     tenant_id: string (UUID),
 *     client_id: string (UUID o slug),
 *     journey_type: 'ONBOARD',   // canon-Track Q ships solo Journey B
 *     source: 'synthetic' | 'cron_new_clients_scan' | 'webhook_onboarding_form',
 *     external_id: string,
 *     logical_period: string,    // canon canonical "2026-W23"
 *     payload?: object,
 *     stream_id?: string,        // canon canonical-replay/test override
 *     correlation_id?: string
 *   }
 *
 * Auth · canon canonical-`checkInternalKey` · canon-canonical-same pattern
 * que `/api/onboarding` · canon-`x-internal-key` header.
 *
 * Smoke header canon · `x-smoke-test: 1` permite caller-side bypass de
 * orchestrator pesado (no aplica aquí · canon-canonical-trigger wire es
 * delgado · canon-canon-leave header in for caller compatibility).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'
import { dispatchSalaTrigger, type DispatchSalaTriggerConfig } from '@/lib/sala-trigger'
import type { SalaTriggerInput, TriggerSource } from '@/lib/sala-trigger'
import { InMemoryEventLogStorage } from '@/lib/sala-event-log'
import { SupabaseEventLogStorage } from '@/lib/sala-event-log/storage/supabase'
import { getSupabaseAdmin } from '@/lib/supabase'

// canon · canon canon-Vercel · canon-canon-trigger wire es delgado ·
// canon-canon-default 60s (post-shadow no hace dispatch · sólo append +
// decide + log) · canon-canon-no need bumping.
export const maxDuration = 60

const ACCEPTED_SOURCES: ReadonlySet<TriggerSource> = new Set([
  'synthetic',
  'cron_new_clients_scan',
  'webhook_onboarding_form',
])

/**
 * Canon canonical · pick the right storage adapter ·
 *   - canon canon-canon-`SALA_TRIGGER_STORAGE=memory` → InMemoryEventLogStorage
 *     (canon-canonical-tests + canon-canonical-CI smoke without DB)
 *   - canon-canon-default · canon-canonical-SupabaseEventLogStorage wired al
 *     admin client (canon-canon-prod path · requires PR #141 applied · canon-
 *     canonical-§144-gated en escalón 1 · canon-canon-canonical-checked).
 */
function buildStorageForRequest():
  | { ok: true; storage: DispatchSalaTriggerConfig['storage'] }
  | { ok: false; error: string } {
  const driver = (process.env.SALA_TRIGGER_STORAGE ?? 'supabase').toLowerCase()
  if (driver === 'memory') {
    return { ok: true, storage: new InMemoryEventLogStorage() }
  }
  try {
    const supabase = getSupabaseAdmin()
    return { ok: true, storage: new SupabaseEventLogStorage(supabase) }
  } catch (e) {
    return {
      ok: false,
      error: `supabase_admin_unavailable · ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

export async function POST(request: Request) {
  // canon · canon canon-auth gate · canon-canonical-same pattern que
  // canon canon-`/api/onboarding` · canon-canonical-internal-only.
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: 'refused',
        refused_reason: 'unauthorized',
        code: 'E-AUTH-001',
        detail: auth.reason,
      },
      { status: 401 },
    )
  }

  // canon · canon canon-parse + validate body shape
  let raw: Record<string, unknown>
  try {
    raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  } catch {
    raw = {}
  }
  const validated = validateObject<Record<string, unknown>>(raw, 'sala-trigger-onboard')
  if (!validated.ok) return validated.response
  const body = validated.data

  const tenant_id = typeof body.tenant_id === 'string' ? body.tenant_id : ''
  const client_id = typeof body.client_id === 'string' ? body.client_id : ''
  const journey_type =
    typeof body.journey_type === 'string' ? body.journey_type : 'ONBOARD'
  const sourceRaw = typeof body.source === 'string' ? (body.source as TriggerSource) : 'synthetic'
  const source: TriggerSource = ACCEPTED_SOURCES.has(sourceRaw) ? sourceRaw : 'synthetic'
  const external_id =
    typeof body.external_id === 'string' ? body.external_id : ''
  const logical_period =
    typeof body.logical_period === 'string' ? body.logical_period : ''
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : undefined
  const stream_id = typeof body.stream_id === 'string' ? body.stream_id : undefined
  const correlation_id =
    typeof body.correlation_id === 'string' ? body.correlation_id : undefined

  const input: SalaTriggerInput = {
    tenant_id,
    client_id,
    journey_type: journey_type as SalaTriggerInput['journey_type'],
    source,
    external_id,
    logical_period,
    payload,
    stream_id,
    correlation_id,
  }

  // canon · canon canon-storage adapter
  const storageBuild = buildStorageForRequest()
  if (!storageBuild.ok) {
    return NextResponse.json(
      {
        ok: false,
        mode: 'refused',
        refused_reason: storageBuild.error,
      },
      { status: 503 },
    )
  }

  try {
    const result = await dispatchSalaTrigger(input, { storage: storageBuild.storage })
    const status =
      result.mode === 'refused'
        ? result.refused_reason === 'unauthorized'
          ? 401
          : 200 // canon · canon canon-refused is a normal 200 response with refused_reason · canon-canon-tools log + retry differently than 4xx/5xx
        : 200
    return NextResponse.json(
      {
        ok: result.mode === 'shadow',
        ...result,
      },
      { status },
    )
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        mode: 'refused',
        refused_reason: `dispatch_error · ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    )
  }
}

/**
 * GET · canon canon-canonical-health probe · canon-canonical-no DB hit ·
 * useful for canon-canonical-uptime monitoring + canon-canon-flag echo.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    canon: 'sala-trigger-onboard',
    mode: 'shadow',
    flags: {
      SALA_SHADOW_TRIGGERS_ENABLED: process.env.SALA_SHADOW_TRIGGERS_ENABLED ?? 'unset',
      SALA_TRIGGERS_REAL_SOURCES_ENABLED:
        process.env.SALA_TRIGGERS_REAL_SOURCES_ENABLED ?? 'unset',
      SALA_TRIGGER_STORAGE: process.env.SALA_TRIGGER_STORAGE ?? 'unset (default supabase)',
    },
  })
}
