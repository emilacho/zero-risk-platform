import { handleStubPost } from '@/lib/stub-handler'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
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
