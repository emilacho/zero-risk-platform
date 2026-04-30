/**
 * GET|POST /api/ghl/relationships — GHL relationship map (contacts, opportunities).
 * Usado por Customer Health Score Daily, Churn Prediction 90d.
 */
import { handleReadStub } from '@/lib/read-stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeRelationships(body: Record<string, unknown>) {
  const client_id = (body.client_id as string) || 'smoke-client-001'
  return {
    client_id,
    primary_contact: {
      id: 'ghl-contact-001',
      name: 'Smoke Contact',
      email: 'smoke@example.com',
      phone: '+1-555-0100',
      role: 'decision_maker',
    },
    stakeholders: [
      { id: 'ghl-contact-002', name: 'Champion', role: 'champion', engagement: 'high' },
      { id: 'ghl-contact-003', name: 'Blocker', role: 'potential_blocker', engagement: 'low' },
    ],
    champion_count: 1,
    blocker_count: 1,
    total_contacts: 3,
    last_interaction_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  }
}

export async function GET(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'ghl.relationships', makeResponse: makeRelationships }) }
export async function POST(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response
 return handleReadStub(r, { name: 'ghl.relationships', makeResponse: makeRelationships }) }
