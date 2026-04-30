/**
 * /api/social-schedules/[id]
 *  PATCH → update status, external_post_id, error, attempts (publisher worker callback)
 */
import { genericGetById, genericPatch } from '@/lib/crud-helpers'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(_request)
  if (!auth.ok) return auth.response

  return genericGetById('social_schedules', ctx.params.id)
}

export async function PATCH(request: Request, ctx: { params: { id: string } }) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return genericPatch('social_schedules', ctx.params.id, request, [
    'status', 'external_post_id', 'external_url', 'error', 'attempts', 'published_at',
  ])
}
