/**
 * POST /api/competitors/deep-report — competitive intelligence 5-layer deep scan report.
 * Usado por Competitive Intelligence 5-Layer Deep Scan.
 */
import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
    table: 'competitor_deep_reports',
    transform: (r) => ({
      client_id: r.client_id,
      competitor_domain: r.competitor_domain || r.domain || 'example.com',
      layers: r.layers || {
        l1_ads: [],
        l2_seo: [],
        l3_social: [],
        l4_reviews: [],
        l5_tech: [],
      },
      insights: r.insights || [],
      generated_at: new Date().toISOString(),
      data: r,
    }),
  })
}
