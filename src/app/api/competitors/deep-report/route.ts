/**
 * POST /api/competitors/deep-report — competitive intelligence 5-layer deep scan report.
 * Usado por Competitive Intelligence 5-Layer Deep Scan.
 */
import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
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
