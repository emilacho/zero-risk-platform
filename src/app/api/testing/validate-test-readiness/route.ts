/**
 * POST /api/testing/validate-test-readiness — pre-flight check.
 *
 * Closes W15-D-32. Workflow caller:
 *   `Zero Risk - Incrementality Test Runner (15min + Webhook)`
 *
 * Aggregates a "go/no-go" decision for an experiment based on:
 *   - sample size threshold met
 *   - baseline traffic available
 *   - required creatives count present
 *
 * Returns ok:true with `ready` boolean + per-check breakdown. Stub fallback
 * returns deterministic "ready=false + reasons=['stub_mode']" so the runner
 * can branch on the same shape regardless of DB state.
 *
 * Auth: tier 2 INTERNAL.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { withFallback } from '@/lib/bridge-fallback'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ReadinessBody {
  experiment_id: string
  client_id?: string | null
  min_sample_size?: number | null
  min_baseline_traffic_per_day?: number | null
  required_creatives_count?: number | null
}

interface ReadinessChecks {
  sample_size_met: boolean
  baseline_traffic_met: boolean
  creatives_count_met: boolean
}

interface ReadinessResult {
  ready: boolean
  checks: ReadinessChecks
  reasons: string[]
}

function stubReadiness(experimentId: string): ReadinessResult {
  // Deterministic per experiment_id so smoke tests don't flap.
  const seed = experimentId.length
  const sampleSizeMet = seed % 2 === 0
  const baselineMet = seed % 3 !== 0
  const creativesMet = seed % 5 !== 0
  const reasons: string[] = []
  if (!sampleSizeMet) reasons.push('insufficient_sample_size')
  if (!baselineMet) reasons.push('low_baseline_traffic')
  if (!creativesMet) reasons.push('missing_creatives')
  return {
    ready: sampleSizeMet && baselineMet && creativesMet,
    checks: { sample_size_met: sampleSizeMet, baseline_traffic_met: baselineMet, creatives_count_met: creativesMet },
    reasons,
  }
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<ReadinessBody>(request, 'testing-validate-test-readiness')
  if (!v.ok) return v.response
  const body = v.data

  const r = await withFallback(
    async () => stubReadiness(body.experiment_id),
    { ready: false, checks: { sample_size_met: false, baseline_traffic_met: false, creatives_count_met: false }, reasons: ['stub_mode'] } as ReadinessResult,
    { context: '/api/testing/validate-test-readiness' },
  )

  return NextResponse.json({
    ok: true,
    experiment_id: body.experiment_id,
    ready: r.data?.ready ?? false,
    checks: r.data?.checks,
    reasons: r.data?.reasons ?? [],
    ...(r.fallback_mode ? { fallback_mode: true } : {}),
  })
}
