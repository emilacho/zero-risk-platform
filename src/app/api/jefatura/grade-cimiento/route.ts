/**
 * POST /api/jefatura/grade-cimiento
 *
 * Punto de llamada POR CONTRATO de la Jefatura para el cimiento (brand book)
 * (Sprint JEFATURA F2.1 · ADR-020 §68-74). El journey deal-won, TRAS `Persist
 * Canon`, POSTea acá el artefacto + los `fidelity_scores` que YA computó su nodo
 * judge (`[BB] Judge · run-sdk` · tool `emit_fidelity_scores`). Este endpoint NO
 * llama al LLM · sólo DECIDE por contrato: la fidelidad promueve/re-corrige/escala.
 *
 * Body ·
 *   {
 *     artifact_id, client_id?, journey_id?,
 *     brand_book_draft: {...}, evidence: {...}, evidence_refs?: [...],
 *     fidelity_scores: { positioning: 0..1, icp_summary: 0..1, ... },  // del judge n8n
 *     fidelity_cycle?: number, cycle?: number,
 *   }
 *
 * Respuesta (200) · { ok, action: 'promote'|'recorrect'|'escalate_hitl',
 *                     verdict, scores, corrections, grounding, provisional, trace_id }
 *
 * §148 · la migración `jefatura_grading_policies` + el nodo n8n son build post-GO.
 * Si la tabla/política no existe → la Jefatura ESCALATE (nunca aprueba a ciegas).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import type { JefaturaDeps } from '@/lib/jefatura/service'
import type { JefaturaGradingPolicy } from '@/lib/jefatura/contract'
import { makeFidelityCanonGrader } from '@/lib/jefatura/fidelity-lane'
import { gradeOnboardingCimiento } from '@/lib/jefatura/onboarding-cimiento'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  artifact_id?: string
  client_id?: string | null
  journey_id?: string | null
  brand_book_draft?: Record<string, unknown>
  evidence?: Record<string, unknown>
  evidence_refs?: Array<{ field?: string; chunk_id?: string | null; grounding?: 'chunk_linked' | 'prose_only' }>
  fidelity_scores?: Record<string, number>
  fidelity_cycle?: number
  cycle?: number
}

/** Lee la política del registry vía PostgREST directo. null si no existe (→ ESCALATE). */
async function fetchPolicy(artifactType: string): Promise<JefaturaGradingPolicy | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!baseUrl || !key) return null
  const res = await fetch(
    `${baseUrl}/rest/v1/jefatura_grading_policies?artifact_type=eq.${encodeURIComponent(artifactType)}&is_active=eq.true&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json().catch(() => [])) as JefaturaGradingPolicy[]
  return rows?.[0] ?? null
}

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  if (!body.artifact_id) {
    return NextResponse.json({ ok: false, error: 'artifact_id_required' }, { status: 400 })
  }

  // El scorer NO llama al LLM · devuelve los scores que ya computó el nodo judge n8n.
  const precomputedScores = body.fidelity_scores ?? {}
  const deps: JefaturaDeps = {
    fetchPolicy,
    graders: {
      // La corrección real (lentes/jefes · Lazo A) es LLM · se cablea aparte; acá
      // sólo fluyen las correcciones del grader de fidelidad en un no-pase.
      correction: { correct: async () => [] },
      fidelity: makeFidelityCanonGrader({ score: async () => precomputedScores }),
      vote3ofN: { grade: async () => ({ verdict: 'ESCALATE', scores: {}, corrections: [] }) },
    },
  }

  try {
    const result = await gradeOnboardingCimiento(
      {
        clientId: body.client_id ?? null,
        journeyId: body.journey_id ?? null,
        artifactId: body.artifact_id,
        brandBookDraft: body.brand_book_draft ?? {},
        evidence: body.evidence ?? {},
        evidenceRefs: body.evidence_refs ?? [],
        fidelityCycle: body.fidelity_cycle ?? 1,
        cycle: body.cycle ?? 0,
      },
      deps,
    )
    return NextResponse.json({
      ok: true,
      action: result.action,
      verdict: result.output.verdict,
      scores: result.output.scores,
      corrections: result.output.corrections,
      grounding: result.grounding,
      provisional: result.provisional,
      trace_id: result.output.trace_id,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'grade_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
