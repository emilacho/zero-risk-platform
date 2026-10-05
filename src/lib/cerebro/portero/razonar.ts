/**
 * RAZONAR · la ÚNICA ruta que llama al modelo del portero.
 *
 * Una lista que cabe (≤ 20.000 «tokens» de entrada, medidos con el factor real) va en UNA llamada. Una que no cabe va en DOS pasadas
 * (estantes → líneas de los estantes elegidos), nunca más. Cada llamada: sin reintentos, 25 s, razonamiento al mínimo, solo con `workflow_id`,
 * con tope de gasto por llamada y por pedido, y REGISTRADA; si el registro falla, la respuesta lo grita (`alerta: llamada_sin_registro`).
 * El modelo ELIGE números; el sistema copia el texto. Si el modelo falla, tarda, contesta mal o se corta, la respuesta lo DICE
 * (`modo: respaldo` y su motivo) y la corrida sigue: nada queda colgado.
 * Este módulo no sabe cómo se llama al modelo ni cómo se registra: los recibe (así se prueba con el modelo simulado).
 */
import type { Consulta } from '../consulta'
import { type Pedido, validarPedido } from '../conversacion'
import { construirListaCorta } from '../lista-corta'
import { type ListaCorta, NOMBRES_DE_FUENTE } from '../tipos'
import { type Decision, extraerJson, interpretarDecision } from './decision'
import { desplegar, agruparPorEstante, indiceDeEstantes } from './estantes'
import { armarMensaje, armarMensajeDeEstantes, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DEL_PORTERO } from './instruccion'
import { type ListaNumerada, numerarLista } from './lista-numerada'
import { estimarTokens, TOPE_DE_ENTRADA_EN_TOKENS } from './medida'
import { leerListaDePrueba } from './prueba'

export { INSTRUCCION_DE_ESTANTES }
export const MODELO = 'claude-sonnet-5-5'
/** el ajuste más bajo que acepta Sonnet 5.5 (rechaza apagarlo del todo): leer una lista y escoger números no necesita un cuaderno aparte */
export const RAZONAMIENTO = { type: 'between_tools' } as const
/** medición real 1: 19 de 20 respuestas terminaron solas con 523–1.282; la única que se cortó traía un párrafo de 3.243 caracteres (ya no se pide) */
export const MAX_TOKENS_DE_SALIDA = 1500
/** la pasada de estantes solo devuelve unos nombres */
export const MAX_TOKENS_DE_ESTANTES = 500
export const TIEMPO_MAXIMO_MS = 25_000
/** una llamada que costaría más que esto no se hace (la real cuesta ≈ US$ 0,03) */
export const TOPE_DE_GASTO_POR_LLAMADA_USD = 0.08
/** lo máximo que puede costar UN pedido entero (hasta dos llamadas); el peor caso calculado de las dos juntas es ≈ US$ 0,065 */
export const TOPE_DE_GASTO_POR_PEDIDO_USD = 0.12
/** US$ por millón de «tokens» (página oficial de precios de Anthropic consultada el 2026-10-05) */
export const PRECIO_POR_MILLON = { entrada: 2, salida: 10 } as const

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
export interface RespuestaDelModelo { texto: string; stop_reason?: string | null; usage: { input_tokens: number; output_tokens: number } }
export interface ResultadoDeRegistro { ok: boolean; detalle?: string }

export interface DepsDeRazonar {
  consulta: Consulta
  llamarModelo: (p: PeticionAlModelo) => Promise<RespuestaDelModelo>
  registrar: (fila: Record<string, unknown>) => Promise<ResultadoDeRegistro>
  ahora?: () => Date
  topeDeGastoUsd?: number
  topeDeGastoPorPedidoUsd?: number
  topeDeEntradaTokens?: number
}

export const costoDeLaLlamada = (usage: { input_tokens: number; output_tokens: number }): number =>
  (usage.input_tokens * PRECIO_POR_MILLON.entrada + usage.output_tokens * PRECIO_POR_MILLON.salida) / 1_000_000

