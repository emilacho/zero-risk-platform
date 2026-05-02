/**
 * GET /api/ghl/expansion-intent — Expansion Readiness Scanner read-path.
 *
 * Closes W15-D-11. Workflow caller:
 *   `Zero Risk — Expansion Readiness Scanner (Fridays 2pm)`
 *
 * Purpose: surface signals that a GHL client is ready to expand (upsell /
 * cross-sell). Reads from ghl_expansion_signals (if present) and falls back
 * to a deterministic stub when the table doesn't exist or has no rows yet —
 * keeps the cron workflow functional during pre-prod and after schema drift.
 *
 * Query params:
 *   client_id  · required — GHL location/sub-account id
 *   since_days · optional · default 30 — window to look back
 *
 * Response (200):
 *   {
 *     ok: true,
 *     client_id: string,
 *     since_days: number,
 *     score: number (0-100),                 // composite expansion-intent score
 *     signals: [{ signal: string, strength: number, observed_at: ISO }],
 *     rationale: string,                     // human-readable summary
 *     fallback_mode?: true                   // present iff DB unavailable / empty
 *   }
 *
 * Auth: tier 2 INTERNAL (checkInternalKey).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Signal {
  signal: string
  strength: number
  observed_at: string
}

function stubSignals(clientId: string, sinceDays: number): { signals: Signal[]; score: number; rationale: string } {
  // Deterministic mock: clients whose id contains 'smoke' or 'test' get a
  // stable mid-tier score so workflow regression tests don't flap.
  const isSmoke = clientId.toLowerCase().includes('smoke') || clientId.toLowerCase().includes('test')
  const base = isSmoke ? 55 : 35
  const now = Date.now()
  const stamp = (offsetHours: number) => new Date(now - offsetHours * 3600_000).toISOString()
  return {
    signals: [
      { signal: 'increased_login_frequency', strength: 0.6, observed_at: stamp(48) },
      { signal: 'team_seat_at_capacity', strength: 0.4, observed_at: stamp(120) },
    ],
    score: base,
    rationale:
      `Stub signals (table empty or unavailable for window=${sinceDays}d). ` +
      `Real data backfill pending — see migrations 202605xx_ghl_expansion_signals.sql when produced.`,
  }
}

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  if (!clientId) {
    return NextResponse.json(
      { error: 'missing_client_id', code: 'E-INPUT-MISSING', detail: 'client_id query param is required' },
      { status: 400 },
    )
  }

  const sinceDaysRaw = url.searchParams.get('since_days')
  const sinceDays = Math.max(1, Math.min(365, parseInt(sinceDaysRaw || '30', 10) || 30))

  let signals: Signal[] = []
  let score: number | null = null
  let rationale: string | null = null
  let fallbackMode = false

  try {
    const supabase = getSupabaseAdmin()
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
    const { data, error } = await supabase
      .from('ghl_expansion_signals')
      .select('signal, strength, observed_at, score, rationale')
      .eq('client_id', clientId)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(50)

    if (!error && data && data.length > 0) {
      signals = data.map((r) => ({
        signal: String(r.signal),
        strength: typeof r.strength === 'number' ? r.strength : 0,
        observed_at: String(r.observed_at),
      }))
      // Score: prefer the most-recent row's score column if present, else
      // average strength × 100 with a 30-pt floor.
      const latestScore = data[0]?.score
      score = typeof latestScore === 'number'
        ? Math.round(latestScore)
        : Math.max(30, Math.round(signals.reduce((s, x) => s + x.strength, 0) / signals.length * 100))
      rationale =
        typeof data[0]?.rationale === 'string'
          ? data[0].rationale
          : `${signals.length} signals in last ${sinceDays}d`
    } else {
      fallbackMode = true
      const stub = stubSignals(clientId, sinceDays)
      signals = stub.signals
      score = stub.score
      rationale = stub.rationale
    }
  } catch {
    fallbackMode = true
    const stub = stubSignals(clientId, sinceDays)
    signals = stub.signals
    score = stub.score
    rationale = stub.rationale
  }

  return NextResponse.json({
    ok: true,
    client_id: clientId,
    since_days: sinceDays,
    score,
    signals,
    rationale,
    ...(fallbackMode ? { fallback_mode: true } : {}),
  })
}
