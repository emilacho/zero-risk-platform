/**
 * POST /api/onboarding/report/[clientId]
 *
 * Onboarding executive report · Opción A (CC#3 2026-07-01). Assembles the
 * client's brand book + competitor data into a 6-slide content model (JSON)
 * and returns it. Trigger: fires when `client_brand_books` goes 0→1 (the
 * final onboarding step) · the caller is the brand-book Promote node (HTTP
 * Request node · never `fetch` in a Code node · postmortem rule H).
 *
 * The Google Slides/Drive RENDER is deferred: the platform has NO Google
 * service-account credential today (CC#3 pre-smoke audit) · this endpoint
 * produces the durable, provider-agnostic model · the render layer plugs in
 * once a credential exists.
 *
 * Data-mapping (verified vs prod):
 *   - positioning/icp_summary/customer_angle ← content_text.brand_book_draft.*
 *   - elevator_pitch/voice_description ← top-level columns (fallbacks)
 *   - competitors ← client_brain_chunks (source_table='client_competitive_landscape')
 *
 * Responses ·
 *   200 · { ok, report: ReportModel }
 *   400 · client_id_required
 *   401 · unauthorized
 *   404 · brand_book_not_found (client not onboarded yet)
 *   500 · internal error
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'
import {
  buildReportSlides,
  extractDraft,
  assembleCompetitors,
  type ReportInput,
} from '@/lib/onboarding-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ clientId: string }>
}

export async function POST(req: Request, { params }: RouteContext) {
  const auth = checkInternalKey(req)
  if (!auth.ok)
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )

  const { clientId } = await params
  if (!clientId)
    return NextResponse.json({ ok: false, error: 'client_id_required' }, { status: 400 })

  try {
    const supabase = getSupabaseAdmin()

    const [clientRes, bookRes, chunkRes] = await Promise.all([
      supabase.from('clients').select('name').eq('id', clientId).maybeSingle(),
      supabase
        .from('client_brand_books')
        .select('elevator_pitch,tagline,voice_description,content_text')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('client_brain_chunks')
        .select('section_label,source_id,source_table,chunk_text')
        .eq('client_id', clientId)
        .eq('source_table', 'client_competitive_landscape')
        .limit(200),
    ])

    if (bookRes.error)
      return NextResponse.json({ ok: false, error: bookRes.error.message }, { status: 500 })
    if (!bookRes.data)
      return NextResponse.json(
        { ok: false, error: 'brand_book_not_found', detail: 'client has no brand book yet' },
        { status: 404 },
      )

    const book = bookRes.data
    const draft = extractDraft(book)
    const competitors = assembleCompetitors(chunkRes.data ?? [])

    const input: ReportInput = {
      clientName: (clientRes.data?.name as string) || 'Cliente',
      // Caller-agnostic: stamp date server-side at request time.
      reportDateISO: new Date().toISOString(),
      elevatorPitch: book.elevator_pitch,
      tagline: book.tagline,
      positioning: (draft.positioning as string) ?? null,
      icpSummary: (draft.icp_summary as string) ?? null,
      voiceDescription: (draft.voice_description as string) ?? book.voice_description ?? null,
      customerAngle: (draft.customer_angle as string) ?? null,
      competitors,
    }

    const report = buildReportSlides(input)
    return NextResponse.json({ ok: true, report, render: 'deferred_pending_google_credential' })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