const salida = (status: number, cuerpo: Record<string, unknown>) => ({ status, cuerpo })

interface Llamada {
  respuesta: RespuestaDelModelo | null
  fallo: { motivo: string; status: 'failed' | 'timeout'; mensaje: string } | null
  duracion: number
  usage: { input_tokens: number; output_tokens: number }
  costo: number
  cortada: boolean
}

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
  const dePrueba = leerListaDePrueba(b.prueba, b.lista_de_prueba, pedido.cliente, ahora())
  if (dePrueba && !dePrueba.ok) return salida(400, { error: 'entrada_invalida', code: 'E-INPUT-INVALID', errores: dePrueba.errores })
  const esPrueba = dePrueba !== null
  const marca = esPrueba ? { prueba: true } : {}

  // con lista de prueba NO se lee ninguna tabla: la lista inventada reemplaza a la lectura
  const lista: ListaCorta = dePrueba ? dePrueba.lista : await construirListaCorta(deps.consulta, pedido.cliente, { ahora: ahora() })
  const lecturas = Object.fromEntries(NOMBRES_DE_FUENTE.map((k) => [k, lista.fuentes[k].estado]))
  const sinModelo = (extra: Record<string, unknown>) => salida(200, { llamo_al_modelo: false, costo_usd: 0, tokens: { entrada: 0, salida: 0 }, duracion_ms: 0, pasadas: 0, lecturas, ...marca, ...extra })

  if (lista.estado === 'cliente_inexistente' || lista.estado === 'error_de_lectura') {
    return sinModelo({ modo: 'respaldo', estado: lista.estado, motivo_de_respaldo: lista.estado })
  }
  const numerada = numerarLista(lista, { ya_trae: pedido.ya_trae })
  const comun = { huella: numerada.huella, ya_trae_desconocido: numerada.ya_trae_desconocido }
  const estadoLegible = lista.estado === 'ok' ? 'ok' : 'parcial'
  if (numerada.lineas.length === 0) {
    return sinModelo({ modo: 'conversado', estado: lista.estado === 'ok' ? 'sin_material' : 'parcial', decision: { entregar: [], sin_material: true }, ...comun })
  }

  const topeLlamada = deps.topeDeGastoUsd ?? TOPE_DE_GASTO_POR_LLAMADA_USD
  const topePedido = deps.topeDeGastoPorPedidoUsd ?? TOPE_DE_GASTO_POR_PEDIDO_USD
  const topeEntrada = deps.topeDeEntradaTokens ?? TOPE_DE_ENTRADA_EN_TOKENS

  // ── el gasto y el registro de TODO el pedido (una o dos llamadas)
  let gasto = 0
  let entrada = 0
  let salidaTokens = 0
  let duracionTotal = 0
  let pasadas = 0
  let ultimoStop: string | null = null
  let gastoSinRegistrar = 0
  const registros: ResultadoDeRegistro[] = []

  const llamar = async (peticion: PeticionAlModelo): Promise<Llamada> => {
    const inicio = Date.now()
    let respuesta: RespuestaDelModelo | null = null
    let fallo: Llamada['fallo'] = null
    try {
      respuesta = await deps.llamarModelo(peticion) // UNA vez por pasada: sin reintentos
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
    pasadas++
    gasto += costo; entrada += usage.input_tokens; salidaTokens += usage.output_tokens; duracionTotal += duracion
    ultimoStop = respuesta?.stop_reason ?? null
    return { respuesta, fallo, duracion, usage, costo, cortada: respuesta?.stop_reason === 'max_tokens' }
  }

  // se registra SIEMPRE (también lo que falló), con workflow_id; si el registro falla, la respuesta sigue Y lo grita
  const anotar = async (ll: Llamada, pasada: number, motivoDeRespaldo: string | null, textoDeLaRespuesta: string, metadata: Record<string, unknown>) => {
    let registro: ResultadoDeRegistro
    try {
      registro = await deps.registrar({
        workflow_id: workflowId, workflow_execution_id: ejecucionId, agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: ejecucionId,
        model: MODELO, cost_usd: ll.costo, duration_ms: ll.duracion, tokens_input: ll.usage.input_tokens, tokens_output: ll.usage.output_tokens, num_turns: 1,
        status: ll.fallo ? ll.fallo.status : 'completed', ...(ll.fallo ? { error_message: ll.fallo.mensaje } : {}),
        // una prueba NO escribe un cliente inventado en ninguna tabla de cliente: va sin client_id y marcada
        ...(esPrueba ? {} : { client_id: pedido.cliente }), command: esPrueba ? 'portero.razonar.prueba' : 'portero.razonar',
        response_text: textoDeLaRespuesta.slice(0, 2000),
        metadata: { pasada, ronda: pedido.ronda, motivo_de_respaldo: motivoDeRespaldo, stop_reason: ll.respuesta?.stop_reason ?? null, huella: numerada.huella, lineas_en_la_lista: numerada.lineas.length, ya_trae: pedido.ya_trae, ...(esPrueba ? { prueba: true, cliente_de_prueba: pedido.cliente } : {}), ...metadata },
      })
    } catch (e) {
      registro = { ok: false, detalle: e instanceof Error ? e.message : String(e) }
    }
    registros.push(registro)
    if (!registro.ok) gastoSinRegistrar += ll.costo
  }

  const terminar = (extra: Record<string, unknown>) => {
    const fallidos = registros.filter((r) => !r.ok)
    const registro: ResultadoDeRegistro = fallidos.length === 0 ? { ok: true } : { ok: false, detalle: fallidos.map((r) => r.detalle).filter(Boolean).join(' · ') || 'el registro falló' }
    if (fallidos.length > 0) {
      // un gasto que no quedó anotado es un DEFECTO que debe verse: va en la respuesta, en el renglón de error del servidor y en la libreta de logs
      console.error(`[portero.razonar] LLAMADA_SIN_REGISTRO workflow_id=${workflowId} workflow_execution_id=${ejecucionId} costo_usd=${gastoSinRegistrar} llamadas=${registros.length} fallidas=${fallidos.length} detalle=${registro.detalle}`)
    }
    return salida(200, {
      ...extra, lecturas, costo_usd: gasto, tokens: { entrada, salida: salidaTokens }, duracion_ms: duracionTotal, pasadas, ...(ultimoStop ? { stop_reason: ultimoStop } : {}),
      registro, ...(fallidos.length > 0 ? { alerta: 'llamada_sin_registro', registro_fallido: true, gasto_sin_registrar_usd: gastoSinRegistrar } : {}), ...marca, ...comun,
    })
  }

  const peorCaso = (sistema: string, mensaje: string, salidaMaxima: number) =>
    costoDeLaLlamada({ input_tokens: estimarTokens(sistema.length + mensaje.length), output_tokens: salidaMaxima })
  const peticion = (system: string, mensaje: string, max: number): PeticionAlModelo => ({
    model: MODELO, max_tokens: max, thinking: RAZONAMIENTO, system, messages: [{ role: 'user', content: mensaje }], timeoutMs: TIEMPO_MAXIMO_MS,
  })

  /** una pasada que elige números sobre `vista` (la lista entera, o las líneas desplegadas de los estantes elegidos) */
  const pasadaDeDecision = async (vista: ListaNumerada, pasada: number, extra: Record<string, unknown>) => {
    const mensaje = armarMensaje(pedido, vista)
    const peor = peorCaso(INSTRUCCION_DEL_PORTERO, mensaje, MAX_TOKENS_DE_SALIDA)
    if (peor > topeLlamada || gasto + peor > topePedido) {
      return terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'tope_de_gasto', costo_maximo_calculado_usd: peor, llamo_al_modelo: pasadas > 0, ...extra })
    }
    const ll = await llamar(peticion(INSTRUCCION_DEL_PORTERO, mensaje, MAX_TOKENS_DE_SALIDA))
    const lectura = ll.respuesta ? interpretarDecision(ll.respuesta.texto, vista, { pixeles: pedido.pixeles, cortada: ll.cortada }) : null
    const motivo = ll.fallo ? ll.fallo.motivo : lectura && !lectura.ok ? lectura.caida : null
    const modo = motivo ? 'respaldo' : 'conversado'
    await anotar(ll, pasada, motivo, lectura && lectura.ok ? JSON.stringify(lectura.decision) : '', { modo })
    return terminar({ modo, estado: estadoLegible, ...(motivo ? { motivo_de_respaldo: motivo } : {}), llamo_al_modelo: true, ...(lectura && lectura.ok ? { decision: lectura.decision as Decision } : {}), ...extra })
  }

  // ── cabe entera: UNA pasada
  const mensajeEntero = armarMensaje(pedido, numerada)
  if (estimarTokens(INSTRUCCION_DEL_PORTERO.length + mensajeEntero.length) <= topeEntrada) {
    return pasadaDeDecision(numerada, 1, {})
  }

  // ── no cabe: DOS pasadas (estantes → líneas de los estantes elegidos)
  const estantes = agruparPorEstante(numerada)
  const mensajeDeEstantes = armarMensajeDeEstantes(pedido, indiceDeEstantes(estantes))
  const peor1 = peorCaso(INSTRUCCION_DE_ESTANTES, mensajeDeEstantes, MAX_TOKENS_DE_ESTANTES)
  if (peor1 > topeLlamada || peor1 > topePedido) {
    return sinModelo({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'tope_de_gasto', costo_maximo_calculado_usd: peor1, ...comun })
  }
  const l1 = await llamar(peticion(INSTRUCCION_DE_ESTANTES, mensajeDeEstantes, MAX_TOKENS_DE_ESTANTES))
  const nombres = new Set(estantes.map((e) => e.nombre.toUpperCase()))
  const leido = l1.respuesta ? extraerJson(l1.respuesta.texto, 'estantes') : null
  const pedidos = leido && typeof leido.valor === 'object' && leido.valor !== null && Array.isArray((leido.valor as { estantes?: unknown }).estantes) ? ((leido.valor as { estantes: unknown[] }).estantes) : null
  const pedidosTexto = (pedidos ?? []).filter((x): x is string => typeof x === 'string').map((x) => x.trim().toUpperCase())
  const elegidos = [...new Set(pedidosTexto.filter((x) => nombres.has(x)))]
  const invalidos = [...new Set((pedidos ?? []).filter((x) => !(typeof x === 'string' && nombres.has(x.trim().toUpperCase()))).map(String))]
  const caida1 = l1.fallo ? l1.fallo.motivo : !l1.respuesta ? 'error_del_modelo' : !leido ? (l1.cortada ? 'salida_cortada' : 'json_roto') : elegidos.length === 0 ? 'estantes_invalidos' : null
  await anotar(l1, 1, caida1, leido ? JSON.stringify(leido.valor) : '', { modo: caida1 ? 'respaldo' : 'estantes', estantes_elegidos: elegidos })
  const pasada1 = { estantes_elegidos: elegidos, estantes_invalidos: invalidos, costo_usd: l1.costo, tokens: { entrada: l1.usage.input_tokens, salida: l1.usage.output_tokens } }
  if (caida1) return terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: caida1, llamo_al_modelo: l1.respuesta !== null, pasada_1: pasada1 })

  const abierto = desplegar(numerada, elegidos, pedido, topeEntrada)
  return pasadaDeDecision(abierto.numerada, 2, {
    pasada_1: pasada1,
    pasada_2: { lineas_mostradas: abierto.mostradas, lineas_no_mostradas: abierto.no_mostradas, recortada_por_coincidencia: abierto.recortada_por_coincidencia },
  })
}

export type { Pedido }
