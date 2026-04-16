/**
 * /api/content-packages/[id]
 *  GET   → fetch one
 *  PATCH → update copy/email/media_plan/images/videos/brand_review/status
 */
import { genericGetById, genericPatch } from '@/lib/crud-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  return genericGetById('content_packages', ctx.params.id)
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  return genericPatch('content_packages', ctx.params.id, request, [
    'copy', 'email', 'media_plan', 'images', 'videos', 'brand_review', 'status', 'cost_usd',
  ])
}
