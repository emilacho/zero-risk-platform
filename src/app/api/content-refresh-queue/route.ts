/**
 * GET|POST /api/content-refresh-queue — queue para GEO content freshness.
 * Usado por GEO Content Freshness Cron.
 */
import { handleStubPost } from '@/lib/stub-handler'
import { handleReadStub } from '@/lib/read-stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(r: Request) {
  const auth = await requireInternalApiKey(r)
  if (!auth.ok) return auth.response

  return handleReadStub(r, {
    name: 'content-refresh-queue.list',
    makeResponse: () => ({
      items: [],
      count: 0,
    }),
  })
}

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'content_refresh_queue',
    transform: (r) => ({
      client_id: r.client_id,
      url: r.url,
      reason: r.reason || 'stale_content',
      priority: r.priority || 'normal',
      queued_at: new Date().toISOString(),
      data: r,
    }),
  })
}
