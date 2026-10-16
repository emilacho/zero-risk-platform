/**
 * BUZÓN · la oficina financiera pregunta al dueño por MENSAJE DIRECTO y recoge sus respuestas sola (CC#1 · 16-oct). NACE APAGADO (`finanzas_config.preguntas_slack` ≠ `envia` → 0 envíos, 0 lecturas).
 *  · PREGUNTAR: las preguntas «realmente necesarias» del acuerdo (`preguntas_a_emilio`, hasta 3) salen en UN solo MD, sin jerga, con la recomendación del jefe y «si no respondes». Un encargo = un MD (idempotente y atómico).
 *    ANTES de escribirle, cada pregunta se REGISTRA en el cerebro (puerta del dueño): si ya está respondida NO se pregunta y se usa la respuesta guardada («dato confirmado por el dueño»);
 *    si otra oficina ya espera esa respuesta, tampoco. Cerebro caído → no se escribe al dueño (no se puede evitar el doble) y el encargo sigue con supuestos, avisado.
 *  · RECOGER: lee el MD (solo lo POSTERIOR al cursor, solo del dueño), interpreta con `leerRespuesta`, deja `semilla.respuestas_del_dueno` y GUARDA cada respuesta en el cerebro por su puerta.
 *    La misma respuesta no se aplica dos veces; una ambigua queda como NOTA con su literal (nunca una cifra inventada); una respuesta nueva a la misma pregunta REEMPLAZA la anterior.
 *    Si el cerebro falla al guardar, la respuesta queda en la semilla y en `sin_cerebro` y se reintenta en la siguiente recogida.
 *  · Cada recogida deja un registro versionado (`buzon_respuestas`, con el bloque `evento`) en `finanzas_artefactos`. Aquí NO se escribe en tablas del cerebro: solo se llama a su puerta.
 *  · Slack caído o sin permiso: el encargo sigue con los supuestos (nunca lanza). Recoger NO dispara la siguiente ronda: el encargo queda listo para ella.
 */
import { armarMensaje, leerRespuesta, puedeEnviarAhora, TOPE_POR_CLIENTE_24H, TOPE_POR_DIA_TOTAL, type Pregunta } from '../preguntas'
import type { CerebroDelDueno } from '../../buzon-dueno/cerebro-dueno'
import type { SlackMd } from '../../buzon-dueno/slack-md'
import type { Respuesta } from './orquestador'
import type { AlmacenDeConversa, EncargoDeConversa, Semilla } from './puertos'
import { sha256 } from './util'

export interface PuertosDelBuzon {
  almacen: AlmacenDeConversa
  slack: SlackMd
  /** id del canal privado del buzón (`FINANZAS_CANAL_PREGUNTAS`); sin él, el MD al dueño como hasta ahora */
  canal?: string
  /** la puerta del dueño en el cerebro */
  cerebro: CerebroDelDueno
  /** `finanzas_config.preguntas_slack` */
  modo: 'apagado' | 'borrador' | 'envia'
  ahora(): Date
  /** el nombre con que se habla del cliente en el mensaje (por omisión, su id) */
  nombreDelCliente?(client_id: string): Promise<string | null>
}

const TTL_DEL_ENVIO_S = 120
const esMd = (canal: string | null) => typeof canal === 'string' && /^D[A-Z0-9]+$/.test(canal)
/** el destino guardado en el encargo es válido si es un MD, o EXACTAMENTE el canal configurado del buzón */
const destinoValido = (P: { canal?: string }, canal: string | null) => esMd(canal) || (!!P.canal && canal === P.canal)
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const temaDe = (clave: string) => clave.replace(/_/g, ' ').trim()

type Dada = { clave: string; valor: unknown; literal: string }
type Preguntada = { clave: string; texto: string; pregunta_id: string | null }
type SinCerebro = { clave: string; respuesta: string; ts: string }

function preguntasDelAcuerdo(arts: Record<string, Record<string, unknown>>): Pregunta[] {
  const l = arts.acuerdo?.preguntas_a_emilio
  if (!Array.isArray(l)) return []
  return l.filter(objeto).map((q) => ({ clave: String(q.clave ?? ''), texto: String(q.texto ?? ''), recomendacion: String(q.recomendacion ?? ''), supuesto_si_no_responde: String(q.supuesto_si_no_responde ?? '') }))
}

