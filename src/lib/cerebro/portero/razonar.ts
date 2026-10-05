/**
 * RAZONAR · la ÚNICA llamada al modelo del portero.
 *
 * Una llamada, sin reintentos, 25 s, razonamiento al mínimo, 1.500 «tokens» de salida, solo con `workflow_id`, con tope de gasto
 * por llamada y registrada. El modelo ELIGE números sobre la lista completa; el sistema copia el texto. Si el modelo falla, tarda,
 * contesta mal o la lista no cabe, la respuesta lo DICE (`modo: respaldo` y su motivo) y la corrida sigue: nada queda colgado.
 * Este módulo no sabe cómo se llama al modelo ni cómo se registra: los recibe (así se prueba con el modelo simulado).
 */
import type { Consulta } from '../consulta'
import { validarPedido } from '../conversacion'
import { construirListaCorta } from '../lista-corta'
import { NOMBRES_DE_FUENTE } from '../tipos'
import { interpretarDecision } from './decision'
import { armarMensaje, INSTRUCCION_DEL_PORTERO } from './instruccion'
import { numerarLista } from './lista-numerada'

export const MODELO = 'claude-sonnet-5-5'
/** el ajuste más bajo que acepta Sonnet 5.5 (rechaza apagarlo del todo): leer una lista y escoger números no necesita un cuaderno aparte */
export const RAZONAMIENTO = { type: 'between_tools' } as const
export const MAX_TOKENS_DE_SALIDA = 1500
export const TIEMPO_MAXIMO_MS = 25_000
/** una llamada que costaría más que esto no se hace (la real cuesta ≈ US$ 0,03) */
export const TOPE_DE_GASTO_POR_LLAMADA_USD = 0.08
/** una lista más grande que esto no se manda entera al modelo (≈ 126 líneas): se declara y se usa el respaldo */
export const TOPE_DE_LISTA_EN_UNIDADES = 12_000
/** US$ por millón de «tokens» (página oficial de precios de Anthropic consultada el 2026-10-05) */
export const PRECIO_POR_MILLON = { entrada: 2, salida: 10 } as const
/** el contador de Sonnet 5.5 cuenta ≈ 22–30 % más que la estimación de 2,8 caracteres por «token» */
const MARGEN_DEL_CONTADOR = 1.3

export class SinLlave extends Error {
  constructor() { super('no hay llave del modelo configurada en el servidor'); this.name = 'SinLlave' }
}

export interface PeticionAlModelo {
  model: string
  max_tokens: number
  thinking: { type: 'between_tools' }
  system: string
  messages: Array<{ role: 'user'; content: string }>
  timeoutMs: number
}
export interface RespuestaDelModelo { texto: string; usage: { input_tokens: number; output_tokens: number } }
export interface ResultadoDeRegistro { ok: boolean; detalle?: string }

export interface DepsDeRazonar {
  consulta: Consulta
  llamarModelo: (p: PeticionAlModelo) => Promise<RespuestaDelModelo>
  registrar: (fila: Record<string, unknown>) => Promise<ResultadoDeRegistro>
  ahora?: () => Date
  topeDeGastoUsd?: number
  topeDeLista?: number
}

export const costoDeLaLlamada = (usage: { input_tokens: number; output_tokens: number }): number =>
  (usage.input_tokens * PRECIO_POR_MILLON.entrada + usage.output_tokens * PRECIO_POR_MILLON.salida) / 1_000_000

const salida = (status: number, cuerpo: Record<string, unknown>) => ({ status, cuerpo })

