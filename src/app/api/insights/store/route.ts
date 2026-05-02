/**
 * POST /api/insights/store — Creative Performance Learner write-path.
 *
 * Closes W15-D-19. Workflow caller:
 *   `Zero Risk - Creative Performance Learner (Daily 4am)`
 *
 * Generic insight store — accepts any payload object under a typed key. Used
 * by ML loops (creative-learner, attribution-validator, others) to record
 * learnings that downstream agents can pull via /api/outcomes/query.
 *
 * Auth: tier 2 INTERNAL. Validation: Ajv `insights-store`. Persists to
 * `agent_insights`; graceful fallback if table missing.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface InsightsStoreBody {
  client_id?: string | null
  insight_type: string
  payload: Record<string, unknown>
  source?: string | null
  confidence?: number | null
  evidence?: string[] | null
  agent_slug?: string | null
  request_id?: string | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<InsightsStoreBody>(request, 'insights-store')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id ?? null,
    insight_type: body.insight_type,
    payload: body.payload,
    source: body.source ?? null,
    confidence: body.confidence ?? null,
    evidence: body.evidence ?? [],
    agent_slug: body.agent_slug ?? null,
    request_id: body.request_id ?? null,
    created_at: new Date().toISOString(),
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('agent_insights')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({
        ok: true,
        fallback_mode: true,
        persisted_id: null,
        note: `DB write failed gracefully: ${error.message.slice(0, 200)}`,
      })
    }

    return NextResponse.json({ ok: true, persisted_id: data?.id })
  } catch (err) {
    return NextResponse.json({
      ok: true,
      fallback_mode: true,
      persisted_id: null,
      note: `DB exception: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    })
  }
}
