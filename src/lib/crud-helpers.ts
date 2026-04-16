/**
 * Tiny generic CRUD helpers used by V3 endpoints (content_packages,
 * social_schedules, experiments, review_metrics, client_reports).
 *
 * They're deliberately minimal — write more handcrafted logic in the route file
 * when you need filters, joins, or status transitions.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from './supabase'
import { checkInternalKey } from './internal-auth'

interface ListOpts {
  /** filters from query string → column name. */
  filterableColumns?: string[]
  /** default order column. */
  orderColumn?: string
  /** default page size. */
  defaultLimit?: number
  /** max page size. */
  maxLimit?: number
}

export async function genericList(table: string, request: Request, opts: ListOpts = {}) {
  const supabase = getSupabaseAdmin()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? opts.defaultLimit ?? 50), opts.maxLimit ?? 200)

  let q = supabase
    .from(table)
    .select('*')
    .order(opts.orderColumn ?? 'created_at', { ascending: false })
    .limit(limit)

  for (const col of opts.filterableColumns ?? []) {
    const v = url.searchParams.get(col)
    if (v) q = q.eq(col, v)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function genericInsert(table: string, request: Request, options: { requireAuth?: boolean; required?: string[]; defaults?: Record<string, unknown> } = {}) {
  if (options.requireAuth) {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }
  const body = await request.json().catch(() => ({}))
  for (const f of options.required ?? []) {
    if (body?.[f] === undefined) return NextResponse.json({ error: `missing field: ${f}` }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()
  const row = { ...(options.defaults ?? {}), ...body }
  const { data, error } = await supabase.from(table).insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}

export async function genericGetById(table: string, id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function genericPatch(table: string, id: string, request: Request, allowed: string[]) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  for (const k of allowed) if (k in body) updates[k] = body[k]
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no updatable fields in body' }, { status: 400 })
  }
  // updated_at is best-effort — table may not have it.
  ;(updates as Record<string, unknown>).updated_at = new Date().toISOString()

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single()
  if (error) {
    // Retry without updated_at if column missing.
    if (/updated_at/.test(error.message)) {
      delete (updates as Record<string, unknown>).updated_at
      const retry = await supabase.from(table).update(updates).eq('id', id).select().single()
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
      return NextResponse.json({ item: retry.data })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}
