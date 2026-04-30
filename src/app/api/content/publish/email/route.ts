/**
 * POST /api/content/publish/email — stub para publicar content via email (Mailgun/GHL SMTP).
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
      channel: 'email',
      client_id: r.client_id || null,
      task_id: r.task_id || null,
      content_type: r.content_type || 'email',
      subject: (r.content && (r.content as Record<string, unknown>).subject) || r.subject || null,
      recipients: r.recipients || r.audience || [],
      published_at: new Date().toISOString(),
      data: r,
    }),
  })
}
