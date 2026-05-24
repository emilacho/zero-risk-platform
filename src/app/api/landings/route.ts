/**
 * /api/landings · Sprint 4 · CC#2
 *
 * GET  · list landings (admin-gated) · ?is_active filter · ?vertical filter
 * POST · create landing (admin-gated)
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const isActiveParam = url.searchParams.get('is_active')
  const vertical = url.searchParams.get('vertical')

  try {
    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('landings')
      .select(
        'id, slug, client_id, title, hero_headline, hero_subhead, hero_image_url, cta_text, cta_url, sections, meta_description, meta_og_image_url, is_active, vertical, created_at, updated_at',
      )
      .order('created_at', { ascending: false })

    if (isActiveParam === 'true') query = query.eq('is_active', true)
    if (isActiveParam === 'false') query = query.eq('is_active', false)
    if (vertical) query = query.eq('vertical', vertical)

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { error: 'db_error', code: 'E-LANDINGS-LIST', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ landings: data ?? [], count: (data ?? []).length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-LANDINGS-LIST-EXC', detail: msg },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  // Auth · requireAdmin is stricter than checkInternalKey (admin session) ·
  // lint-canon recognizes both markers post Sprint 8 D5.
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'bad_request', code: 'E-LANDINGS-JSON', detail: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const heroHeadline = typeof body.hero_headline === 'string' ? body.hero_headline.trim() : ''

  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      {
        error: 'validation',
        code: 'E-LANDINGS-SLUG',
        detail: 'slug required · lowercase a-z 0-9 hyphens · 2-64 chars',
      },
      { status: 400 },
    )
  }
  if (!title) {
    return NextResponse.json(
      { error: 'validation', code: 'E-LANDINGS-TITLE', detail: 'title required' },
      { status: 400 },
    )
  }
  if (!heroHeadline) {
    return NextResponse.json(
      { error: 'validation', code: 'E-LANDINGS-HERO', detail: 'hero_headline required' },
      { status: 400 },
    )
  }

  const insertRow = {
    slug,
    client_id: typeof body.client_id === 'string' ? body.client_id : null,
    title,
    hero_headline: heroHeadline,
    hero_subhead: typeof body.hero_subhead === 'string' ? body.hero_subhead : null,
    hero_image_url: typeof body.hero_image_url === 'string' ? body.hero_image_url : null,
    cta_text: typeof body.cta_text === 'string' ? body.cta_text : 'Comenzar',
    cta_url: typeof body.cta_url === 'string' ? body.cta_url : '#',
    sections: Array.isArray(body.sections) ? body.sections : [],
    meta_description: typeof body.meta_description === 'string' ? body.meta_description : null,
    meta_og_image_url: typeof body.meta_og_image_url === 'string' ? body.meta_og_image_url : null,
    vertical: typeof body.vertical === 'string' ? body.vertical : null,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('landings')
      .insert(insertRow)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'conflict', code: 'E-LANDINGS-DUP-SLUG', detail: `slug "${slug}" already exists` },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: 'db_error', code: 'E-LANDINGS-INSERT', detail: error.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ landing: data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'internal', code: 'E-LANDINGS-INSERT-EXC', detail: msg },
      { status: 500 },
    )
  }
}
