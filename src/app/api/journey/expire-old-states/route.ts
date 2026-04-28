/**
 * POST /api/journey/expire-old-states
 *
 * Cron job · TTL enforcement (cada 1h via n8n hourly cron).
 * Marca como `abandoned` los rows en `paused_hitl` cuyo `ttl_expires_at` ya
 * expiró. Inserta audit events en `journey_events`. Emite Sentry warning
 * E-PERSIST-002 por cada row procesado.
 *
 * Sprint #3 Wave 10 · CP4 · CC#1
 *
 * Spec: docs/05-orquestacion/persist-resume/ttl-cron-spec.md
 * Schema: supabase/migrations/202604280003_persist_resume_columns.sql
 *
 * Auth: x-api-key (INTERNAL_API_KEY) · same pattern como /api/journey/dispatch
 *
 * Request body: opcional · soporta { dry_run: true } para simular sin escribir.
 *
 * Returns:
 *  200 OK → { success: true, expired: N, abandoned: M, errors: [...], processed_records: [...] }
 *  401 → unauthorized
 *  500 → query failed antes de procesar
 */
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import { capture } from '@/lib/posthog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min · per spec

// PostgREST devuelve PGRST205 si la tabla no existe; Postgres `42P01`.
const TABLE_MISSING_CODES = new Set(['PGRST205', '42P01'])

interface ProcessedRecord {
  journey_id: string
  client_id: string | null
  journey: string
  current_stage: string | null
  ttl_expires_at: string
  days_paused: number
  is_critical: boolean
}

