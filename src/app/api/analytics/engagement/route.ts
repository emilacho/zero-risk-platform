/**
 * GET|POST /api/analytics/engagement — stub de engagement metrics.
 * Usado por Expansion Readiness Scanner.
 */
import { handleReadStub } from '@/lib/read-stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeEngagement(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    sessions_30d: 45,
    avg_session_duration_s: 312,
    bounce_rate: 0.38,
    conversions_30d: 8,
    top_pages: ['/dashboard', '/reports', '/campaigns'],
  }
}

export async function GET(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'analytics.engagement', makeResponse: makeEngagement }) }
export async function POST(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'analytics.engagement', makeResponse: makeEngagement }) }
