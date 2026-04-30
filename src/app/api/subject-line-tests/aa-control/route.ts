import { handleStubPost } from '@/lib/stub-handler'
import { requireInternalApiKey } from '@/lib/auth-middleware'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  return handleStubPost(request, {
    table: 'subject_line_tests',
    transform: (r) => ({
      client_id: r.client_id || 'unknown',
      test_type: 'aa_control',
      subject_a: r.subject_a || null,
      subject_b: r.subject_b || null,
      segment_size: typeof r.segment_size === 'number' ? r.segment_size : null,
      data: r,
    }),
  })
}
