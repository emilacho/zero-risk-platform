/**
 * GET|POST /api/clients/health-snapshot — health score actual de un cliente.
 * Usado por Customer Health Score Daily, Churn Prediction 90d.
 */
import { handleReadStub } from '@/lib/read-stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeHealthSnapshot(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    snapshot_at: new Date().toISOString(),
    health_score: 72,
    health_tier: 'Yellow', // Green / Yellow / Red
    dimensions: {
      adoption: 72,
      engagement: 65,
      nps: 42,
      support_load: 85,
      renewal_signal: 78,
    },
    risk_factors: ['low_nps_trend'],
    positive_factors: ['strong_adoption', 'active_engagement'],
  }
}

export async function GET(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'clients.health-snapshot', makeResponse: makeHealthSnapshot }) }
export async function POST(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'clients.health-snapshot', makeResponse: makeHealthSnapshot }) }
