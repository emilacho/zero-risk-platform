import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'review_responses_queue',
    transform: (r) => ({
      client_id: r.client_id || 'unknown',
      review_id: r.review_id || null,
      platform: r.platform || null,
      tier: r.tier || 'tier2',
      draft_response: r.draft_response || r.response || null,
      data: r,
    }),
  })
}
