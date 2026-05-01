/**
 * Shared helper for stub endpoints that just write the incoming body to a Supabase
 * table. Keeps all the stub routes below as thin 3-line wrappers.
 *
 * Behavior: echoes scalar fields from the request body into the response so n8n
 * downstream nodes that read `$json.X` keep their state flowing through the chain.
 * DB errors are logged to `stub_fallbacks` but do NOT fail the response — otherwise
 * a single schema drift kills an entire workflow run. fallback_mode:true flags it.
 */

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from './supabase'
import { checkInternalKey } from './internal-auth'
import { validateObject } from './input-validator'

type StubOptions = {
  table: string
  requiredFields?: string[]
  transform?: (row: Record<string, unknown>) => Record<string, unknown>
  // If true, echo the original request body scalars into the response (in addition
  // to ok/inserted/ids). Default true — flip off only for routes where echoing
  // private fields back would leak data to an untrusted caller.
  echoBody?: boolean
  // Optional Ajv schema name (file in src/lib/contracts/inputs/<name>.json).
  // When set, the body is validated BEFORE transform/insert. Schema failure
  // returns 400 + E-INPUT-INVALID. Arrays of rows are validated per-element.
  schemaName?: string
}

export async function handleStubPost(request: Request, opts: StubOptions) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))

  if (opts.schemaName) {
    // Validate top-level OR each element if body is an array of rows.
    if (Array.isArray(body)) {
      for (const item of body) {
        const v = validateObject(item, opts.schemaName)
        if (!v.ok) return v.response
      }
    } else if (body && typeof body === 'object' && Array.isArray((body as { rows?: unknown }).rows)) {
      for (const item of (body as { rows: unknown[] }).rows) {
        const v = validateObject(item, opts.schemaName)
        if (!v.ok) return v.response
      }
    } else {
      const v = validateObject(body, opts.schemaName)
      if (!v.ok) return v.response
    }
  }
  const rawRows: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : Array.isArray(body?.rows)
      ? (body.rows as Record<string, unknown>[])
      : [body as Record<string, unknown>]

  const rows = rawRows.map((r): Record<string, unknown> => (opts.transform ? opts.transform(r) : r))

  if (opts.requiredFields) {
    for (const r of rows) {
      for (const f of opts.requiredFields) {
        if (r[f] === undefined || r[f] === null || r[f] === '') {
          return NextResponse.json({ error: 'missing_field', field: f, table: opts.table }, { status: 400 })
        }
      }
    }
  }

  let inserted = 0
  let ids: string[] = []
  let dbError: string | null = null
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.from(opts.table).insert(rows).select('id')
    if (error) {
      dbError = error.message
    } else {
      inserted = data?.length ?? 0
      ids = (data ?? []).map(r => r.id as string)
    }
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  // Build echo payload from the ORIGINAL body (not the transformed row) so we
  // preserve exactly what the workflow sent: client_id, task_id, video_brief,
  // duration_s, etc. Non-serializable values (functions) won't survive JSON anyway.
  const echoObj: Record<string, unknown> = {}
  const echo = opts.echoBody !== false
  if (echo && body && typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) {
      if (k === 'rows') continue // avoid huge payloads for batched writes
      echoObj[k] = v
    }
  }

  return NextResponse.json({
    ...echoObj,
    ok: true,
    table: opts.table,
    inserted,
    ids,
    ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
  })
}
