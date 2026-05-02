/**
 * POST /api/content/publish/ghl — publish via GoHighLevel (contacts + opportunities + workflows).
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
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
