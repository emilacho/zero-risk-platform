/**
 * LA RESPUESTA YA PAGADA · leer del registro lo que el empleado ya cobró.
 *
 * E92 (CC#3 · 17-sep) nació dentro de `run-sdk` para el arreglo A: si la conexión con el
 * corredor se cae mientras se lee la respuesta, el empleado **ya terminó y ya se cobró**, y su
 * respuesta queda en `agent_invocations`. E96 la saca acá porque ahora la usan dos: el propio
 * `run-sdk` y el rescate del manual de marca (arreglo D · las revisiones leían lo ya pagado
 * reintentando y pagando dos veces · medido por CC#2 en E86).
 *
 * Tope de espera · **120 s** · POR QUÉ: medido el 17-sep, la fila apareció **20 s** después de
 * un corte y **58 s** después del otro (E91 corrigió el «18 s» de E86). 120 s es 2× el peor caso
 * medido. Pasado el tope es **«no sé»**, nunca un valor inventado (el arreglo C de CC#1 lo
 * convierte en parada ruidosa aguas abajo).
 *
 * 🔴 Sólo se entrega una fila que se pueda PROBAR entera (E92 ①: la fila declara
 * `response_truncated` / `response_length*`). Una respuesta recortada NO se entrega.
 */
import { getSupabaseAdmin } from '@/lib/supabase'

export const RECUPERACION_TOPE_MS = 120_000
export const RECUPERACION_SONDEO_MS = 5_000

/**
 * E96 ① · CC#1 lo dejó dicho certificando E94 (observación latente, no defecto): la espera se
 * cortaba en la primera vuelta ante CUALQUIER estado distinto de `completed`, **incluido
 * `running`**. `running` no es un fallo: es «todavía no». Hoy el corredor escribe la fila al
 * terminar, pero su tipo contempla ese estado y en una corrida paga eso muerde.
 */
const ESTADOS_EN_CURSO = new Set(['running', 'in_progress', 'started', 'pending', 'queued', 'waiting'])
const ESTADOS_BUENOS = new Set(['completed', 'success', 'ok'])

export interface FilaInvocacion {
  status?: string | null
  output_summary?: string | null
  session_id?: string | null
  model?: string | null
  cost_usd?: number | string | null
  duration_ms?: number | string | null
  tokens_input?: number | string | null
  tokens_output?: number | string | null
  metadata?: Record<string, unknown> | null
}

export interface RespuestaPagada {
  success: boolean
  response: string
  sessionId: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  model: string
  brandSectionToolCall?: { input: Record<string, unknown>; emission_count: number }
  discoveryToolCall?: { input: Record<string, unknown>; emission_count: number }
  fidelityScoresToolCall?: { input: Record<string, unknown>; emission_count: number }
}

/** ¿se puede PROBAR que la respuesta guardada está entera? · sin prueba, no se entrega */
export function filaEstaEntera(fila: FilaInvocacion): { entera: boolean; motivo?: string } {
  const guardado = (fila.output_summary ?? '').length
  const m = (fila.metadata ?? {}) as Record<string, unknown>
  if (guardado === 0) return { entera: false, motivo: 'la fila no tiene respuesta guardada' }
  if (m.response_truncated === true) return { entera: false, motivo: 'la fila declara que está recortada' }
  const declarado = Number(m.response_length_real ?? m.response_length ?? NaN)
  if (!Number.isFinite(declarado)) {
    return { entera: false, motivo: 'la fila no declara cuánto medía la respuesta · no se puede probar que esté entera' }
  }
  if (declarado !== guardado) {
    return { entera: false, motivo: `recortada · medía ${declarado} y se guardaron ${guardado}` }
  }
  return { entera: true }
}

function comoObjeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** arma la respuesta del corredor a partir de la fila ya pagada */
export function respuestaDesdeLaFila(fila: FilaInvocacion): RespuestaPagada {
  const m = (fila.metadata ?? {}) as Record<string, unknown>
  const num = (v: unknown, x = 0) => (Number.isFinite(Number(v)) ? Number(v) : x)
  const brand = comoObjeto(m.brand_section)
  const discovery = comoObjeto(m.discovery_output ?? m.discovery_tool_call)
  const fidelity = comoObjeto(m.fidelity_scores)
  return {
    success: true,
    response: fila.output_summary ?? '',
    sessionId: fila.session_id ?? null,
    inputTokens: num(fila.tokens_input),
    outputTokens: num(fila.tokens_output),
    costUsd: num(fila.cost_usd),
    durationMs: num(fila.duration_ms),
    model: typeof fila.model === 'string' ? fila.model : 'unknown',
    ...(brand ? { brandSectionToolCall: { input: brand, emission_count: 1 } } : {}),
    ...(discovery ? { discoveryToolCall: { input: discovery, emission_count: 1 } } : {}),
    ...(fidelity ? { fidelityScoresToolCall: { input: fidelity, emission_count: 1 } } : {}),
  }
}

