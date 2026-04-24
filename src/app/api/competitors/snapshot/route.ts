/**
 * POST /api/competitors/snapshot — daily competitor snapshot write.
 * Usado por Competitor Daily Monitor.
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    table: 'competitor_snapshots',
    transform: (r) => ({
      client_id: r.client_id,
      competitor_domain: r.competitor_domain || r.domain || 'example.com',
      snapshot_at: new Date().toISOString(),
      ads_count: typeof r.ads_count === 'number' ? r.ads_count : 0,
      keywords: r.keywords || [],
      data: r,
    }),
  })
}
