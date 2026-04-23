import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/content-queue/store
// Stores repurposed variants. Workflow body: { client_id, source_pillar_id,
// repurposing_task_id, variants: [{platform, content, metadata}, ...] | {platform: content, ...},
// queue_status, auto_publish }
// Behavior: tolerates db schema drift AND any other runtime error (returns 200
// + fallback_mode:true) so one column mismatch OR thrown exception can't kill
// a whole workflow chain. Echoes body scalars so downstream n8n nodes keep
// $json.X flowing.
export async function POST(request: Request) {
  // Top-level try/catch so NOTHING below can produce a 500. Workflows need a
  // predictable response even when backend is fully broken.
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    // Parse + coerce body to an object no matter what the client sent. If body
    // is null / primitive / array, fall back to {} so destructuring never throws.
    let rawBody: unknown = {}
    try {
      rawBody = await request.json()
    } catch {
      rawBody = {}
    }
    const body: Record<string, unknown> =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {}

    const client_id = (typeof body.client_id === 'string' && body.client_id) || 'unknown'
    const source_pillar_id = body.source_pillar_id as string | undefined
    const pillar_id = body.pillar_id as string | undefined
    const variants = body.variants as unknown
    const queue_status = (typeof body.queue_status === 'string' && body.queue_status) || 'awaiting_approval'

    const pillarId = source_pillar_id || pillar_id || null

    // Accept variants as array of objects, object map (platform → content), or anything else.
    let variantsArr: Record<string, unknown>[] = []
    if (Array.isArray(variants)) {
      variantsArr = variants as Record<string, unknown>[]
    } else if (variants && typeof variants === 'object') {
      variantsArr = Object.entries(variants as Record<string, unknown>).map(([platform, content]) => ({
        platform,
        content: typeof content === 'string' ? content : JSON.stringify(content),
      }))
    }

    const rows = variantsArr.length
      ? variantsArr.map((v: Record<string, unknown>, i: number) => ({
          client_id,
          pillar_content_id: pillarId,
          variant_platform: (v.platform as string) || (v.variant_platform as string) || `variant_${i}`,
          variant_content: (v.content as string) || (v.variant_content as string) || '',
          variant_metadata: (v.metadata as unknown) || (v.variant_metadata as unknown) || v,
          status: queue_status,
        }))
      : [{
          client_id,
          pillar_content_id: pillarId,
          variant_platform: 'stub',
          variant_content: '',
          variant_metadata: body,
          status: queue_status,
        }]

    let inserted = 0
    let ids: string[] = []
    let dbError: string | null = null
    try {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase.from('content_repurposing_queue').insert(rows).select('id')
      if (error) {
        dbError = error.message
      } else {
        inserted = data?.length ?? 0
        ids = (data ?? []).map((r: { id: string }) => r.id)
      }
    } catch (e: unknown) {
      dbError = e instanceof Error ? e.message : String(e)
    }

    // Echo body scalars so downstream n8n nodes can still read $json.X (task_id, pillar_id, etc.)
    const echo: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (k === 'variants') continue
      echo[k] = v
    }

    return NextResponse.json({
      ...echo,
      ok: true,
      inserted,
      ids,
      variant_count: rows.length,
      ...(dbError ? { fallback_mode: true, db_error: dbError.slice(0, 400) } : {}),
    })
  } catch (e: unknown) {
    // Absolute last resort — never let this route 500.
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: true,
      inserted: 0,
      ids: [],
      variant_count: 0,
      fallback_mode: true,
      handler_error: msg.slice(0, 400),
    })
  }
}
