/**
 * /api/experiments
 *  POST → create CRO experiment (Landing Page CRO Optimizer)
 *  GET  → list
 */
import { genericList, genericInsert } from '@/lib/crud-helpers'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericInsert('experiments', request, {
    requireAuth: true,
    required: ['client_id', 'hypothesis', 'variants', 'primary_metric'],
    defaults: { status: 'draft' },
  })
}

export async function GET(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericList('experiments', request, {
    filterableColumns: ['client_id', 'status', 'website_id'],
  })
}
