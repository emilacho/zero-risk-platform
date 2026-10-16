/**
 * BUZÓN · la oficina financiera pregunta al dueño por MENSAJE DIRECTO y recoge sus respuestas sola (CC#1 · 16-oct). NACE APAGADO (`finanzas_config.preguntas_slack` ≠ `envia` → 0 envíos, 0 lecturas).
 *  · PREGUNTAR: las preguntas «realmente necesarias» del acuerdo (`preguntas_a_emilio`, hasta 3) salen en UN solo MD, sin jerga, con la recomendación del jefe y «si no respondes». Un encargo = un MD (idempotente).
 *  · RECOGER: lee el MD (solo lo POSTERIOR al cursor, solo del dueño), interpreta con `leerRespuesta` y deja `semilla.respuestas_del_dueno` (el campo que ya lee cada paso como «dato confirmado por él»).
 *    La misma respuesta no se aplica dos veces; una ambigua queda como NOTA con su literal (nunca una cifra inventada); una respuesta nueva a la misma pregunta REEMPLAZA la anterior.
 *  · AVISAR AL CEREBRO: NO se escribe en el cerebro. Cada recogida deja un registro versionado (`buzon_respuestas`, con el bloque `evento`) en `finanzas_artefactos`: quien alimenta el cerebro lo lee de ahí.
 *  · Slack caído o sin permiso: el encargo sigue con los supuestos (nunca lanza). Recoger NO dispara la siguiente ronda: el encargo queda listo para ella.
 */
import { armarMensaje, leerRespuesta, puedeEnviarAhora, TOPE_POR_CLIENTE_24H, TOPE_POR_DIA_TOTAL, type Pregunta } from '../preguntas'
import type { Respuesta } from './orquestador'
import type { AlmacenDeConversa, EncargoDeConversa, Semilla } from './puertos'
import type { SlackMd } from './buzon-slack'
import { sha256 } from './util'

export interface PuertosDelBuzon {
  almacen: AlmacenDeConversa
  slack: SlackMd
  /** `finanzas_config.preguntas_slack` */
  modo: 'apagado' | 'borrador' | 'envia'
  /** conversación de verdad: un encargo en seco no escribe a nadie */
  ahora(): Date
  /** el nombre con que se habla del cliente en el mensaje (por omisión, su id) */
  nombreDelCliente?(client_id: string): Promise<string | null>
  /** mensajes ya enviados por este cliente en 24 h y entre todos hoy (para los topes); sin él se asume 0 y el tope lo da «un encargo = un MD» */
  enviados?(client_id: string): Promise<{ cliente_24h: number; hoy: number }>
}

const esMd = (canal: string | null) => typeof canal === 'string' && /^D[A-Z0-9]+$/.test(canal)
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

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

// ───────────────────────────────────────────────────────── PREGUNTAR
export async function preguntarAlDueno(P: PuertosDelBuzon, encargo_id: string): Promise<Respuesta> {
  if (P.modo !== 'envia') return { status: 200, cuerpo: { enviado: false, motivo: 'buzon_apagado', modo: P.modo } }
  const c = await cargar(P, encargo_id)
  if (!('e' in c)) return c
  const e = c.e
  if (e.dry_run) return { status: 200, cuerpo: { enviado: false, motivo: 'encargo_en_seco' } }
  if (esMd(e.slack_canal) && e.slack_ts) return { status: 200, cuerpo: { enviado: false, motivo: 'ya_enviado', slack_ts: e.slack_ts } }
  const arts = await P.almacen.artefactos(encargo_id).catch(() => ({}) as Record<string, Record<string, unknown>>)
  const hechas = preguntasDelAcuerdo(arts)
  if (!hechas.length) return { status: 200, cuerpo: { enviado: false, motivo: 'sin_preguntas' } }
  const env = await P.enviados?.(e.client_id).catch(() => ({ cliente_24h: 0, hoy: 0 })) ?? { cliente_24h: 0, hoy: 0 }
  // el jefe ya filtró «realmente necesarias»; aquí solo los topes de ritmo y el interruptor
  if (env.cliente_24h >= TOPE_POR_CLIENTE_24H) return { status: 200, cuerpo: { enviado: false, motivo: 'tope: un mensaje por cliente cada 24 h' } }
  if (env.hoy >= TOPE_POR_DIA_TOTAL) return { status: 200, cuerpo: { enviado: false, motivo: 'tope: 3 mensajes por día entre todos los clientes' } }
  if (!puedeEnviarAhora(P.modo, { si: true })) return { status: 200, cuerpo: { enviado: false, motivo: 'no_envia' } }
  const nombre = (await P.nombreDelCliente?.(e.client_id).catch(() => null)) || e.client_id
  const msg = armarMensaje({ cliente: nombre, preguntas: hechas.slice(0, 3) })
  if (!msg.ok) return { status: 200, cuerpo: { enviado: false, motivo: 'pregunta_mal_formada', errores: msg.errores } }
  // «1 200» es ambiguo para el lector (¿pregunta 1 o mil doscientos?): el mensaje enseña el formato que no lo es
  const texto = `${msg.texto}
Ejemplo de respuesta: «1: 200», «2: 2,10», «3: no».`
  const env2 = await P.slack.enviarAlDueno(texto).catch(() => ({ ok: false as const, motivo: 'red' }))
  if (!env2.ok) return { status: 200, cuerpo: { enviado: false, motivo: 'sin_md', slack: env2.motivo } }
  const md = { canal: env2.canal }, pub = { ts: env2.ts }
  const registro = { n: 1, evento: { tipo: 'preguntas_enviadas_al_dueno', client_id: e.client_id, encargo_id, claves: msg.claves, en: P.ahora().toISOString() }, claves: msg.claves, canal: md.canal, ts: pub.ts, respuestas: [], notas: [] }
  await P.almacen.guardarBuzon?.({ encargo_id, slack_canal: md.canal, slack_ts: pub.ts, leido_hasta: pub.ts, artefacto: { tipo: 'buzon_respuestas', version: 1, contenido: registro, sha256: sha256(registro) } })
  return { status: 200, cuerpo: { enviado: true, preguntas: msg.claves.length, claves: msg.claves, slack_ts: pub.ts } }
}

