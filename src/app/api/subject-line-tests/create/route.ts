import { handleStubPost } from '@/lib/stub-handler'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
    table: 'subject_line_tests',
    transform: (r) => ({
      client_id: r.client_id || 'unknown',
      test_type: r.test_type || 'ab_test',
      subject_a: r.subject_a || null,
      subject_b: r.subject_b || null,
      segment_size: typeof r.segment_size === 'number' ? r.segment_size : null,
      data: r,
    }),
  })
}
