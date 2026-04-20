import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInternalKey } from '@/lib/internal-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/content-queue/store
// Stores repurposed variants. Workflow body: { client_id, source_pillar_id,
// repurposing_task_id, variants: [{platform, content, metadata}, ...], queue_status, auto_publish }
// Table schema: one row per variant (pillar_content_id, variant_platform, variant_content, variant_metadata, status).
export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const {
    client_id = 'unknown',
    source_pillar_id,
    pillar_id,
    variants = [],
    queue_status = 'awaiting_approval',
  } = body

  const pillarId = source_pillar_id || pillar_id || null
  const variantsArr = Array.isArray(variants) ? variants : []

  const rows = variantsArr.length
    ? variantsArr.map((v, i) => ({
        client_id,
        pillar_content_id: pillarId,
        variant_platform: v.platform || v.variant_platform || `variant_${i}`,
        variant_content: v.content || v.variant_content || '',
        variant_metadata: v.metadata || v.variant_metadata || v,
        status: queue_status,
      }))
    : [{
        // Fallback: no variants provided, store a single placeholder row so the caller gets an id
        client_id,
        pillar_content_id: pillarId,
        variant_platform: 'stub',
        variant_content: '',
        variant_metadata: body,
        status: queue_status,
      }]

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('content_repurposing_queue').insert(rows).select('id')
  if (error) {
    return NextResponse.json({ error: 'db_error', detail: error.message, hint: error.hint }, { status: 500 })
  }
  return NextResponse.json({ ok: true, inserted: data?.length ?? 0, ids: (data ?? []).map(r => r.id) })
}
