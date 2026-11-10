/**
 * AVISOS SIN SLACK · entrega B (CC1 · certifican CC7 código y CC6 permisos · GO Lenovo 16:14Z con «dale» de Emilio).
 * Una sola puerta para avisar: piezas, preguntas y alarmas. Orden fijo (condiciones de CC7):
 *   1. GUARDA en `avisos` (un incidente por clave; repetir cuenta, no duplica). Si guardar falla → `ErrorAlGuardar` (la ruta responde 500 y la
 *      corrida de n8n queda en rojo). Nunca avisa de su propio fallo por la misma vía.
 *   2. Recién después intenta Slack, y solo con el interruptor encendido. Una caída de Slack queda anotada en la fila (`fallo` + error limpio) y
 *      NO tumba la llamada: el aviso ya está guardado. Con el interruptor apagado se anota `apagado` y hay 0 llamadas a Slack.
 * El hilo: abrir o reabrir = mensaje nuevo; un cambio de detalle va al hilo de la fila abierta; la misma repetición no publica nada.
 * Si el primer mensaje no llegó (sin `slack_ts`), la repetición no responde en un hilo que no existe: intenta un mensaje nuevo (punto 4 de CC7).
 * Agnóstico: ningún dato de un cliente.
 */
export type Tipo = 'pieza' | 'pregunta' | 'alarma'
export type OrigenTipo = 'n8n' | 'plataforma'
export type Accion = 'abrio' | 'reabrio' | 'repetida' | 'cambio'
export type EstadoSlack = 'pendiente' | 'entregado' | 'fallo' | 'apagado'

export interface EntradaDeAviso {
  clave: string
  tipo: Tipo
  origen: string
  origen_tipo: OrigenTipo
  client_id?: string | null
  titulo: string
  detalle: string
  workflow_id?: string | null
  workflow_execution_id?: string | null
}
export interface Guardado { aviso_id: string; accion: Accion; slack_ts: string | null; slack_estado: EstadoSlack }

/** puerto del almacén (el ÚNICO lugar que nombra la tabla es su adaptador) */
export interface AlmacenDeAvisos {
  avisar(e: EntradaDeAviso): Promise<Guardado>
  cerrar(clave: string, nota: string): Promise<{ aviso_id: string; slack_ts: string | null } | null>
  anotarSlack(aviso_id: string, estado: EstadoSlack, ts: string | null, error: string | null): Promise<void>
}
/** puerto de Slack: publicar en un canal (o en un hilo) · devuelve el ts o el error, nunca lanza */
export type PublicarEnSlack = (canal: string, texto: string, hilo?: string) => Promise<{ ok: true; ts: string } | { ok: false; error: string }>

export interface Dependencias {
  almacen: AlmacenDeAvisos
  slack: PublicarEnSlack
  /** el interruptor: false = 0 llamadas a Slack */
  slackEncendido: boolean
  /** canal por tipo (las 3 reglas de «menos ruido»); un tipo sin canal anota `fallo` con su motivo */
  canales: Partial<Record<Tipo, string>>
}

export class ErrorAlGuardar extends Error {}
export class EntradaInvalida extends Error {}

const TIPOS: readonly Tipo[] = ['pieza', 'pregunta', 'alarma']
const ORIGENES: readonly OrigenTipo[] = ['n8n', 'plataforma']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** revisa la entrada · los límites son los de la tabla (para fallar con un 400 claro antes de la base) */
export function validarEntrada(raw: unknown): EntradaDeAviso {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const clave = texto(b.clave), tipo = texto(b.tipo) as Tipo, origen = texto(b.origen), origen_tipo = texto(b.origen_tipo) as OrigenTipo
  const titulo = texto(b.titulo), detalle = typeof b.detalle === 'string' ? b.detalle : ''
  const client_id = texto(b.client_id) || null, workflow_id = texto(b.workflow_id) || null, workflow_execution_id = texto(b.workflow_execution_id) || null
  if (clave.length < 3 || clave.length > 160) throw new EntradaInvalida('la clave del incidente debe tener entre 3 y 160 caracteres')
  if (!TIPOS.includes(tipo)) throw new EntradaInvalida('tipo debe ser pieza, pregunta o alarma')
  if (!origen || origen.length > 200) throw new EntradaInvalida('falta el origen (quién avisa)')
  if (!ORIGENES.includes(origen_tipo)) throw new EntradaInvalida('origen_tipo debe ser n8n o plataforma')
  if (!titulo || titulo.length > 200) throw new EntradaInvalida('el título va de 1 a 200 caracteres')
  if (detalle.length > 2000) throw new EntradaInvalida('el detalle va hasta 2000 caracteres')
  if (client_id && !UUID.test(client_id)) throw new EntradaInvalida('client_id no es un uuid')
  if (origen_tipo === 'n8n' && (!workflow_id || !workflow_execution_id)) throw new EntradaInvalida('un aviso de n8n trae workflow_id y workflow_execution_id')
  if ((workflow_id?.length ?? 0) > 100 || (workflow_execution_id?.length ?? 0) > 100) throw new EntradaInvalida('la firma de n8n es demasiado larga')
  return { clave, tipo, origen, origen_tipo, client_id, titulo, detalle, workflow_id, workflow_execution_id }
}