async function cargar(P: PuertosDelBuzon, encargo_id: string): Promise<{ e: EncargoDeConversa } | Respuesta> {
  let e: EncargoDeConversa | null
  try { e = await P.almacen.leerEncargo(encargo_id) } catch (x) { return { status: 503, cuerpo: { error: 'encargo_ilegible', detalle: x instanceof Error ? x.message : String(x) } } }
  return e ? { e } : { status: 404, cuerpo: { error: 'encargo_no_existe' } }
}

/** registro versionado del buzón; la versión sale de `n` del último registro */
async function ultimoRegistro(P: PuertosDelBuzon, encargo_id: string): Promise<Record<string, unknown>> {
  try { return (await P.almacen.artefactos(encargo_id)).buzon_respuestas ?? {} } catch { return {} }
}

/** agrega a la semilla lo que el dueño ya había respondido (cerebro) o acaba de responder; la misma no se repite y una distinta a la misma pregunta reemplaza */
function fusionar(actuales: Dada[], nuevas: Dada[]): { lista: Dada[]; aplicadas: string[] } {
  const lista = [...actuales], aplicadas: string[] = []
  for (const n of nuevas) {
    const i = lista.findIndex((x) => x.clave === n.clave)
    if (i >= 0 && lista[i].literal === n.literal && JSON.stringify(lista[i].valor) === JSON.stringify(n.valor)) continue
    if (i >= 0) lista[i] = n; else lista.push(n)
    aplicadas.push(n.clave)
  }
  return { lista, aplicadas }
}

