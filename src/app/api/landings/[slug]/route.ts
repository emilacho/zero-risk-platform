/**
 * /api/landings/[slug] · Sprint 4 · CC#2
 *
 * GET    · landing detail by slug (admin-gated for full data · public render goes via /landings/[slug] page)
 * PATCH  · update landing (admin-gated)
 * DELETE · soft delete via is_active=false
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const slug = params.slug.toLowerCase()
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'validation', code: 'E-LANDINGS-SLUG', detail: 'slug invalid' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('landings')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-LANDINGS-GET', detail: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-LANDINGS-404', detail: `landing "${slug}" not found` },
        { status: 404 },
      )
    }

    return NextResponse.json({ landing: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-LANDINGS-GET-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const slug = params.slug.toLowerCase()
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'validation', code: 'E-LANDINGS-SLUG', detail: 'slug invalid' },
      { status: 400 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'bad_request', code: 'E-LANDINGS-JSON', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') update.title = body.title.trim()
  if (typeof body.hero_headline === 'string') update.hero_headline = body.hero_headline.trim()
  if (typeof body.hero_subhead === 'string' || body.hero_subhead === null) update.hero_subhead = body.hero_subhead
  if (typeof body.hero_image_url === 'string' || body.hero_image_url === null) update.hero_image_url = body.hero_image_url
  if (typeof body.cta_text === 'string') update.cta_text = body.cta_text
  if (typeof body.cta_url === 'string') update.cta_url = body.cta_url
  if (Array.isArray(body.sections)) update.sections = body.sections
  if (typeof body.meta_description === 'string' || body.meta_description === null) update.meta_description = body.meta_description
  if (typeof body.meta_og_image_url === 'string' || body.meta_og_image_url === null) update.meta_og_image_url = body.meta_og_image_url
  if (typeof body.vertical === 'string' || body.vertical === null) update.vertical = body.vertical
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('landings')
      .update(update)
      .eq('slug', slug)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-LANDINGS-PATCH', detail: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-LANDINGS-404', detail: `landing "${slug}" not found` },
        { status: 404 },
      )
    }

    return NextResponse.json({ landing: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-LANDINGS-PATCH-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: { slug: string } }) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const slug = params.slug.toLowerCase()
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'validation', code: 'E-LANDINGS-SLUG', detail: 'slug invalid' },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('landings')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('slug', slug)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-LANDINGS-DELETE', detail: error.message },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not_found', code: 'E-LANDINGS-404', detail: `landing "${slug}" not found` },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true, deactivated: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-LANDINGS-DELETE-EXC', detail: msg },
      { status: 500 },
    )
  }
}
