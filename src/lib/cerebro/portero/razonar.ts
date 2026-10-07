/**
 * RAZONAR · la ÚNICA ruta que llama al modelo del portero.
 *
 * Una lista que cabe (≤ 20.000 «tokens» de entrada, medidos con el factor real) va en UNA llamada. Una que no cabe se recorre por NIVELES
 * (estante → clase → familia, solo los que hagan falta): en cada uno el modelo escoge qué grupos abrir y lo abierto se lee ENTERO (en trozos si aún no cabe);
 * no hay búsqueda por palabras ni línea inalcanzable. Cada llamada: sin reintentos, 25 s, razonamiento al mínimo, solo con `workflow_id`,
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
import { agruparLineas, claveDeNivel, indiceDeGrupos, NIVELES, normalizarNombre, presupuestoDeLineas, tieneFamilia, trocear, vistaDe, type Nivel } from './estantes'
import { armarMensaje, armarMensajeDeGrupos, armarMensajeDeVerificacion, GRUPOS_POR_NIVEL, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_VERIFICACION, INSTRUCCION_DEL_PORTERO } from './instruccion'
import { estaCortada, type LineaNumerada, lineaCompleta, type ListaNumerada, numerarLista } from './lista-numerada'
import { estimarTokens, TOPE_DE_ENTRADA_EN_TOKENS } from './medida'
import { leerListaDePrueba } from './prueba'

export { INSTRUCCION_DE_ESTANTES }
export const MODELO = 'claude-sonnet-5-5'
/** el ajuste más bajo que acepta Sonnet 5.5 (rechaza apagarlo del todo): leer una lista y escoger números no necesita un cuaderno aparte */
export const RAZONAMIENTO = { type: 'between_tools' } as const
/** medición real 1: 19 de 20 respuestas terminaron solas con 523–1.282; la única que se cortó traía un párrafo de 3.243 caracteres (ya no se pide) */
export const MAX_TOKENS_DE_SALIDA = 1500
/** la pasada de cada nivel (estante, clase, familia) solo devuelve unos nombres */
export const MAX_TOKENS_DE_ESTANTES = 500
export const TIEMPO_MAXIMO_MS = 25_000
/** la comprobación de «faltantes» solo devuelve unos números */
export const MAX_TOKENS_DE_VERIFICACION = 300
/** a lo más cuántas fichas completas se le muestran al portero para comprobar un faltante */
export const MAXIMO_DE_FICHAS_A_VERIFICAR = 60
/** una llamada que costaría más que esto no se hace (la real cuesta ≈ US$ 0,03) */
export const TOPE_DE_GASTO_POR_LLAMADA_USD = 0.08
/** lo máximo que puede costar UN pedido entero (los niveles + la lectura, en trozos si hace falta): típico ≈ US$ 0,02 · una familia ≈ 0,035 · todo un catálogo grande ≈ 0,19 (diseño v3 §3). Pasado el tope, respaldo declarado */
export const TOPE_DE_GASTO_POR_PEDIDO_USD = 0.30
/** US$ por millón de «tokens» (página oficial de precios de Anthropic consultada el 2026-10-05) */
export const PRECIO_POR_MILLON = { entrada: 2, salida: 10 } as const

/** el `client_id` con que se registran las llamadas de prueba: un texto (no existe en `clients`); nunca van sin cliente porque el cubo `system` del freno de `run-sdk` (US$ 2 por 24 h) suma las filas sin cliente */
export const CLIENTE_DE_PRUEBA = 'prueba-portero'

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

const MOTIVO_SIN_GRUPOS: Record<Nivel, string> = { estante: 'estantes_invalidos', clase: 'clases_invalidas', familia: 'familias_invalidas' }
const salida = (status: number, cuerpo: Record<string, unknown>) => ({ status, cuerpo })

