/**
 * POST /api/stitch/generate-variants — Google Stitch variant generation stub.
 * Usado por Landing Page CRO Optimizer (v1 y v2).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateObject } from '@/lib/input-validator'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const auth = checkInternalKey(request)
    if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })

    let raw: unknown = {}
    try { raw = await request.json() } catch { raw = {} }
    const body: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {}
    const _v = validateObject<Record<string, unknown>>(body, 'lenient-write')
    if (!_v.ok) return _v.response

    const variant_count = (typeof body.variant_count === 'number' ? body.variant_count : 3)
    const variants = []
    for (let i = 0; i < variant_count; i++) {
      variants.push({
        variant_id: `stitch-${Date.now()}-${i}`,
        name: `Variant ${String.fromCharCode(65 + i)}`,
        html_url: `https://stitch.design/stub/variant-${i}.html`,
        thumbnail_url: `https://stitch.design/stub/variant-${i}-thumb.png`,
        hypothesis: `Stub hypothesis for variant ${i}`,
      })
    }

    return NextResponse.json({
      ...body,
      ok: true,
      variants,
      count: variants.length,
      fallback_mode: true,
      note: 'Stub: real Stitch integration pending.',
    })
  } catch (e: unknown) {
    return NextResponse.json({
      ok: true,
      variants: [],
      count: 0,
      fallback_mode: true,
      handler_error: e instanceof Error ? e.message : String(e),
    })
  }
}
