import { handleStubPost } from '@/lib/stub-handler'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  return handleStubPost(request, {
    table: 'influencer_rejections',
    transform: (r) => ({
      client_id: r.client_id || 'unknown',
      influencer_handle: r.influencer_handle || null,
      platform: r.platform || null,
      rejection_reason: r.rejection_reason || r.reason || null,
      data: r,
    }),
  })
}
