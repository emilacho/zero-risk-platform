/**
 * /api/client-reports/[id]
 *  GET   → fetch one
 *  PATCH → update status, pdf_url, delivered_to, delivered_at
 */
import { genericGetById, genericPatch } from '@/lib/crud-helpers'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  return genericGetById('client_reports', ctx.params.id)
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericPatch('client_reports', ctx.params.id, request, [
    'status', 'pdf_url', 'delivered_to', 'delivered_at', 'summary',
  ])
}
