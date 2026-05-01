/**
 * POST /api/content/publish/email — stub para publicar content via email (Mailgun/GHL SMTP).
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
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
