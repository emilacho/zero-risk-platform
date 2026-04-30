/**
 * POST /api/ghl/tag — tag a GHL contact.
 * Usado por Lead Enrichment & Scoring.
 */
import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'ghl_tags_log',
    transform: (r) => ({
      contact_id: r.contact_id || r.id || 'unknown',
      tag: r.tag || 'untagged',
      client_id: r.client_id || null,
      tagged_at: new Date().toISOString(),
      data: r,
    }),
  })
}
