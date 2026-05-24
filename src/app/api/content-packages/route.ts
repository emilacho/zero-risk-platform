/**
 * /api/content-packages
 *  POST → create package (Content Team Orchestrator persists final output here)
 *  GET  → list (Mission Control)
 */
import { genericList, genericInsert } from '@/lib/crud-helpers'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

  return genericInsert('content_packages', request, {
    requireAuth: true,
    required: ['client_id', 'brief'],
    defaults: { status: 'draft' },
  })
}

export async function GET(request: Request) {
  return genericList('content_packages', request, {
    filterableColumns: ['client_id', 'status', 'campaign_id'],
  })
}
