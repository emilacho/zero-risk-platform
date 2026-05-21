/**
 * POST /api/cascade/landing-from-outputs · Sprint 5 Track B · CC#2
 *
 * Cascade-canon-compliant landing creation endpoint. Called by the n8n sidecar
 * workflow `landing-generator` AFTER `/api/cascade/persist-outputs` finishes a
 * NEXUS campaign cascade · this endpoint is single-purpose · DB INSERT only ·
 * NO agent invocations · NO long-running work.
 *
 * Per cascade canon (CLAUDE.md 2026-05-16) · this is an "Allowed Vercel route
 * pattern · Storage/DB I/O endpoint · single-purpose · stateless · sub-second
 * response · NO agent calls".
 *
 * Body shape ·
 *   {
 *     client_id?: string (uuid · nullable)
 *     campaign_id: string
 *     client_name: string
 *     vertical?: string | null
 *     outputs: Record<string, unknown>  // keyed by agent stage
 *   }
 *
 * Behavior · uses `extractLandingContent` + `generateSlug` from
 * `src/lib/landings/content-extraction.ts` · INSERTs row to `landings` table ·
 * ON CONFLICT (slug) DO UPDATE so re-runs of same campaign are idempotent.
 *
 * Auth · `x-api-key INTERNAL_API_KEY`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { extractLandingContent, generateSlug, isValidSlug } from '@/lib/landings/content-extraction'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RequestBody {
  client_id?: string | null
  campaign_id?: string
  client_name?: string
  vertical?: string | null
  outputs?: Record<string, unknown>
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', code: 'E-LANDING-FROM-OUTPUTS-JSON' },
      { status: 400 },
    )
  }

  const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : ''
  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  const vertical = typeof body.vertical === 'string' && body.vertical.trim() ? body.vertical.trim() : null
  const clientId = typeof body.client_id === 'string' && body.client_id.trim() ? body.client_id.trim() : null
  const outputs = body.outputs && typeof body.outputs === 'object' ? body.outputs : null

  if (!campaignId) {
    return NextResponse.json(
      { ok: false, error: 'validation', code: 'E-LANDING-CAMPAIGN-ID', detail: 'campaign_id required' },
      { status: 400 },
    )
  }
  if (!clientName) {
    return NextResponse.json(
      { ok: false, error: 'validation', code: 'E-LANDING-CLIENT-NAME', detail: 'client_name required' },
      { status: 400 },
    )
  }
  if (!outputs) {
    return NextResponse.json(
      { ok: false, error: 'validation', code: 'E-LANDING-OUTPUTS', detail: 'outputs map required' },
      { status: 400 },
    )
  }

  const slug = generateSlug(clientName, campaignId)
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      { ok: false, error: 'slug_invalid', code: 'E-LANDING-SLUG', detail: `generated slug "${slug}" failed regex` },
      { status: 400 },
    )
  }

  const content = extractLandingContent(outputs, { client_name: clientName, vertical })

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('landings')
      .upsert(
        {
          slug,
          client_id: clientId,
          title: `${clientName} · ${vertical ?? 'campaign'}`,
          hero_headline: content.hero_headline,
          hero_subhead: content.hero_subhead,
          hero_image_url: content.hero_image_url,
          cta_text: content.cta_text,
          cta_url: content.cta_url,
          sections: content.sections,
          meta_description: content.meta_description,
          vertical,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' },
      )
      .select('id, slug, title, is_active')
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'db_error', code: 'E-LANDING-UPSERT', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      landing: data,
      url: `https://zero-risk-platform.vercel.app/landings/${slug}`,
      slug,
      campaign_id: campaignId,
      sections_count: content.sections.length,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: 'internal', code: 'E-LANDING-FROM-OUTPUTS-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cascade/landing-from-outputs',
    method: 'POST',
    purpose:
      'DB-only landing creation from NEXUS cascade outputs · canonical Capa 2 architecture (CLAUDE.md governance 2026-05-16) · sidecar pattern post-LAUNCH',
    auth: 'x-api-key INTERNAL_API_KEY',
    body_shape: {
      client_id: 'string (uuid · nullable · pre-onboarding form submits have null)',
      campaign_id: 'string (required · used for slug uniqueness)',
      client_name: 'string (required · used for slug + title)',
      vertical: 'string | null',
      outputs: 'Record<string, unknown> · keyed by agent stage',
    },
  })
}
