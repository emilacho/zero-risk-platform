/**
 * GET /api/health · Sprint Monitoreo FASE 2 (H1) · CC#2 · §144
 *
 * Centralized health panel · aggregates the 4 critical services in one public
 * GET. This is the endpoint Uptime Robot (FASE 3) polls 24/7.
 *
 *   n8n          · GET  N8N_BASE_URL/healthz                 → 200
 *   vercel       · self-check (this endpoint is responding)  → ok
 *   agent_runner · GET  RAILWAY_AGENT_RUNNER_URL/health      → 200
 *   supabase     · SELECT 1 FROM client_brain_chunks LIMIT 1 → no error
 *
 * Per service: 3s timeout. All run in parallel so total stays < 5s.
 * Public (no auth) — it is what an external monitor hits.
 *
 * HTTP code · 200 when ok/degraded · 503 when any service is down (so Uptime
 * Robot can alert on status code as well as body keyword).
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PER_SERVICE_TIMEOUT_MS = 3000
const SLOW_THRESHOLD_MS = 2000

type ServiceStatus = 'ok' | 'down'

interface Check {
  status: ServiceStatus
  latencyMs: number
}

/** Liveness GET against a URL · ok only on a 2xx response within the timeout. */
async function checkHttp(url: string | undefined): Promise<Check> {
  const started = Date.now()
  if (!url) return { status: 'down', latencyMs: 0 }
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(PER_SERVICE_TIMEOUT_MS),
      cache: 'no-store',
    })
    return { status: res.ok ? 'ok' : 'down', latencyMs: Date.now() - started }
  } catch {
    return { status: 'down', latencyMs: Date.now() - started }
  }
}

/** Supabase liveness · a tiny bounded read against client_brain_chunks. */
async function checkSupabase(): Promise<Check> {
  const started = Date.now()
  try {
    const supabase = getSupabaseAdmin()
    const query = supabase.from('client_brain_chunks').select('id').limit(1)
    const { error } = (await Promise.race([
      query,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PER_SERVICE_TIMEOUT_MS),
      ),
    ])) as { error: unknown }
    return { status: error ? 'down' : 'ok', latencyMs: Date.now() - started }
  } catch {
    return { status: 'down', latencyMs: Date.now() - started }
  }
}

function n8nHealthUrl(): string | undefined {
  const base = process.env.N8N_BASE_URL?.replace(/\/+$/, '')
  return base ? `${base}/healthz` : undefined
}

function agentRunnerHealthUrl(): string | undefined {
  const base = process.env.RAILWAY_AGENT_RUNNER_URL?.replace(/\/+$/, '')
  return base ? `${base}/health` : undefined
}

export async function GET() {
  // All checks run concurrently · each self-caps at 3s · total < 5s.
  const [n8n, agentRunner, supabase] = await Promise.all([
    checkHttp(n8nHealthUrl()),
    checkHttp(agentRunnerHealthUrl()),
    checkSupabase(),
  ])

  const services = {
    n8n: n8n.status,
    vercel: 'ok' as const, // self · if this responds, Vercel is serving
    agent_runner: agentRunner.status,
    supabase: supabase.status,
  }

  const checks = [n8n, agentRunner, supabase]
  const anyDown = checks.some((c) => c.status === 'down')
  const anySlow = checks.some((c) => c.status === 'ok' && c.latencyMs > SLOW_THRESHOLD_MS)
  const status: 'ok' | 'degraded' | 'down' = anyDown ? 'down' : anySlow ? 'degraded' : 'ok'

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      services,
      latency_ms: {
        n8n: n8n.latencyMs,
        agent_runner: agentRunner.latencyMs,
        supabase: supabase.latencyMs,
      },
    },
    { status: status === 'down' ? 503 : 200 },
  )
}
