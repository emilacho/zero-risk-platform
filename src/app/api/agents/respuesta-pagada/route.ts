/**
 * POST /api/agents/respuesta-pagada · E96 · CC#3 · 2026-09-18 · ARREGLO D.
 *
 * Por qué existe · CC#2 lo midió en E86: **las revisiones del manual de marca no se disfrazan,
 * pero PAGAN DOS VECES en lugar de leer la respuesta que ya se pagó.** En la bolita E83 el
 * rescate del cimiento reintentó una lente (US$ 0,1832) cuando la respuesta de la primera —ya
 * cobrada— estaba entera en `agent_invocations` 58 s después del corte.
 *
 * Esta puerta **lee** esa respuesta (misma vía que E92) y **no invoca a nadie**: cuesta US$ 0,00.
 *
 *   POST  { agent, step_name?, workflow_execution_id?, tope_ms?, costo_del_reintento_usd? }
 *   200   { ok:true,  recuperado:true,  agent, response, brand_section?, cost_usd,
 *           ahorro_usd, espera_ms, … }                      ← la respuesta REAL ya pagada
 *   200   { ok:false, recuperado:false, motivo }            ← «no sé» · quien llama decide
 *
 * 🔴 Nunca entrega una respuesta que no se pueda PROBAR entera (E92 ①). El «no sé» se lo come
 * el patrón ya publicado de CC#1 (arreglo C): el rescate para ruidoso con la causa.
 *
 * Auth · `x-api-key: INTERNAL_API_KEY`, igual que `/run-sdk` y `/log-invocation`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import {
  buscarFilaDelEmpleado,
  recuperarRespuestaPagada,
  RECUPERACION_TOPE_MS,
} from '@/lib/respuesta-pagada'

export const runtime = 'nodejs'
// el tope de espera es 120 s · 180 deja aire para el sondeo y la lectura
export const maxDuration = 180

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, recuperado: false, motivo: auth.reason }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, recuperado: false, motivo: 'cuerpo ilegible' }, { status: 400 })
  }

  const agent = typeof body.agent === 'string' ? body.agent.trim() : ''
  if (!agent) {
    return NextResponse.json({ ok: false, recuperado: false, motivo: 'falta `agent`' }, { status: 400 })
  }
  const step = typeof body.step_name === 'string' && body.step_name.length > 0 ? body.step_name : null
  const executionId =
    typeof body.workflow_execution_id === 'string' && body.workflow_execution_id.length > 0
      ? body.workflow_execution_id
      : null
  const topeMs = Number.isFinite(Number(body.tope_ms))
    ? Math.min(Math.max(Number(body.tope_ms), 5_000), RECUPERACION_TOPE_MS)
    : RECUPERACION_TOPE_MS
  // lo que habría costado reintentar · si no lo mandan, se usa lo que costó la propia fila
  const costoDelReintento = Number.isFinite(Number(body.costo_del_reintento_usd))
    ? Number(body.costo_del_reintento_usd)
    : null

  const empezo = Date.now()
  const desdeMs = Number.isFinite(Number(body.desde_ms)) ? Number(body.desde_ms) : empezo - RECUPERACION_TOPE_MS

  const recuperada = await recuperarRespuestaPagada(
    { agent, step, executionId, topeMs, quien: 'respuesta-pagada' },
    { buscarFila: () => buscarFilaDelEmpleado(agent, step, executionId, desdeMs) },
  )

  const esperaMs = Date.now() - empezo
  if (!recuperada) {
    return NextResponse.json({
      ok: false,
      recuperado: false,
      agent,
      step_name: step,
      workflow_execution_id: executionId,
      espera_ms: esperaMs,
      motivo: 'no hay respuesta pagada que se pueda probar entera · «no sé»',
    })
  }

  const ahorro = costoDelReintento ?? recuperada.costUsd
  console.warn(
    `[respuesta-pagada] leida_en_vez_de_reintentar · agent=${agent} · step=${step ?? '-'} · ` +
      `exec=${executionId ?? '-'} · espera=${(esperaMs / 1000).toFixed(1)}s · ` +
      `caracteres=${recuperada.response.length} · ahorro_usd=${ahorro.toFixed(6)} (no se volvió a invocar)`,
  )

  return NextResponse.json({
    ok: true,
    recuperado: true,
    agent,
    step_name: step,
    workflow_execution_id: executionId,
    // misma forma que devuelve el corredor · quien llama no tiene que cambiar cómo lee
    success: true,
    response: recuperada.response,
    session_id: recuperada.sessionId,
    model: recuperada.model,
    input_tokens: recuperada.inputTokens,
    output_tokens: recuperada.outputTokens,
    cost_usd: recuperada.costUsd,
    duration_ms: recuperada.durationMs,
    ...(recuperada.brandSectionToolCall ? { brand_section: recuperada.brandSectionToolCall.input } : {}),
    ...(recuperada.discoveryToolCall ? { discovery_output: recuperada.discoveryToolCall.input } : {}),
    ...(recuperada.fidelityScoresToolCall ? { fidelity_scores: recuperada.fidelityScoresToolCall.input } : {}),
    ahorro_usd: ahorro,
    espera_ms: esperaMs,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/agents/respuesta-pagada',
    method: 'POST',
    que_hace: 'lee del registro la respuesta que un empleado YA cobró · no invoca a nadie · US$ 0,00',
    auth: 'x-api-key: INTERNAL_API_KEY',
    body: { agent: 'slug', step_name: 'opcional', workflow_execution_id: 'opcional', tope_ms: 'opcional' },
    tope_ms_max: RECUPERACION_TOPE_MS,
    canon: 'E96 · arreglo D · sólo entrega lo que se puede PROBAR entero · si no, «no sé»',
  })
}