/** el error de Slack se guarda LIMPIO: sin direcciones, sin llaves, recortado (CC6 §2.6) */
export function errorLimpio(e: string): string {
  return e.replace(/https?:\/\/\S+/gi, '[dirección]').replace(/xox[a-z]-[A-Za-z0-9-]+/g, '[llave]').replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[llave]').slice(0, 300)
}

const mensaje = (e: EntradaDeAviso, a: Accion): string =>
  a === 'cambio' ? `↻ ${e.detalle || e.titulo}`.slice(0, 3000) : `${e.titulo}${e.detalle ? `\n${e.detalle}` : ''}`.slice(0, 3000)

export interface Resultado extends Guardado { slack: EstadoSlack; slack_anotado: boolean; slack_detalle?: string }

/** avisar: guarda primero; Slack después (si toca) · lanza solo `ErrorAlGuardar` (o `EntradaInvalida` si la entrada no sirve) */
export async function avisar(d: Dependencias, entrada: unknown): Promise<Resultado> {
  const e = validarEntrada(entrada)
  let g: Guardado
  try { g = await d.almacen.avisar(e) } catch (x) { throw new ErrorAlGuardar(x instanceof Error ? x.message : String(x)) }
  const anotar = async (estado: EstadoSlack, ts: string | null, error: string | null): Promise<boolean> => {
    try { await d.almacen.anotarSlack(g.aviso_id, estado, ts, error); return true } catch { return false }
  }
  if (!d.slackEncendido) return { ...g, slack: 'apagado', slack_anotado: await anotar('apagado', g.slack_ts, null) }
  // la misma repetición, con su primer mensaje ya entregado: solo se cuenta (no se publica otro)
  if (g.accion === 'repetida' && g.slack_ts) return { ...g, slack: g.slack_estado, slack_anotado: true }
  const canal = d.canales[e.tipo]
  if (!canal) return { ...g, slack: 'fallo', slack_anotado: await anotar('fallo', g.slack_ts, `sin canal para el tipo ${e.tipo}`), slack_detalle: 'sin canal' }
  const enHilo = g.accion === 'cambio' && g.slack_ts ? g.slack_ts : undefined
  const r = await d.slack(canal, mensaje(e, enHilo ? 'cambio' : 'abrio'), enHilo)
  if (r.ok) return { ...g, slack: 'entregado', slack_anotado: await anotar('entregado', enHilo ? g.slack_ts : r.ts, null) }
  const err = errorLimpio(r.error)
  return { ...g, slack: 'fallo', slack_anotado: await anotar('fallo', g.slack_ts, err), slack_detalle: err }
}

/** cerrar el incidente abierto de una clave · el cierre va como respuesta en su hilo (si lo hay y Slack está encendido) */
export async function cerrar(d: Dependencias, clave: string, nota: string, tipo: Tipo = 'alarma'): Promise<{ cerrado: boolean; slack: EstadoSlack | 'sin_hilo' }> {
  const c = texto(clave)
  if (c.length < 3 || c.length > 160) throw new EntradaInvalida('la clave del incidente debe tener entre 3 y 160 caracteres')
  let f: { aviso_id: string; slack_ts: string | null } | null
  try { f = await d.almacen.cerrar(c, texto(nota).slice(0, 300) || 'cerrado') } catch (x) { throw new ErrorAlGuardar(x instanceof Error ? x.message : String(x)) }
  if (!f) return { cerrado: false, slack: 'sin_hilo' }
  if (!d.slackEncendido) return { cerrado: true, slack: 'apagado' }
  const canal = d.canales[tipo]
  if (!f.slack_ts || !canal) return { cerrado: true, slack: 'sin_hilo' }
  const r = await d.slack(canal, `✅ Resuelto${texto(nota) ? ` · ${texto(nota).slice(0, 300)}` : ''}`, f.slack_ts)
  return { cerrado: true, slack: r.ok ? 'entregado' : 'fallo' }
}