// ───────────────────────────────────────────────────────── PREGUNTAR
export async function preguntarAlDueno(P: PuertosDelBuzon, encargo_id: string): Promise<Respuesta> {
  if (P.modo !== 'envia') return { status: 200, cuerpo: { enviado: false, motivo: 'buzon_apagado', modo: P.modo } }
  const c = await cargar(P, encargo_id)
  if (!('e' in c)) return c
  let e = c.e
  if (e.dry_run) return { status: 200, cuerpo: { enviado: false, motivo: 'encargo_en_seco' } }
  const yaEnviado = (x: EncargoDeConversa) => destinoValido(P, x.slack_canal) && !!x.slack_ts
  if (yaEnviado(e)) return { status: 200, cuerpo: { enviado: false, motivo: 'ya_enviado', slack_ts: e.slack_ts } }
  const arts = await P.almacen.artefactos(encargo_id).catch(() => ({}) as Record<string, Record<string, unknown>>)
  const hechas = preguntasDelAcuerdo(arts).slice(0, 3)
  if (!hechas.length) return { status: 200, cuerpo: { enviado: false, motivo: 'sin_preguntas' } }
  // la forma se valida ANTES de registrar nada en el cerebro (no se dejan preguntas pendientes de un mensaje que no sale)
  const prueba = armarMensaje({ cliente: 'x', preguntas: hechas })
  if (!prueba.ok) return { status: 200, cuerpo: { enviado: false, motivo: 'pregunta_mal_formada', errores: prueba.errores } }
  if (!puedeEnviarAhora(P.modo, { si: true })) return { status: 200, cuerpo: { enviado: false, motivo: 'no_envia' } }
  // sin el método (almacén de prueba) = 0; si EXISTE y no se pudo leer, se frena (un tope que no se puede medir no es un tope)
  const env = P.almacen.contarBuzon ? await P.almacen.contarBuzon(e.client_id, P.ahora()).catch(() => null) : { cliente_24h: 0, hoy: 0 }
  if (!env) return { status: 200, cuerpo: { enviado: false, motivo: 'topes_ilegibles' } }
  if (env.cliente_24h >= TOPE_POR_CLIENTE_24H) return { status: 200, cuerpo: { enviado: false, motivo: 'tope: un mensaje por cliente cada 24 h' } }
  if (env.hoy >= TOPE_POR_DIA_TOTAL) return { status: 200, cuerpo: { enviado: false, motivo: 'tope: 3 mensajes por día entre todos los clientes' } }

  // ATÓMICO: una sola llamada a la vez por encargo (dos simultáneas mandaban dos MD); sin la columna del candado se sigue sin él
  const candado = P.almacen.tomarPaso ? await P.almacen.tomarPaso(e.id, P.ahora(), TTL_DEL_ENVIO_S) : null
  if (candado && candado.ok && !candado.tomado) return { status: 200, cuerpo: { enviado: false, motivo: 'otro_paso_en_curso' } }
  const tomado = !!(candado && candado.ok && candado.tomado)
  try {
    const otra = await cargar(P, encargo_id)
    if ('e' in otra) { e = otra.e; if (yaEnviado(e)) return { status: 200, cuerpo: { enviado: false, motivo: 'ya_enviado', slack_ts: e.slack_ts } } }

    // 1 · el cerebro primero: ¿ya lo respondió? ¿otra oficina ya espera?
    const aPreguntar: Preguntada[] = [], dadas: Dada[] = [], esperando: string[] = []
    for (const q of hechas) {
      const v = await P.cerebro.registrarPregunta({ client_id: e.client_id, tema: temaDe(q.clave), pregunta: q.texto }).catch(() => ({ ok: false as const, error: 'red' }))
      if (!v.ok) return { status: 200, cuerpo: { enviado: false, motivo: 'cerebro_caido', aviso: `el cerebro no respondió (${v.error}): no se le escribe al dueño y el encargo sigue con supuestos`, sigue_con_supuestos: true } }
      if (v.estado === 'ya_respondida') dadas.push({ clave: q.clave, valor: v.respuestas[0].respuesta, literal: v.respuestas[0].respuesta })
      else if (v.estado === 'ya_preguntada') esperando.push(q.clave)
      // `repetida` = la registré yo en un intento que no llegó a enviarse (el encargo no tiene MD): se pregunta
      else aPreguntar.push({ clave: q.clave, texto: q.texto, pregunta_id: v.estado === 'registrada' ? v.pregunta_id : null })
    }
    const semilla: Semilla = { ...(e.semilla ?? {}) }
    const fus = fusionar(Array.isArray(semilla.respuestas_del_dueno) ? semilla.respuestas_del_dueno : [], dadas)
    if (fus.aplicadas.length) semilla.respuestas_del_dueno = fus.lista

    if (!aPreguntar.length) {
      if (fus.aplicadas.length) await P.almacen.guardarBuzon?.({ encargo_id, semilla })
      return { status: 200, cuerpo: { enviado: false, motivo: dadas.length ? 'respondidas_en_el_cerebro' : 'otra_oficina_espera', usadas_del_cerebro: dadas.map((d) => d.clave), esperando } }
    }

    // 2 · un solo MD con lo que de verdad falta
    const porClave = new Map(hechas.map((q) => [q.clave, q]))
    const nombre = (await P.nombreDelCliente?.(e.client_id).catch(() => null)) || e.client_id
    const msg = armarMensaje({ cliente: nombre, preguntas: aPreguntar.map((a) => porClave.get(a.clave) as Pregunta) })
    if (!msg.ok) return { status: 200, cuerpo: { enviado: false, motivo: 'pregunta_mal_formada', errores: msg.errores } }
    // «1 200» es ambiguo para el lector (¿pregunta 1 o mil doscientos?): el mensaje enseña el formato que no lo es
    const texto = `${msg.texto}\nEjemplo de respuesta: «1: 200», «2: 2,10», «3: no».`
    const envio = await P.slack.enviarAlDueno(texto).catch(() => ({ ok: false as const, motivo: 'red' }))
    if (!envio.ok) return { status: 200, cuerpo: { enviado: false, motivo: 'sin_md', slack: envio.motivo } }
    const registro = {
      n: 1, evento: { tipo: 'preguntas_enviadas_al_dueno', client_id: e.client_id, encargo_id, claves: msg.claves, usadas_del_cerebro: dadas.map((d) => d.clave), en: P.ahora().toISOString() },
      claves: msg.claves, preguntas: aPreguntar, sin_cerebro: [] as SinCerebro[], canal: envio.canal, ts: envio.ts, respuestas: [], notas: [],
    }
    await P.almacen.guardarBuzon?.({ encargo_id, slack_canal: envio.canal, slack_ts: envio.ts, leido_hasta: envio.ts, ...(fus.aplicadas.length ? { semilla } : {}), artefacto: { tipo: 'buzon_respuestas', version: 1, contenido: registro, sha256: sha256(registro) } })
    return { status: 200, cuerpo: { enviado: true, preguntas: msg.claves.length, claves: msg.claves, usadas_del_cerebro: dadas.map((d) => d.clave), esperando, slack_ts: envio.ts } }
  } finally {
    if (tomado) await P.almacen.soltarPaso?.(e.id)
  }
}

