/**
 * GET|POST /api/analytics/nps — stub de NPS scores per client.
 * Usado por Account Health, Expansion Readiness, Client NPS+CSAT Monthly.
 */
import { handleReadStub } from '@/lib/read-stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeNps(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    nps_score: 42,
    csat_score: 4.3,
    response_count: 12,
    promoters: 6,
    passives: 4,
    detractors: 2,
    last_survey_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    trend_90d: 'up',
  }
}

export async function GET(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'analytics.nps', makeResponse: makeNps }) }
export async function POST(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'analytics.nps', makeResponse: makeNps }) }