export async function POST(request: Request) {
  const startedAt = Date.now()

  // Auth
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: 'unauthorized', detail: auth.reason },
      { status: 401 },
    )
  }

  // Parse body (opcional)
  let dryRun = false
  try {
    const body = await request.json()
    if (body && typeof body === 'object') {
      dryRun = body.dry_run === true
    }
  } catch {
    // body opcional · sin parsing failure se asume {}
  }

  const supabase = getSupabaseAdmin()
  const now = new Date()
  const nowIso = now.toISOString()

  // Query expired rows
  const expiredQuery = await supabase
    .from('client_journey_state')
    .select('id, client_id, journey, current_stage, ttl_expires_at, started_at, metadata')
    .eq('status', 'paused_hitl')
    .lt('ttl_expires_at', nowIso)
    .limit(1000)

  if (expiredQuery.error) {
    const code = (expiredQuery.error as { code?: string }).code
    if (code && TABLE_MISSING_CODES.has(code)) {
      return NextResponse.json(
        {
          success: false,
          error: 'service_unavailable',
          detail:
            'client_journey_state table not yet applied. Run migration 202604280001_client_journey_state.sql',
        },
        { status: 503 },
      )
    }
    Sentry.captureException(
      new Error(`expire-old-states query failed: ${expiredQuery.error.message}`),
      { tags: { source: 'ttl-enforcement-cron' } },
    )
    return NextResponse.json(
      {
        success: false,
        error: 'internal_error',
        detail: `Query failed: ${expiredQuery.error.message.slice(0, 200)}`,
      },
      { status: 500 },
    )
  }

  const expiredRows = (expiredQuery.data ?? []) as Array<{
    id: string
    client_id: string | null
    journey: string
    current_stage: string | null
    ttl_expires_at: string
    started_at: string
    metadata: Record<string, unknown> | null
  }>

  if (expiredRows.length === 0) {
    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      duration_ms: Date.now() - startedAt,
      expired: 0,
      abandoned: 0,
      errors: [],
      processed_records: [],
      dry_run: dryRun,
    })
  }

  const errors: string[] = []
  const processed: ProcessedRecord[] = []
  let abandoned = 0

  for (const row of expiredRows) {
    const daysPaused = Math.floor(
      (now.getTime() - new Date(row.started_at).getTime()) / 86400_000,
    )
    const isCritical =
      row.metadata && typeof row.metadata === 'object' && (row.metadata as { is_critical?: unknown }).is_critical === true

    const record: ProcessedRecord = {
      journey_id: row.id,
      client_id: row.client_id,
      journey: row.journey,
      current_stage: row.current_stage,
      ttl_expires_at: row.ttl_expires_at,
      days_paused: daysPaused,
      is_critical: Boolean(isCritical),
    }

    if (dryRun) {
      processed.push(record)
      continue
    }

    try {
      // 1. Mark abandoned (UPDATE)
      const updatedMetadata = {
        ...(row.metadata ?? {}),
        abandoned_reason: 'ttl_expired',
        ttl_was: row.ttl_expires_at,
      }
      const updateResult = await supabase
        .from('client_journey_state')
        .update({
          status: 'abandoned',
          abandoned_at: nowIso,
          metadata: updatedMetadata,
        })
        .eq('id', row.id)
        .eq('status', 'paused_hitl') // Concurrency guard · si webhook ya cambió a active, skip

      if (updateResult.error) {
        const msg = `${row.id}: update failed · ${updateResult.error.message.slice(0, 200)}`
        errors.push(msg)
        Sentry.captureException(new Error(msg), {
          tags: { source: 'ttl-enforcement-cron', error_code: 'E-PERSIST-001' },
          extra: { journey_id: row.id },
        })
        continue
      }

      // 2. Audit event (best-effort · no aborta si falla)
      try {
        await supabase.from('journey_events').insert({
          journey_id: row.id,
          event_type: 'journey_abandoned_ttl',
          actor: 'system:ttl-enforcement',
          details: {
            ttl_expires_at: row.ttl_expires_at,
            days_paused: daysPaused,
            current_stage: row.current_stage,
            is_critical: isCritical,
          },
        })
      } catch (auditErr) {
        const msg = `${row.id}: audit insert failed · ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`
        errors.push(msg.slice(0, 200))
      }

      // 3. Sentry breadcrumb (WARNING · expected behavior)
      Sentry.captureMessage(
        `[E-PERSIST-002] Journey ${row.id} abandoned by TTL expiration`,
        {
          level: 'warning',
          tags: {
            source: 'ttl-enforcement-cron',
            error_code: 'E-PERSIST-002',
            journey: row.journey,
          },
          extra: {
            client_id: row.client_id,
            current_stage: row.current_stage,
            days_paused: daysPaused,
          },
        },
      )

      // 4. PostHog event
      capture('journey_abandoned_ttl', String(row.client_id ?? 'system'), {
        journey_id: row.id,
        journey: row.journey,
        current_stage: row.current_stage,
        days_paused: daysPaused,
      })

      // 5. MC Inbox alert si crítico (best-effort · no aborta)
      if (isCritical) {
        try {
          const mcUrl = process.env.MC_BASE_URL
          const mcToken = process.env.MC_API_TOKEN
          if (mcUrl && mcToken) {
            await fetch(
              `${mcUrl.replace(/\/+$/, '')}/api/inbox?masterPassword=${encodeURIComponent(mcToken)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'ttl-enforcement-cron',
                  to: 'jefe-client-success',
                  type: 'alert',
                  severity: 'high',
                  subject: `Journey ${row.journey} abandoned · client ${row.client_id ?? '∅'} · follow-up needed`,
                  body: `Journey paused for ${daysPaused} days exceeded TTL. Auto-marked abandoned. Manual follow-up recommended. journey_id=${row.id}`,
                }),
              },
            )
          }
        } catch (mcErr) {
          // Sub-best-effort · solo log, no abort
          errors.push(
            `${row.id}: MC inbox alert failed · ${mcErr instanceof Error ? mcErr.message : String(mcErr)}`.slice(
              0,
              200,
            ),
          )
        }
      }

      abandoned++
      processed.push(record)
    } catch (e: unknown) {
      const msg = `${row.id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
      errors.push(msg)
      Sentry.captureException(new Error(msg), {
        tags: { source: 'ttl-enforcement-cron' },
      })
    }
  }

  const durationMs = Date.now() - startedAt
  const nextRun = new Date(now.getTime() + 3600_000).toISOString() // hourly cadence

  return NextResponse.json({
    success: true,
    timestamp: nowIso,
    duration_ms: durationMs,
    expired: expiredRows.length,
    abandoned: dryRun ? 0 : abandoned,
    errors,
    next_run: nextRun,
    processed_records: processed,
    dry_run: dryRun,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/journey/expire-old-states',
    method: 'POST',
    schedule: 'cron · hourly (n8n)',
    auth: 'x-api-key (INTERNAL_API_KEY)',
    body: '{ "dry_run": true }   ← opcional · simula sin escribir',
    returns: '200 · { success, expired, abandoned, errors, processed_records }',
    spec: 'docs/05-orquestacion/persist-resume/ttl-cron-spec.md',
  })
}
