/**
 * /api/experiments
 *  POST → create CRO experiment (Landing Page CRO Optimizer)
 *  GET  → list
 */
import { genericList, genericInsert } from '@/lib/crud-helpers'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })

  return genericInsert('experiments', request, {
    requireAuth: true,
    required: ['client_id', 'hypothesis', 'variants', 'primary_metric'],
    defaults: { status: 'draft' },
  })
}

export async function GET(request: Request) {
  return genericList('experiments', request, {
    filterableColumns: ['client_id', 'status', 'website_id'],
  })
}