/** un grupo que el portero pidió ENTERO en un nivel: se entrega completo, sin escoger cosa por cosa */
interface GrupoCompleto { nivel: string; nombre: string; lineas: LineaNumerada[] }

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
        // una prueba NO usa ningún cliente real ni inventado de las tablas de cliente: lleva el texto de prueba y va marcada (nunca sin cliente: sumaría al cubo `system` del freno)
        client_id: esPrueba ? CLIENTE_DE_PRUEBA : pedido.cliente, command: esPrueba ? 'portero.razonar.prueba' : 'portero.razonar',
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

  const unicos = <T,>(xs: T[]): T[] => [...new Set(xs)]
  const refDe = new Map(numerada.lineas.map((l) => [l.numero, l.ficha.ref]))

  /** une los grupos pedidos ENTEROS con lo que el portero escogió cosa por cosa; los faltantes de una lectura que NO vio los grupos completos no son concluyentes */
  const fusionarCompletas = (d: Decision, completas: GrupoCompleto[]): Decision => {
    if (completas.length === 0) return d
    const deGrupos = completas.flatMap((g) => g.lineas.map((l) => l.numero))
    const numeros = unicos([...deGrupos, ...d.entregar_numeros]).sort((x, y) => x - y)
    const noConcluyentes = unicos([...(d.faltantes_no_concluyentes ?? []), ...d.faltantes]).slice(0, 20)
    return {
      ...d,
      entregar_numeros: numeros,
      entregar: numeros.map((n) => refDe.get(n) as string),
      por_que: [...completas.map((g) => ({ numeros: g.lineas.map((l) => l.numero), linea: `Grupo completo «${g.nombre}» (${g.nivel}): el portero lo pidió ENTERO, sin escoger entre sus cosas.` })), ...d.por_que],
      faltantes: [],
      ...(noConcluyentes.length ? { faltantes_no_concluyentes: noConcluyentes } : {}),
      grupos_completos: completas.map((g) => ({ nivel: g.nivel, grupo: g.nombre, lineas: g.lineas.length })),
    }
  }

  /**
   * Antes de declarar que algo FALTA se lee la ficha COMPLETA: el modelo ve el resumen cortado, el empleado recibe la ficha entera. Si hay faltantes y se entregaron fichas cuyo resumen salió cortado,
   * UNA llamada le muestra ese texto entero y le pregunta cuáles faltantes SIGUEN faltando; los demás se descartan. Si la comprobación falla o no cabe en el tope, los faltantes quedan como estaban (y se dice).
   */
  const verificarFaltantes = async (d: Decision, vista: ListaNumerada): Promise<{ decision: Decision; extra: Record<string, unknown> }> => {
    if (d.faltantes.length === 0) return { decision: d, extra: {} }
    const entregadas = new Set([...d.entregar_numeros, ...d.duda])
    const cortadas = vista.lineas.filter((l) => entregadas.has(l.numero) && estaCortada(l.ficha))
    if (cortadas.length === 0) return { decision: d, extra: {} }
    const leidas = cortadas.slice(0, MAXIMO_DE_FICHAS_A_VERIFICAR)
    const mensaje = armarMensajeDeVerificacion(pedido, d.faltantes, leidas.map((l) => lineaCompleta(l.numero, l.ficha)))
    const peor = peorCaso(INSTRUCCION_DE_VERIFICACION, mensaje, MAX_TOKENS_DE_VERIFICACION)
    if (estimarTokens(INSTRUCCION_DE_VERIFICACION.length + mensaje.length) > topeEntrada || peor > topeLlamada || gasto + peor > topePedido) return { decision: d, extra: { verificacion_de_faltantes: { estado: 'omitida_por_tope', costo_maximo_calculado_usd: peor } } }
    const ll = await llamar(peticion(INSTRUCCION_DE_VERIFICACION, mensaje, MAX_TOKENS_DE_VERIFICACION))
    const leido = ll.respuesta ? extraerJson(ll.respuesta.texto, 'siguen_faltando') : null
    const crudo = leido && typeof leido.valor === 'object' && leido.valor !== null ? (leido.valor as Record<string, unknown>).siguen_faltando : undefined
    const motivo = ll.fallo ? ll.fallo.motivo : !Array.isArray(crudo) ? (ll.cortada ? 'salida_cortada' : 'json_roto') : null
    await anotar(ll, pasadas, motivo, leido ? JSON.stringify(leido.valor) : '', { modo: motivo ? 'respaldo' : 'verificacion', nivel: 'verificacion', faltantes_antes: d.faltantes.length, fichas_leidas: leidas.length, fichas_cortadas_entregadas: cortadas.length })
    if (motivo || !Array.isArray(crudo)) return { decision: d, extra: { verificacion_de_faltantes: { estado: 'fallo', motivo, costo_usd: ll.costo } } }
    const siguen = new Set(crudo.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= d.faltantes.length))
    const quedan = d.faltantes.filter((_, i) => siguen.has(i + 1))
    const descartados = d.faltantes.filter((_, i) => !siguen.has(i + 1))
    return {
      decision: { ...d, faltantes: quedan, ...(descartados.length ? { faltantes_descartados_por_ficha_completa: descartados } : {}) },
      extra: { verificacion_de_faltantes: { estado: 'hecha', faltantes_antes: d.faltantes.length, faltantes_despues: quedan.length, fichas_leidas: leidas.length, fichas_cortadas_entregadas: cortadas.length, costo_usd: ll.costo } },
    }
  }

  /** una pasada que elige números sobre `vista` (la lista entera, o las líneas desplegadas de los grupos elegidos); `completas` = grupos que el portero pidió ENTEROS */
  const pasadaDeDecision = async (vista: ListaNumerada, pasada: number, extra: Record<string, unknown>, completas: GrupoCompleto[] = []) => {
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
    let decision: Decision | null = lectura && lectura.ok ? lectura.decision : null
    let extraVerificacion: Record<string, unknown> = {}
    if (decision) {
      if (completas.length > 0) decision = fusionarCompletas(decision, completas)
      else { const v = await verificarFaltantes(decision, vista); decision = v.decision; extraVerificacion = v.extra }
    }
    return terminar({ modo, estado: estadoLegible, ...(motivo ? { motivo_de_respaldo: motivo } : {}), llamo_al_modelo: true, ...(decision ? { decision } : {}), ...extra, ...extraVerificacion })
  }

  // ── cabe entera: UNA pasada (las listas chicas, como el piloto de 62 líneas, nunca salen de aquí)
  const cabe = (lineas: LineaNumerada[]): boolean =>
    estimarTokens(INSTRUCCION_DEL_PORTERO.length + armarMensaje(pedido, vistaDe(numerada, lineas)).length) <= topeEntrada
  if (cabe(numerada.lineas)) return pasadaDeDecision(numerada, 1, {})

  // ── no cabe: se recorre por NIVELES (estante → clase → familia). En cada uno el portero dice qué grupos abrir; no hay búsqueda por palabras
  // y ninguna línea se oculta por parecerse poco al pedido: lo elegido se lee entero, en trozos si hace falta.
  const todas = numerada.lineas
  let candidatas: LineaNumerada[] = todas
  let huboRespuesta = false
  const completas: GrupoCompleto[] = []
  let pasada1: Record<string, unknown> | null = null
  const niveles: Array<Record<string, unknown>> = []
  const extrasDeNiveles = (): Record<string, unknown> => ({ ...(pasada1 ? { pasada_1: pasada1 } : {}), niveles })
  const respaldoDeTope = (extra: Record<string, unknown>) =>
    pasadas === 0
      ? sinModelo({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'tope_de_gasto', ...extra, ...comun })
      : terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'tope_de_gasto', llamo_al_modelo: true, ...extra, ...extrasDeNiveles() })

  for (const nivel of NIVELES) {
    if (cabe(candidatas)) break
    // en el nivel de familia, lo que NO tiene familia no se pregunta: se abre SIEMPRE (si no, una «bolsa sin familia» escondería páginas, sedes y horarios)
    const sinFamilia = nivel === 'familia' ? candidatas.filter((l) => !tieneFamilia(l.ficha)) : []
    const sujetas = nivel === 'familia' ? candidatas.filter((l) => tieneFamilia(l.ficha)) : candidatas
    const grupos = agruparLineas(sujetas, nivel)
    if (grupos.length < 2) continue // un solo grupo: no hay nada que elegir en este nivel
    const cfg = GRUPOS_POR_NIVEL[nivel]
    const aviso = sinFamilia.length ? `\n(además se abren SIEMPRE ${sinFamilia.length} cosas que no tienen familia — ${[...new Set(sinFamilia.map((l) => l.ficha.clase))].join(', ')} — no hace falta elegirlas)` : ''
    const mensaje = armarMensajeDeGrupos(pedido, indiceDeGrupos(grupos, nivel) + aviso, nivel)
    if (estimarTokens(cfg.instruccion.length + mensaje.length) > topeEntrada) {
      return pasadas === 0
        ? sinModelo({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'indice_mas_grande_que_el_tope', ...comun })
        : terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'indice_mas_grande_que_el_tope', llamo_al_modelo: true, ...extrasDeNiveles() })
    }
    const peor = peorCaso(cfg.instruccion, mensaje, MAX_TOKENS_DE_ESTANTES)
    if (peor > topeLlamada || gasto + peor > topePedido) return respaldoDeTope({ costo_maximo_calculado_usd: peor })
    const ll = await llamar(peticion(cfg.instruccion, mensaje, MAX_TOKENS_DE_ESTANTES))
    if (ll.respuesta) huboRespuesta = true
    const porNombre = new Map(grupos.map((g) => [normalizarNombre(g.nombre), g]))
    // el índice llama a un grupo de clase «E2 catalogo_item»; el modelo suele repetir solo «catalogo_item» (medición del 07-oct: 30 de 30): se acepta el nombre SIN el estante
    // cuando identifica a UN solo grupo entre los ofrecidos; si fuera ambiguo (la misma clase en dos estantes) NO se adivina: es un nombre inválido
    const sinEstante = new Map<string, string[]>()
    if (nivel === 'clase') for (const g of grupos) { const corto = normalizarNombre(g.nombre.split(' ').slice(1).join(' ')); if (corto) sinEstante.set(corto, [...(sinEstante.get(corto) ?? []), normalizarNombre(g.nombre)]) }
    const resolver = (x: unknown): string | undefined => {
      if (typeof x !== 'string') return undefined
      const k = normalizarNombre(x)
      if (porNombre.has(k)) return k
      const unico = sinEstante.get(k)
      return unico && unico.length === 1 ? unico[0] : undefined
    }
    const leido = ll.respuesta ? extraerJson(ll.respuesta.texto, cfg.clave) : null
    const valor = leido && typeof leido.valor === 'object' && leido.valor !== null ? (leido.valor as Record<string, unknown>)[cfg.clave] : undefined
    const pedidosDelModelo = Array.isArray(valor) ? valor : null
    const elegidos = [...new Set((pedidosDelModelo ?? []).map(resolver).filter((x): x is string => x !== undefined))]
    const invalidos = [...new Set((pedidosDelModelo ?? []).filter((x) => resolver(x) === undefined).map(String))]
    // «completas»: grupos que el modelo necesita ENTEROS (comparar, auditar, buscar sobre todo un conjunto): se entregan sin escoger cosa por cosa. Solo en clase y familia; una completa cuenta como abierta
    const crudoCompletas = nivel !== 'estante' && leido && typeof leido.valor === 'object' && leido.valor !== null ? (leido.valor as Record<string, unknown>).completas : undefined
    const pedidasCompletas = Array.isArray(crudoCompletas) ? crudoCompletas : []
    const clavesCompletas = [...new Set(pedidasCompletas.map(resolver).filter((x): x is string => x !== undefined))]
    const completasInvalidas = [...new Set(pedidasCompletas.filter((x) => resolver(x) === undefined).map(String))]
    for (const k of clavesCompletas) if (!elegidos.includes(k)) elegidos.push(k)
    const nombresElegidos = elegidos.map((k) => (porNombre.get(k) as { nombre: string }).nombre)
    const nombresCompletas = clavesCompletas.map((k) => (porNombre.get(k) as { nombre: string }).nombre)
    const caida = ll.fallo ? ll.fallo.motivo : !ll.respuesta ? 'error_del_modelo' : !leido ? (ll.cortada ? 'salida_cortada' : 'json_roto') : elegidos.length === 0 ? MOTIVO_SIN_GRUPOS[nivel] : null
    await anotar(ll, pasadas, caida, leido ? JSON.stringify(leido.valor) : '', {
      modo: caida ? 'respaldo' : 'grupos', nivel, grupos_ofrecidos: grupos.length, grupos_elegidos: nombresElegidos, ...(nombresCompletas.length ? { grupos_completos: nombresCompletas } : {}), ...(nivel === 'estante' ? { estantes_elegidos: nombresElegidos } : {}),
    })
    const resumen = { grupos_ofrecidos: grupos.length, grupos_elegidos: nombresElegidos, grupos_completos: nombresCompletas, grupos_invalidos: [...invalidos, ...completasInvalidas], costo_usd: ll.costo, tokens: { entrada: ll.usage.input_tokens, salida: ll.usage.output_tokens } }
    niveles.push({ nivel, ...resumen })
    if (nivel === 'estante') pasada1 = { estantes_elegidos: nombresElegidos, estantes_invalidos: invalidos, costo_usd: ll.costo, tokens: resumen.tokens }
    if (caida) return terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: caida, llamo_al_modelo: huboRespuesta, ...extrasDeNiveles() })
    const abiertos = new Set(elegidos)
    const enteras = new Set(clavesCompletas)
    for (const k of clavesCompletas) { const g = porNombre.get(k) as { nombre: string; lineas: LineaNumerada[] }; completas.push({ nivel, nombre: g.nombre, lineas: g.lineas }) }
    candidatas = [...sinFamilia, ...sujetas.filter((l) => { const k = normalizarNombre(claveDeNivel(l.ficha, nivel)); return abiertos.has(k) && !enteras.has(k) })].sort((x, y) => x.numero - y.numero)
  }

  const lecturaFinal = (trozos: number, extra: Record<string, unknown> = {}) => ({
    lectura_final: { lineas_mostradas: candidatas.length, lineas_completas: completas.reduce((a, g) => a + g.lineas.length, 0), lineas_no_mostradas: todas.length - candidatas.length - completas.reduce((a, g) => a + g.lineas.length, 0), trozos, ...extra },
  })

  // ── todo lo abierto se pidió ENTERO: no queda nada que escoger (ni llamada de lectura): la decisión es esos grupos completos
  if (candidatas.length === 0 && completas.length > 0) {
    const vacia: Decision = { entregar: [], entregar_numeros: [], pixeles: [], por_que: [], faltantes: [], duda: [], numeros_invalidos: [] }
    return terminar({ modo: 'conversado', estado: estadoLegible, llamo_al_modelo: true, decision: fusionarCompletas(vacia, completas), ...extrasDeNiveles(), ...lecturaFinal(0, { trozos_leidos: 0 }) })
  }

  // ── lo abierto cabe en UNA llamada de decisión
  if (cabe(candidatas)) return pasadaDeDecision(vistaDe(numerada, candidatas), pasadas + 1, { ...extrasDeNiveles(), ...lecturaFinal(1) }, completas)

  // ── lo abierto no cabe y ya no se puede subdividir: se lee ENTERO en trozos consecutivos (una llamada por trozo, el costo se calcula ANTES)
  const trozos = trocear(candidatas, presupuestoDeLineas(numerada, pedido, topeEntrada))
  const vistas = trozos.map((t) => vistaDe(numerada, t))
  const peores = vistas.map((v, i) => peorCaso(INSTRUCCION_DEL_PORTERO, armarMensaje(pedido, v, { numero: i + 1, de: trozos.length }), MAX_TOKENS_DE_SALIDA))
  const peorTotal = peores.reduce((a, x) => a + x, 0)
  if (peores.some((x) => x > topeLlamada) || gasto + peorTotal > topePedido) {
    return respaldoDeTope({ costo_maximo_calculado_usd: peorTotal, ...lecturaFinal(trozos.length, { trozos_leidos: 0 }) })
  }
  const partes: Decision[] = []
  const faltantesNoConcluyentes: string[] = []
  let vacios = 0
  for (let i = 0; i < vistas.length; i++) {
    const mensaje = armarMensaje(pedido, vistas[i], { numero: i + 1, de: vistas.length })
    const ll = await llamar(peticion(INSTRUCCION_DEL_PORTERO, mensaje, MAX_TOKENS_DE_SALIDA))
    if (ll.respuesta) huboRespuesta = true
    const lectura = ll.respuesta ? interpretarDecision(ll.respuesta.texto, vistas[i], { pixeles: pedido.pixeles, cortada: ll.cortada }) : null
    // una parte donde nada sirve es legítima («entregar» vacío): solo es sospechosa si TODAS las partes salen vacías
    const parteVacia = lectura !== null && !lectura.ok && lectura.caida === 'entregar_vacio_sospechoso'
    const motivo = ll.fallo ? ll.fallo.motivo : lectura && !lectura.ok && !parteVacia ? lectura.caida : null
    await anotar(ll, pasadas, motivo, lectura && lectura.ok ? JSON.stringify(lectura.decision) : '', { modo: motivo ? 'respaldo' : 'conversado', trozo: i + 1, trozos: vistas.length })
    if (motivo) return terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: motivo, llamo_al_modelo: huboRespuesta, ...extrasDeNiveles(), ...lecturaFinal(trozos.length, { trozos_leidos: i }) })
    if (lectura && lectura.ok) {
      partes.push(lectura.decision)
      // lo que una parte da por «faltante» puede estar en otra parte: no se declara faltante, se anota como no concluyente
      for (const f of lectura.decision.faltantes) if (!faltantesNoConcluyentes.includes(f)) faltantesNoConcluyentes.push(f)
    } else vacios++
  }
  if (partes.length === 0) {
    return terminar({ modo: 'respaldo', estado: estadoLegible, motivo_de_respaldo: 'entregar_vacio_sospechoso', llamo_al_modelo: true, ...extrasDeNiveles(), ...lecturaFinal(trozos.length, { trozos_leidos: trozos.length, trozos_vacios: vacios }) })
  }
  const unico = <T>(xs: T[]): T[] => [...new Set(xs)]
  const decision: Decision = {
    entregar: unico(partes.flatMap((d) => d.entregar)),
    entregar_numeros: unico(partes.flatMap((d) => d.entregar_numeros)),
    pixeles: unico(partes.flatMap((d) => d.pixeles)).slice(0, 6),
    por_que: partes.flatMap((d) => d.por_que),
    faltantes: [],
    duda: unico(partes.flatMap((d) => d.duda)),
    numeros_invalidos: partes.flatMap((d) => d.numeros_invalidos),
    ...(faltantesNoConcluyentes.length ? { faltantes_no_concluyentes: faltantesNoConcluyentes.slice(0, 20) } : {}),
  }
  return terminar({
    modo: 'conversado', estado: estadoLegible, llamo_al_modelo: true, decision: fusionarCompletas(decision, completas), ...extrasDeNiveles(),
    ...lecturaFinal(trozos.length, { trozos_leidos: trozos.length, trozos_vacios: vacios }),
  })
}

export type { Pedido }
