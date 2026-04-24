/**
 * POST /api/content/publish/landing — deploy content to landing page (Vercel/Framer).
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    table: 'content_publish_log',
    transform: (r) => ({
      channel: 'landing',
      client_id: r.client_id || null,
      task_id: r.task_id || null,
      deploy_url: `https://zero-risk-platform.vercel.app/stub/landing-${Date.now()}`,
      published_at: new Date().toISOString(),
      data: r,
    }),
  })
}
