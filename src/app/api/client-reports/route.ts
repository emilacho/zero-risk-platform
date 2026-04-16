/**
 * /api/client-reports
 *  POST → create a weekly/monthly client report (Weekly Client Report Generator)
 *  GET  → list (Mission Control)
 */
import { genericList, genericInsert } from '@/lib/crud-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return genericInsert('client_reports', request, {
    requireAuth: true,
    required: ['client_id', 'period_start', 'period_end', 'summary'],
    defaults: { status: 'draft', kind: 'weekly' },
  })
}

export async function GET(request: Request) {
  return genericList('client_reports', request, {
    filterableColumns: ['client_id', 'status', 'kind'],
    orderColumn: 'period_end',
  })
}
