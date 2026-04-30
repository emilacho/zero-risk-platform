/**
 * POST /api/content/publish/ghl — publish via GoHighLevel (contacts + opportunities + workflows).
 */
import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'content_publish_log',
    transform: (r) => ({
      channel: 'ghl',
      client_id: r.client_id || null,
      task_id: r.task_id || null,
      ghl_campaign_id: `ghl-stub-${Date.now()}`,
      published_at: new Date().toISOString(),
      data: r,
    }),
  })
}
