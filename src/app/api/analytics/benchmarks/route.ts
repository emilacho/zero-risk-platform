/**
 * GET|POST /api/analytics/benchmarks — industry benchmarks stub.
 * Usado por QBR Generator Quarterly.
 */
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeBenchmarks(body: Record<string, unknown>) {
  const industry = (body.industry as string) || 'unknown'
  return {
    industry,
    benchmarks: {
      avg_cac_usd: 150,
      avg_ltv_usd: 2400,
      avg_conversion_rate: 0.023,
      avg_engagement_rate: 0.041,
      avg_nps: 38,
      avg_churn_rate: 0.065,
    },
    percentiles: {
      p25: { cac: 100, ltv: 1800, nps: 20 },
      p50: { cac: 150, ltv: 2400, nps: 38 },
      p75: { cac: 220, ltv: 3200, nps: 55 },
      p90: { cac: 300, ltv: 4500, nps: 70 },
    },
    data_source: 'stub',
  }
}

export async function GET(r: Request) { return handleReadStub(r, { name: 'analytics.benchmarks', makeResponse: makeBenchmarks }) }
export async function POST(r: Request) { return handleReadStub(r, { name: 'analytics.benchmarks', makeResponse: makeBenchmarks }) }
