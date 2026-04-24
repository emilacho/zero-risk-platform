/**
 * GET|POST /api/analytics/attribution — attribution data stub.
 * Usado por Closed-Loop Attribution.
 */
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeAttribution(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    attribution_model: 'data_driven',
    touchpoints: [
      { source: 'paid_search', channel: 'google_ads', attribution_pct: 0.35 },
      { source: 'organic', channel: 'seo', attribution_pct: 0.25 },
      { source: 'paid_social', channel: 'meta_ads', attribution_pct: 0.20 },
      { source: 'email', channel: 'lifecycle', attribution_pct: 0.15 },
      { source: 'direct', channel: 'direct', attribution_pct: 0.05 },
    ],
    total_revenue_usd: 8400,
    total_conversions: 12,
    period_days: 30,
  }
}

export async function GET(r: Request) { return handleReadStub(r, { name: 'analytics.attribution', makeResponse: makeAttribution }) }
export async function POST(r: Request) { return handleReadStub(r, { name: 'analytics.attribution', makeResponse: makeAttribution }) }
