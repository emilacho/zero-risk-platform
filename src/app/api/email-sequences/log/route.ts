import { handleStubPost } from '@/lib/stub-handler'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
    table: 'email_sequences',
    transform: (r) => ({
      client_id: r.client_id || 'unknown',
      contact_id: r.contact_id || null,
      sequence_type: r.sequence_type || r.event_type || 'unknown',
      sequence_data: r.sequence_data || r,
    }),
  })
}
