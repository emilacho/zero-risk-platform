/**
 * GET|POST /api/clients/health-history — histórico de health scores.
 * Usado por Customer Health Score Daily, Churn Prediction 90d.
 */
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeHealthHistory(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  // Generate 30 days of synthetic history
  const history = []
  for (let i = 29; i >= 0; i--) {
    history.push({
      date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
      health_score: 65 + Math.round(Math.random() * 15),
      tier: 'Yellow',
    })
  }
  return {
    client_id,
    history,
    trend_7d: 'stable',
    trend_30d: 'up',
    days: 30,
  }
}

export async function GET(r: Request) { return handleReadStub(r, { name: 'clients.health-history', makeResponse: makeHealthHistory }) }
export async function POST(r: Request) { return handleReadStub(r, { name: 'clients.health-history', makeResponse: makeHealthHistory }) }
