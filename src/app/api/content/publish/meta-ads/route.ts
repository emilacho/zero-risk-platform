/**
 * POST /api/content/publish/meta-ads — publish content as Meta Ads creative.
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    table: 'content_publish_log',
    transform: (r) => ({
      channel: 'meta_ads',
      client_id: r.client_id || null,
      task_id: r.task_id || null,
      ad_id: `meta-ad-stub-${Date.now()}`,
      published_at: new Date().toISOString(),
      data: r,
    }),
  })
}
