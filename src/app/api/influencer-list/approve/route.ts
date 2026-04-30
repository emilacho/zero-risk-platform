import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'influencer_approved_list',
    requiredFields: ['client_id', 'influencer_handle'],
    transform: (r) => ({
      client_id: r.client_id,
      influencer_handle: r.influencer_handle,
      platform: r.platform || null,
      authenticity_score: typeof r.authenticity_score === 'number' ? r.authenticity_score : null,
      data: r,
    }),
  })
}
