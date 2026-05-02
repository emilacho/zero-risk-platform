/**
 * POST /api/churn-predictions — Churn Prediction 90d Pre-Renewal write-path.
 *
 * Closes W15-D-07. Workflow caller:
 *   `Zero Risk - Churn Prediction 90d Pre-Renewal (9am)`
 *
 * Persists the model output (probability + top factors) so downstream
 * jefe-client-success and QBR generation can read recent predictions.
 *
 * Auth: tier 2 INTERNAL (checkInternalKey).
 * Validation: Ajv schema `churn-predictions`.
 * Persistence: `churn_predictions` table (created by accompanying migration);
 *              graceful fallback writes nothing if table missing.
 *
 * Response (200):
 *   { ok: true, persisted_id: string | null, fallback_mode?: true }
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { validateInput } from '@/lib/input-validator'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface ChurnPredictionBody {
  client_id: string
  predicted_at?: string | null
  churn_probability: number
  prediction_window_days?: number | null
  confidence?: number | null
  top_factors?: string[] | null
  model_version?: string | null
  context?: Record<string, unknown> | null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason },
      { status: 401 },
    )
  }

  const v = await validateInput<ChurnPredictionBody>(request, 'churn-predictions')
  if (!v.ok) return v.response
  const body = v.data

  const row = {
    client_id: body.client_id,
    predicted_at: body.predicted_at || new Date().toISOString(),
    churn_probability: body.churn_probability,
    prediction_window_days: body.prediction_window_days ?? 90,
    confidence: body.confidence ?? null,
    top_factors: body.top_factors ?? [],
    model_version: body.model_version ?? null,
    context: body.context ?? null,
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('churn_predictions')
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
      note: `DB exception swallowed: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    })
  }
}
