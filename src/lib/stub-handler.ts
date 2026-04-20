/**
 * Shared helper for stub endpoints that just write the incoming body to a Supabase
 * table. Keeps all the stub routes below as thin 3-line wrappers.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from './supabase'
import { checkInternalKey } from './internal-auth'

type StubOptions = {
  table: string
  requiredFields?: string[]
  transform?: (row: Record<string, unknown>) => Record<string, unknown>
}

export async function handleStubPost(request: Request, opts: StubOptions) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const rawRows = Array.isArray(body) ? body : Array.isArray(body?.rows) ? body.rows : [body]

  const rows = rawRows.map(r => (opts.transform ? opts.transform(r) : r))

  if (opts.requiredFields) {
    for (const r of rows) {
      for (const f of opts.requiredFields) {
        if (r[f] === undefined || r[f] === null || r[f] === '') {
          return NextResponse.json({ error: 'missing_field', field: f, table: opts.table }, { status: 400 })
        }
      }
    }
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from(opts.table).insert(rows).select('id')
  if (error) {
    return NextResponse.json(
      { error: 'db_error', table: opts.table, detail: error.message, code: error.code, hint: error.hint },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, table: opts.table, inserted: data?.length ?? 0, ids: (data ?? []).map(r => r.id) })
}
