/**
 * /api/content-packages/[id]
 *  GET   → fetch one
 *  PATCH → update copy/email/media_plan/images/videos/brand_review/status
 */
import { genericGetById, genericPatch } from '@/lib/crud-helpers'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  return genericGetById('content_packages', ctx.params.id)
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericPatch('content_packages', ctx.params.id, request, [
    'copy', 'email', 'media_plan', 'images', 'videos', 'brand_review', 'status', 'cost_usd',
  ])
}