// ───────────────────────────────────────────────────────── RECOGER
type Dada = { clave: string; valor: unknown; literal: string }
const valorDeSemilla = (v: unknown): unknown => (objeto(v) && typeof v.cifra === 'number' ? v.cifra : v)

export async function recogerRespuestas(P: PuertosDelBuzon, encargo_id: string): Promise<Respuesta> {
  if (P.modo !== 'envia') return { status: 200, cuerpo: { recogido: false, motivo: 'buzon_apagado', modo: P.modo } }
  const c = await cargar(P, encargo_id)
  if (!('e' in c)) return c
  const e = c.e
  if (e.dry_run) return { status: 200, cuerpo: { recogido: false, motivo: 'encargo_en_seco' } }
  if (!esMd(e.slack_canal) || !e.slack_ts) return { status: 200, cuerpo: { recogido: false, motivo: 'sin_md_abierto' } }
  const previo = await ultimoRegistro(P, encargo_id)
  const claves = Array.isArray(previo.claves) ? (previo.claves as unknown[]).map(String) : []
  if (!claves.length) return { status: 200, cuerpo: { recogido: false, motivo: 'sin_preguntas_registradas' } }
  const lectura = await P.slack.leer({ canal: e.slack_canal as string, thread_ts: e.slack_ts, desde_ts: e.leido_hasta }).catch(() => ({ ok: false as const, mensajes: [], leido_hasta: e.leido_hasta, sin_acceso: 'red' }))
  if (!lectura.ok) return { status: 200, cuerpo: { recogido: false, motivo: 'sin_acceso', slack: lectura.sin_acceso ?? 'desconocido', sigue_con_supuestos: true } }
  if (!lectura.mensajes.length) {
    if (lectura.leido_hasta && lectura.leido_hasta !== e.leido_hasta) await P.almacen.guardarBuzon?.({ encargo_id, leido_hasta: lectura.leido_hasta })
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
  const actuales: Dada[] = Array.isArray(semilla.respuestas_del_dueno) ? [...semilla.respuestas_del_dueno] : []
  const aplicadas: string[] = []
  for (const n of nuevas.values()) {
    const i = actuales.findIndex((x) => x.clave === n.clave)
    if (i >= 0 && actuales[i].literal === n.literal && JSON.stringify(actuales[i].valor) === JSON.stringify(n.valor)) continue // la misma respuesta no se aplica dos veces
    const dato = { clave: n.clave, valor: n.valor, literal: n.literal }
    if (i >= 0) actuales[i] = dato; else actuales.push(dato)
    aplicadas.push(n.clave)
  }
  if (aplicadas.length) semilla.respuestas_del_dueno = actuales

  const n = Number(previo.n ?? 1) + 1
  const registro = {
    n,
    evento: { tipo: 'respuestas_del_dueno_recibidas', client_id: e.client_id, encargo_id, claves_respondidas: aplicadas, claves_pendientes: claves.filter((k) => !actuales.some((x) => x.clave === k)), en: P.ahora().toISOString() },
    claves, canal: e.slack_canal, ts: e.slack_ts,
    respuestas: [...nuevas.values()].map((x) => ({ clave: x.clave, valor: x.valor, literal: x.literal, ts: x.ts })),
    notas,
  }
  await P.almacen.guardarBuzon?.({ encargo_id, leido_hasta: lectura.leido_hasta, ...(aplicadas.length ? { semilla } : {}), artefacto: { tipo: 'buzon_respuestas', version: n, contenido: registro, sha256: sha256(registro) } })
  return { status: 200, cuerpo: { recogido: true, aplicadas, pendientes: registro.evento.claves_pendientes, notas: notas.length, listo_para_siguiente_ronda: registro.evento.claves_pendientes.length === 0 } }
}
