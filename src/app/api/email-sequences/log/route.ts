import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'email_sequences',
    transform: (r) => ({
      client_id: r.client_id || 'unknown',
      contact_id: r.contact_id || null,
      sequence_type: r.sequence_type || r.event_type || 'unknown',
      sequence_data: r.sequence_data || r,
    }),
  })
}
