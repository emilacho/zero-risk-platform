/**
 * /api/content-packages
 *  POST → create package (Content Team Orchestrator persists final output here)
 *  GET  → list (Mission Control)
 */
import { genericList, genericInsert } from '@/lib/crud-helpers'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericInsert('content_packages', request, {
    requireAuth: true,
    required: ['client_id', 'brief'],
    defaults: { status: 'draft' },
  })
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericList('content_packages', request, {
    filterableColumns: ['client_id', 'status', 'campaign_id'],
  })
}
