/**
 * POST /api/ghl/tag — tag a GHL contact.
 * Usado por Lead Enrichment & Scoring.
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
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
