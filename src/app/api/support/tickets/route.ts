/**
 * GET|POST /api/support/tickets — support tickets summary stub.
 * Usado por Customer Health Score Daily, Churn Prediction 90d.
 */
import { handleReadStub } from '@/lib/read-stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeTickets(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    open_count: 2,
    closed_30d: 8,
    avg_resolution_hours: 12.5,
    escalated_count: 0,
    tickets: [
      { id: 'tkt-001', status: 'open', priority: 'medium', subject: 'Stub ticket A', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: 'tkt-002', status: 'open', priority: 'low', subject: 'Stub ticket B', created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    ],
    satisfaction_score: 4.2,
  }
}

export async function GET(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'support.tickets', makeResponse: makeTickets }) }
export async function POST(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'support.tickets', makeResponse: makeTickets }) }
