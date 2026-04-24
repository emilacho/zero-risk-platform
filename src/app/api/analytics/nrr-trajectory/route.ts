/**
 * GET|POST /api/analytics/nrr-trajectory — Net Revenue Retention trajectory stub.
 * Usado por Churn Prediction 90d, Expansion Readiness Scanner.
 */
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeNrr(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    current_arr_usd: 36000,
    prior_arr_usd: 30000,
    nrr_pct: 120,
    expansion_usd: 6000,
    contraction_usd: 0,
    churn_usd: 0,
    trajectory_90d: [100, 105, 112, 120],
    next_renewal_at: new Date(Date.now() + 75 * 86400000).toISOString(),
  }
}

export async function GET(r: Request) { return handleReadStub(r, { name: 'analytics.nrr-trajectory', makeResponse: makeNrr }) }
export async function POST(r: Request) { return handleReadStub(r, { name: 'analytics.nrr-trajectory', makeResponse: makeNrr }) }
