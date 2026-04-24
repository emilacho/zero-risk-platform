/**
 * GET|POST /api/cannibalization-audits — SEO keyword cannibalization audits.
 * Usado por SEO Cannibalization Audit Weekly.
 */
import { handleStubPost } from '@/lib/stub-handler'
import { handleReadStub } from '@/lib/read-stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(r: Request) {
  return handleReadStub(r, {
    name: 'cannibalization-audits.list',
    makeResponse: () => ({ audits: [], count: 0 }),
  })
}

export async function POST(request: Request) {
  return handleStubPost(request, {
    table: 'seo_cannibalization_audits',
    transform: (r) => ({
      client_id: r.client_id,
      target_keyword: r.target_keyword || 'stub-keyword',
      conflicting_urls: r.conflicting_urls || [],
      recommended_action: r.recommended_action || 'consolidate',
      audited_at: new Date().toISOString(),
      data: r,
    }),
  })
}