/** lee del registro la fila de ESTA invocación · la más reciente del mismo paso y corrida */
export async function buscarFilaDelEmpleado(
  agente: string,
  paso: string | null,
  executionId: string | null,
  desdeMs: number,
): Promise<FilaInvocacion | null> {
  const supabase = getSupabaseAdmin()
  let q = supabase
    .from('agent_invocations')
    .select('status,output_summary,session_id,model,cost_usd,duration_ms,tokens_input,tokens_output,metadata')
    .eq('agent_id', agente)
    // margen de 60 s hacia atrás · el corredor sella `started_at` antes que nosotros
    .gte('started_at', new Date(desdeMs - 60_000).toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
  if (executionId) q = q.eq('workflow_execution_id', executionId)
  if (paso) q = q.eq('metadata->>step_name', paso)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data && data[0] ? (data[0] as FilaInvocacion) : null
}

/**
 * Espera la fila del empleado y devuelve su respuesta real · `null` si no se puede probar
 * que esté entera, si nunca llegó, o si el empleado falló. Exportada para la prueba.
 */
export async function recuperarRespuestaPagada(
  ctx: {
    agent: string
    step?: string | null
    executionId?: string | null
    topeMs?: number
    sondeoMs?: number
    /** de dónde viene la llamada · sale en la línea del registro */
    quien?: string
  },
  deps: {
    buscarFila: () => Promise<FilaInvocacion | null>
    esperar?: (ms: number) => Promise<void>
    ahora?: () => number
  },
): Promise<RespuestaPagada | null> {
  const topeMs = ctx.topeMs ?? RECUPERACION_TOPE_MS
  const sondeoMs = ctx.sondeoMs ?? RECUPERACION_SONDEO_MS
  const ahora = deps.ahora ?? (() => Date.now())
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const quien = ctx.quien ?? 'run-sdk'
  const empezo = ahora()
  const comun = `agent=${ctx.agent} · step=${ctx.step ?? '-'} · exec=${ctx.executionId ?? '-'} · tope=${Math.round(topeMs / 1000)}s`
  let ultimoMotivo = 'la fila nunca apareció'
  for (let vuelta = 1; ; vuelta++) {
    let fila: FilaInvocacion | null = null
    try {
      fila = await deps.buscarFila()
    } catch (e) {
      ultimoMotivo = `no se pudo leer el registro · ${e instanceof Error ? e.message : String(e)}`
    }
    if (fila) {
      const estado = (fila.status ?? '').toLowerCase()
      if (estado && ESTADOS_EN_CURSO.has(estado)) {
        // E96 ① · «todavía no» NO es un fallo: se sigue esperando hasta el tope
        ultimoMotivo = `el empleado sigue trabajando · status=${estado}`
      } else if (estado && !ESTADOS_BUENOS.has(estado)) {
        ultimoMotivo = `el empleado no terminó bien · status=${estado}`
        break
      } else {
        const { entera, motivo } = filaEstaEntera(fila)
        if (entera) {
          const esperoS = ((ahora() - empezo) / 1000).toFixed(1)
          console.warn(
            `[${quien}] respuesta_recuperada · la respuesta ya estaba pagada y entera · ` +
              `${comun} · espera=${esperoS}s · vueltas=${vuelta} · caracteres=${(fila.output_summary ?? '').length} · ` +
              `costo_ya_pagado=${fila.cost_usd ?? '-'}`,
          )
          return respuestaDesdeLaFila(fila)
        }
        ultimoMotivo = motivo ?? 'no se pudo probar que estuviera entera'
        // la fila ya está escrita y no se reescribe: si se puede PROBAR que no sirve, no se
        // insiste. Sólo se sigue esperando cuando la fila todavía no existe o está en curso.
        if (
          motivo &&
          (motivo.startsWith('recortada') ||
            motivo.startsWith('la fila declara') ||
            motivo.startsWith('la fila no declara'))
        ) {
          break
        }
      }
    }
    if (ahora() - empezo + sondeoMs >= topeMs) break
    await esperar(sondeoMs)
  }
  console.warn(
    `[${quien}] respuesta_no_recuperada · sigue siendo «no sé» (nunca un valor inventado) · ` +
      `${comun} · espera=${((ahora() - empezo) / 1000).toFixed(1)}s · motivo=${ultimoMotivo}`,
  )
  return null
}
