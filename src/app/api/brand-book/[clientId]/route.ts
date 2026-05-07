/**
 * GET /api/brand-book/[clientId]
 *
 * Returns the latest Brand Book v0 for a client (clients + client_brand_books +
 * client_icp_documents) as a single JSON payload. Used by the brand-book viewer
 * page and any external consumer that wants the structured brand assets.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ clientId: string }>
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ error: 'missing_client_id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const [clientRes, brandBookRes, icpsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, slug, industry, market, status')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('client_brand_books')
      .select('*')
      .eq('client_id', clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_icp_documents')
      .select('*')
      .eq('client_id', clientId)
      .order('segment_priority', { ascending: true }),
  ])

  if (!clientRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({
    client: clientRes.data,
    brand_book: brandBookRes.data ?? null,
    icps: icpsRes.data ?? [],
    approved: brandBookRes.data?.human_validated === true,
  })
}
