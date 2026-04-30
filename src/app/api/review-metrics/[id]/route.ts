/**
 * /api/review-metrics/[id]
 *  PATCH → record AI/HITL response: { response, status, responded_at }
 */
import { genericGetById, genericPatch } from '@/lib/crud-helpers'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  return genericGetById('review_metrics', ctx.params.id)
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericPatch('review_metrics', ctx.params.id, request, [
    'response', 'responded_at', 'status', 'sentiment',
  ])
}
