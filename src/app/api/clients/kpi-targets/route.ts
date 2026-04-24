/**
 * GET|POST /api/clients/kpi-targets — KPI targets per client for QBR.
 */
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeKpis(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    targets: {
      leads_per_quarter: { target: 200, actual: 145 },
      cac_usd: { target: 150, actual: 165 },
      ltv_usd: { target: 2400, actual: 2600 },
      conversion_rate: { target: 0.025, actual: 0.023 },
      nps: { target: 50, actual: 42 },
      churn_rate: { target: 0.05, actual: 0.062 },
    },
    period: body.period || 'Q1-2026',
  }
}

export async function GET(r: Request) { return handleReadStub(r, { name: 'clients.kpi-targets', makeResponse: makeKpis }) }
export async function POST(r: Request) { return handleReadStub(r, { name: 'clients.kpi-targets', makeResponse: makeKpis }) }