export async function razonar(deps: DepsDeRazonar, body: unknown): Promise<{ status: number; cuerpo: Record<string, unknown> }> {
  const ahora = deps.ahora ?? (() => new Date())
  const pedidoValido = validarPedido(body)
  if (!pedidoValido.ok) return salida(400, { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores: pedidoValido.errores })
  const pedido = pedidoValido.pedido
  const b = body as Record<string, unknown>
  const workflowId = typeof b.workflow_id === 'string' && b.workflow_id ? b.workflow_id : null
  const ejecucionId = typeof b.workflow_execution_id === 'string' && b.workflow_execution_id ? b.workflow_execution_id : null
  if (!workflowId || !ejecucionId) {
    const faltan = [!workflowId && 'workflow_id', !ejecucionId && 'workflow_execution_id'].filter(Boolean)
    return salida(403, { error: 'workflow_id_required', code: 'E-WF-ID-REQUIRED', detail: `el modelo del portero solo se llama desde un flujo · falta(n): ${faltan.join(', ')}` })
  }

  const lista = await construirListaCorta(deps.consulta, pedido.cliente, { ahora: ahora() })
  const lecturas = Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, lista.fuentes[k].estado]))
  const sinModelo = (extra: Record<string, unknown>) => salida(200, { llamo_al_modelo: false, costo_usd: 0, tokens: { entrada: 0, salida: 0 }, duracion_ms: 0, lecturas, ...extra })

  if (lista.estado === 'cliente_inexistente' || lista.estado === 'error_de_lectura') {
    return sinModelo({ modo: 'respaldo', estado: lista.estado, motivo_de_respaldo: lista.estado })
  }
  const numerada = numerarLista(lista, { ya_trae: pedido.ya_trae })
  const comun = { huella: numerada.huella, ya_trae_desconocido: numerada.ya_trae_desconocido }
  const estadoLegible = lista.estado === 'ok' ? 'ok' : 'parcial'
  if (numerada.lineas.length === 0) {
    return sinModelo({ modo: 'conversado', estado: lista.estado === 'ok' ? 'sin_material' : 'parcial', decision: { entregar: [], sin_material: true }, ...comun })
  }

  const unidadesDeLaLista = Math.ceil(numerada.texto.length / 2.8)
  if (unidadesDeLaLista > (deps.topeDeLista ?? TOPE_DE_LISTA_EN_UNIDADES)) {
    return sinModelo({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'lista_mas_grande_que_el_tope', ...comun })
  }
  const mensaje = armarMensaje(pedido, numerada)
  const unidadesDeEntrada = Math.ceil(((INSTRUCCION_DEL_PORTERO.length + mensaje.length) / 2.8) * MARGEN_DEL_CONTADOR)
  const peorCaso = costoDeLaLlamada({ input_tokens: unidadesDeEntrada, output_tokens: MAX_TOKENS_DE_SALIDA })
  if (peorCaso > (deps.topeDeGastoUsd ?? TOPE_DE_GASTO_POR_LLAMADA_USD)) {
    return sinModelo({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'tope_de_gasto', costo_maximo_calculado_usd: peorCaso, ...comun })
  }

  const peticion: PeticionAlModelo = {
    model: MODELO, max_tokens: MAX_TOKENS_DE_SALIDA, thinking: RAZONAMIENTO, system: INSTRUCCION_DEL_PORTERO,
    messages: [{ role: 'user', content: mensaje }], timeoutMs: TIEMPO_MAXIMO_MS,
  }
  const inicio = Date.now()
  let respuesta: RespuestaDelModelo | null = null
  let fallo: { motivo: string; status: 'failed' | 'timeout'; mensaje: string } | null = null
  try {
    respuesta = await deps.llamarModelo(peticion) // UNA vez: sin reintentos
  } catch (e) {
    const nombre = e instanceof Error ? e.name : ''
    const texto = e instanceof Error ? e.message : String(e)
    fallo = nombre === 'SinLlave' ? { motivo: 'sin_llave', status: 'failed', mensaje: texto }
      : nombre === 'AbortError' ? { motivo: 'tiempo', status: 'timeout', mensaje: `pasó de ${TIEMPO_MAXIMO_MS} ms` }
      : { motivo: 'error_del_modelo', status: 'failed', mensaje: texto.slice(0, 300) }
  }
  const duracion = Date.now() - inicio
  const usage = respuesta?.usage ?? { input_tokens: 0, output_tokens: 0 }
  const costo = respuesta ? costoDeLaLlamada(usage) : 0
  const lectura = respuesta ? interpretarDecision(respuesta.texto, numerada, { pixeles: pedido.pixeles }) : null
  const motivoDeRespaldo = fallo ? fallo.motivo : lectura && !lectura.ok ? lectura.caida : null
  const modo = motivoDeRespaldo ? 'respaldo' : 'conversado'

  // se registra SIEMPRE (también lo que falló), con workflow_id; si el registro falla, la respuesta sigue y lo dice
  let registro: ResultadoDeRegistro
  try {
    registro = await deps.registrar({
      workflow_id: workflowId, workflow_execution_id: ejecucionId, agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: ejecucionId,
      model: MODELO, cost_usd: costo, duration_ms: duracion, tokens_input: usage.input_tokens, tokens_output: usage.output_tokens, num_turns: 1,
      status: fallo ? fallo.status : 'completed', ...(fallo ? { error_message: fallo.mensaje } : {}), client_id: pedido.cliente, command: 'portero.razonar',
      response_text: lectura && lectura.ok ? JSON.stringify(lectura.decision).slice(0, 2000) : '',
      metadata: { ronda: pedido.ronda, modo, motivo_de_respaldo: motivoDeRespaldo, huella: numerada.huella, lineas_en_la_lista: numerada.lineas.length, ya_trae: pedido.ya_trae },
    })
  } catch (e) {
    registro = { ok: false, detalle: e instanceof Error ? e.message : String(e) }
  }

  return salida(200, {
    modo, estado: estadoLegible, ...(motivoDeRespaldo ? { motivo_de_respaldo: motivoDeRespaldo } : {}), llamo_al_modelo: respuesta !== null,
    ...(lectura && lectura.ok ? { decision: lectura.decision } : {}), lecturas, costo_usd: costo, tokens: { entrada: usage.input_tokens, salida: usage.output_tokens },
    duracion_ms: duracion, registro, ...comun,
  })
}
