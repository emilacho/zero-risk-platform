/**
 * GET|POST /api/analytics/adoption — stub de adoption metrics per client.
 * Usado por Account Health Score, Expansion Readiness Scanner.
 */
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeAdoption(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    adoption_score: 72,
    features_activated: 8,
    features_total: 12,
    dau_wau_ratio: 0.42,
    last_active_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    trend_7d: 'stable',
    trend_30d: 'up',
  }
}

export async function GET(r: Request) { return handleReadStub(r, { name: 'analytics.adoption', makeResponse: makeAdoption }) }
export async function POST(r: Request) { return handleReadStub(r, { name: 'analytics.adoption', makeResponse: makeAdoption }) }