// ───────────────────────────────────────────────────────── RECOGER
const valorDeSemilla = (v: unknown): unknown => (objeto(v) && typeof v.cifra === 'number' ? v.cifra : v)

export async function recogerRespuestas(P: PuertosDelBuzon, encargo_id: string): Promise<Respuesta> {
  if (P.modo !== 'envia') return { status: 200, cuerpo: { recogido: false, motivo: 'buzon_apagado', modo: P.modo } }
  const c = await cargar(P, encargo_id)
  if (!('e' in c)) return c
  const e = c.e
  if (e.dry_run) return { status: 200, cuerpo: { recogido: false, motivo: 'encargo_en_seco' } }
  if (!destinoValido(P, e.slack_canal) || !e.slack_ts) return { status: 200, cuerpo: { recogido: false, motivo: 'sin_md_abierto' } }
  const previo = await ultimoRegistro(P, encargo_id)
  const claves = Array.isArray(previo.claves) ? (previo.claves as unknown[]).map(String) : []
  if (!claves.length) return { status: 200, cuerpo: { recogido: false, motivo: 'sin_preguntas_registradas' } }
  const preguntadas: Preguntada[] = Array.isArray(previo.preguntas) ? (previo.preguntas as Preguntada[]).filter((x) => objeto(x) && typeof x.clave === 'string') : []
  const datosDe = (clave: string) => preguntadas.find((x) => x.clave === clave)

  // lo que no llegó al cerebro en una recogida anterior se reintenta primero
  const guardarEnCerebro = async (lista: SinCerebro[]): Promise<SinCerebro[]> => {
    const falla: SinCerebro[] = []
    for (const x of lista) {
      const d = datosDe(x.clave)
      const r = await P.cerebro.registrarRespuesta({ client_id: e.client_id, tema: temaDe(x.clave), pregunta: d?.texto ?? temaDe(x.clave), respuesta: x.respuesta, mensaje_ref: `${e.slack_canal}:${x.ts}`, respondido_en: new Date(Number(x.ts) * 1000).toISOString(), pregunta_id: d?.pregunta_id ?? null }).catch(() => ({ ok: false as const, error: 'red' }))
      if (!r.ok) falla.push(x)
    }
    return falla
  }
  const pendientesPrevios: SinCerebro[] = Array.isArray(previo.sin_cerebro) ? (previo.sin_cerebro as SinCerebro[]) : []
  const aunSinCerebro = pendientesPrevios.length ? await guardarEnCerebro(pendientesPrevios) : []

  const lectura = await P.slack.leer({ canal: e.slack_canal as string, thread_ts: e.slack_ts, desde_ts: e.leido_hasta }).catch(() => ({ ok: false as const, mensajes: [], leido_hasta: e.leido_hasta, sin_acceso: 'red' }))
  const registrarReintento = async () => {
    // solo hay algo que dejar escrito si el reintento cambió la lista de pendientes
    if (!pendientesPrevios.length || aunSinCerebro.length === pendientesPrevios.length) return
    const n = Number(previo.n ?? 1) + 1
    const reg = { ...previo, n, sin_cerebro: aunSinCerebro, evento: { tipo: 'reintento_al_cerebro', client_id: e.client_id, encargo_id, pendientes: aunSinCerebro.map((x) => x.clave), en: P.ahora().toISOString() } }
    await P.almacen.guardarBuzon?.({ encargo_id, artefacto: { tipo: 'buzon_respuestas', version: n, contenido: reg, sha256: sha256(reg) } })
  }
  if (!lectura.ok) { await registrarReintento(); return { status: 200, cuerpo: { recogido: false, motivo: 'sin_acceso', slack: lectura.sin_acceso ?? 'desconocido', sigue_con_supuestos: true } } }
  if (!lectura.mensajes.length) {
    if (lectura.leido_hasta && lectura.leido_hasta !== e.leido_hasta) await P.almacen.guardarBuzon?.({ encargo_id, leido_hasta: lectura.leido_hasta })
    await registrarReintento()
    return { status: 200, cuerpo: { recogido: false, motivo: 'sin_mensajes_nuevos' } }
  }

  // varias respuestas en varios mensajes: cada mensaje se interpreta por separado; la última respuesta a una misma pregunta gana
  const nuevas = new Map<string, Dada & { ts: string }>()
  const notas: Array<{ ts: string; literal: string; motivo?: string }> = []
  for (const m of lectura.mensajes) {
    let alguna = false
    for (const l of leerRespuesta(m.texto, claves)) {
      if (l.tipo === 'respuesta') { nuevas.set(l.clave, { clave: l.clave, valor: valorDeSemilla(l.valor), literal: l.literal, ts: m.ts }); alguna = true }
      else if (l.tipo === 'no_entendida') { notas.push({ ts: m.ts, literal: l.literal, motivo: l.motivo }); alguna = true }
    }
    if (!alguna) notas.push({ ts: m.ts, literal: m.texto })
  }

  const semilla: Semilla = { ...(e.semilla ?? {}) }
  const fus = fusionar(Array.isArray(semilla.respuestas_del_dueno) ? semilla.respuestas_del_dueno : [], [...nuevas.values()].map(({ clave, valor, literal }) => ({ clave, valor, literal })))
  if (fus.aplicadas.length) semilla.respuestas_del_dueno = fus.lista

  // lo recién aplicado se guarda en el cerebro (la que ya estaba aplicada ya se guardó antes)
  const paraCerebro: SinCerebro[] = fus.aplicadas.map((k) => { const n = nuevas.get(k) as Dada & { ts: string }; return { clave: k, respuesta: n.literal, ts: n.ts } })
  const falloAhora = await guardarEnCerebro(paraCerebro)
  const sinCerebro = [...aunSinCerebro, ...falloAhora]

  const n = Number(previo.n ?? 1) + 1
  const pendientes = claves.filter((k) => !fus.lista.some((x) => x.clave === k))
  const registro = {
    n,
    evento: { tipo: 'respuestas_del_dueno_recibidas', client_id: e.client_id, encargo_id, claves_respondidas: fus.aplicadas, claves_pendientes: pendientes, en_el_cerebro: paraCerebro.length - falloAhora.length, en: P.ahora().toISOString() },
    claves, preguntas: preguntadas, sin_cerebro: sinCerebro, canal: e.slack_canal, ts: e.slack_ts,
    respuestas: [...nuevas.values()].map((x) => ({ clave: x.clave, valor: x.valor, literal: x.literal, ts: x.ts })),
    notas,
  }
  await P.almacen.guardarBuzon?.({ encargo_id, leido_hasta: lectura.leido_hasta, ...(fus.aplicadas.length ? { semilla } : {}), artefacto: { tipo: 'buzon_respuestas', version: n, contenido: registro, sha256: sha256(registro) } })
  return {
    status: 200,
    cuerpo: {
      recogido: true, aplicadas: fus.aplicadas, pendientes, notas: notas.length, listo_para_siguiente_ronda: pendientes.length === 0,
      ...(sinCerebro.length ? { aviso: `el cerebro no recibió ${sinCerebro.length} respuesta(s): quedan en la semilla y se reintentan en la próxima recogida`, sin_cerebro: sinCerebro.map((x) => x.clave) } : {}),
    },
  }
}
