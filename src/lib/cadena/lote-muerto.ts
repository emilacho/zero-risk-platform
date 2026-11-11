/**
 * EL LOTE MUERTO (GO Lenovo 2026-11-10 18:14Z · traba de piezas, arreglo 2 · CC1).
 * Hallazgo de CC7: el reloj manda cada 30 min el lote de la semana con la MISMA llave (`campana:semana:version[:huella]`). Si la parte por filas murió (14:33Z · guarda
 * del manual), las filas siguen sin marcar y la sala contesta «duplicado» para siempre: nadie lo reintenta ni avisa.
 * Regla exacta (código, no agente):
 *   · «lote mandado» = la sala guardó la ENTRADA de ESTA llave o de uno de sus reintentos (`<llave>`, `<llave>:r1..r3`). Se busca por la llave exacta que la sala deriva del sobre
 *     (`buildIdempotencyKey` · operación `BRIEF.intake.cadena/vigia.briefear` · cliente · período · llave del sobre; comprobado contra las filas reales del 10-nov). Así no se mezclan
 *     otras campañas (pausadas, cerradas, en seco) ni otras versiones del calendario del mismo cliente: cada una tiene su llave (corrección pedida por CC7 y CC6, 10-nov);
 *   · «muerto» = el lote SIGUE vencido y sin marcar (si salió su parte, las filas ya no son `validada`/`lista_para_brief` y el lote no vuelve aquí)
 *     y el último envío tiene `HORAS_PARA_DARLO_POR_MUERTO` horas o más;
 *   · entonces se reenvía con una llave NUEVA y determinista, a lo sumo `MAX_REINTENTOS_DE_LOTE` veces, y se avisa por el buzón (C1);
 *   · 10-nov · ADENDA 2 de CC7 + ADENDA 1 de CC6: la huella del lote cambia SOLA con los días (sale de las filas que vencen ese día). Por eso los reintentos y la clave del aviso
 *     van por la BASE del lote, sin la huella: campaña · semana · versión (`<campaña>:<semana>:<versión>:r<n>`). Así el tope de 3 y el aviso son por lote, no por día:
 *     el mismo lote muerto con otra huella al día siguiente sigue su cuenta (r1, r2, r3) y suma repeticiones al MISMO incidente. Una versión nueva del calendario es otro lote
 *     (otra base) y abre su propio aviso. El envío ORIGINAL sí lleva la huella del día (es el sobre de siempre): si la huella cambia ANTES del primer reintento, ese día sale un
 *     original nuevo (a lo sumo uno por cambio de huella, y solo hasta que exista el primer reintento);
 *   · 10-nov · ADENDA 3 de CC7: contar por la base mezclaba «el mismo lote sigue muerto» con «llegaron filas NUEVAS a una semana que ya salió bien». Regla exacta: un envío
 *     CUENTA para el lote de hoy solo si alguna de SUS filas (`payload.envelope_payload.fila_ids` del sobre que guardó la sala) sigue en el lote de hoy, es decir, sigue sin parte.
 *     Si todas las filas de un envío ya salieron, ese envío es de OTRO lote: no suma intentos ni hace avisar. Si ningún envío cuenta, lo de hoy sale como ORIGINAL (su huella es
 *     nueva porque sus filas son otras). Un envío sin filas legibles SÍ cuenta (cota prudente: es la regla anterior). Los reintentos se numeran después del MAYOR número ya usado
 *     en la base (cuente o no), para no chocar con una llave vieja que la sala contestaría «duplicado»; por eso hay `LLAVES_DE_REINTENTO` números por base;
 *   · agotado el tope, el lote deja de mandarse (sin reintento indefinido) y se vuelve a pasar por el buzón con la MISMA clave: si el incidente ya estaba abierto solo suma una
 *     repetición (sin mensaje); si nunca se abrió (un aviso anterior falló), lo abre: un lote que no sale nunca no queda en silencio (pedido de CC6);
 *   · un lote sano (sin envío previo, o con envío más nuevo que el plazo) sale con la llave de su último envío: la sala contesta «duplicado» y no pasa nada (= hoy);
 *   · campañas en seco: no se tocan (sus filas nunca se marcan, a propósito).
 * Puertos OPCIONALES en el almacén: sin `enviosDeLote` todo queda exactamente como hoy. Un aviso que falla NO frena el reenvío (el lote es lo urgente) y se anota en la respuesta.
 */
import { buildIdempotencyKey } from '@/lib/sala-event-log/idempotency'
import { FUENTE_DEL_LOTE, INTENCION_DEL_LOTE } from './arranque'
import type { LoteVencido } from './lotes'
import { vidaDelPaso } from '../plazo-de-vida'

/** 11-nov · #21 · el PISO del lote. Lo decide la regla única (`plazo-de-vida.ts`). El lote no tiene agente (su parte lo escribe código, `hoja.ts`) ni despacho que lata, y no queda
 *  registro de cuándo salió su parte: no hay qué medir todavía, así que su plazo es este piso. Cuando exista ese registro, se mide como los demás */
export const HORAS_PARA_DARLO_POR_MUERTO = 2
export const MAX_REINTENTOS_DE_LOTE = 3
/** cuántos números de reintento (r1..rN) tiene cada base de lote: varios lotes de la misma semana (filas nuevas que mueren otro día) comparten la numeración */
export const LLAVES_DE_REINTENTO = 3 * MAX_REINTENTOS_DE_LOTE

/**
 * Lo que la sala sabe de los envíos de ESTE lote: `envios` = los que cuentan (alguna de sus filas sigue en el lote de hoy), `reintentos` = cuántos de esos fueron reintentos,
 * `ultimo` = el número del último que cuenta (0 = el original) y `ultimo_en` su hora, `libre` = el primer número de reintento sin usar en la base (cuente o no).
 */
export interface EnviosDeLote { envios: number; reintentos: number; ultimo: number; libre: number; ultimo_en: string | null }
/** una fila del registro de la sala: la entrada de un envío, con las filas de su sobre (null = ilegibles) */
export interface EntradaDelRegistro { idempotency_key: string; created_at: string; fila_ids?: readonly string[] | null }
export type DecisionDeLote =
  | { tipo: 'sano'; llave: string }
  | { tipo: 'reintentar'; intento: number; llave: string }
  | { tipo: 'agotado'; envios: number }

/** la BASE del lote: campaña · semana · versión, sin la huella del día (`<campaña>:<semana>:<versión>[:<huella>]` → `<campaña>:<semana>:<versión>`) */
export const baseDelLote = (llave: string): string => llave.split(':').slice(0, 3).join(':')
/** la llave del envío n (0 = el original, con la huella del día; 1..3 = reintentos, por la BASE del lote: no dependen del día) */
export const llaveDeEnvio = (llave: string, n: number): string => (n <= 0 ? llave : `${baseDelLote(llave)}:r${n}`)
/** la clave del incidente en el buzón: una por lote (campaña · semana · versión), sin la huella */
export const claveDelAviso = (llave: string): string => `cadena:lote-sin-parte:${baseDelLote(llave)}`

/** el viaje al que la sala manda los lotes (regla de ruteo `cadena/vigia` + `briefear` → BRIEF) y la operación de su evento de ENTRADA */
export const VIAJE_DEL_LOTE = 'BRIEF'
export const OPERACION_DE_ENTRADA = `${VIAJE_DEL_LOTE}.intake.${FUENTE_DEL_LOTE}.${INTENCION_DEL_LOTE}`
/** las llaves con que la sala guarda la entrada del envío n (posición n = envío n: 0 el original, 1..LLAVES_DE_REINTENTO los reintentos) */
export function llavesDelRegistro(clientId: string, lote: string, llave: string): string[] {
  return Array.from({ length: LLAVES_DE_REINTENTO + 1 }, (_, n) => buildIdempotencyKey({ operation_type: OPERACION_DE_ENTRADA, client_id: clientId, logical_period: lote, input_hash: llaveDeEnvio(llave, n) }))
}
/**
 * De las filas del registro encontradas con esas llaves y las filas del lote de HOY: qué envíos cuentan (ADENDA 3 de CC7) · pura.
 * Dentro de los que cuentan, el número más alto es el último (los números se reparten en orden: el original, luego r1, r2…).
 */
export function enviosDesdeElRegistro(llaves: string[], filas: readonly EntradaDelRegistro[], filasDeHoy: readonly string[]): EnviosDeLote {
  const hoy = new Set(filasDeHoy)
  let envios = 0, reintentos = 0, ultimo = -1, libre = 1
  let en: string | null = null
  for (const f of filas) {
    const i = llaves.indexOf(f.idempotency_key)
    if (i < 0) continue
    if (i + 1 > libre) libre = i + 1
    // todas sus filas ya salieron: es un envío de OTRO lote (no cuenta) · sin filas legibles, cuenta
    if (Array.isArray(f.fila_ids) && !f.fila_ids.some((x) => hoy.has(x))) continue
    envios++
    if (i > 0) reintentos++
    if (i > ultimo) { ultimo = i; en = f.created_at }
  }
  return { envios, reintentos, ultimo: Math.max(ultimo, 0), libre, ultimo_en: en }
}

export function decidirLote(l: Pick<LoteVencido, 'idempotency_key'>, e: EnviosDeLote, ahora: string): DecisionDeLote {
  const envios = Number.isFinite(e.envios) && e.envios > 0 ? Math.floor(e.envios) : 0
  // ningún envío cuenta (nunca se mandó, o todo lo mandado ya salió): sale como original, con su huella de hoy
  if (envios === 0 || !e.ultimo_en) return { tipo: 'sano', llave: l.idempotency_key }
  const ultimo = Date.parse(e.ultimo_en), hora = Date.parse(ahora)
  // fecha ilegible ⇒ no se adivina: se comporta como hoy
  if (!Number.isFinite(ultimo) || !Number.isFinite(hora)) return { tipo: 'sano', llave: llaveDeEnvio(l.idempotency_key, e.ultimo) }
  if (vidaDelPaso({ inicio: e.ultimo_en, pisoMs: HORAS_PARA_DARLO_POR_MUERTO * 3600_000, duraciones: null, despacho: null }, new Date(hora)).estado !== 'muerto') return { tipo: 'sano', llave: llaveDeEnvio(l.idempotency_key, e.ultimo) }
  if (e.reintentos >= MAX_REINTENTOS_DE_LOTE) return { tipo: 'agotado', envios }
  // sin números libres en la base (varios lotes de la misma semana ya los gastaron): no se adivina otra llave, queda para una persona
  if (e.libre > LLAVES_DE_REINTENTO) return { tipo: 'agotado', envios }
  return { tipo: 'reintentar', intento: e.reintentos + 1, llave: llaveDeEnvio(l.idempotency_key, e.libre) }
}

export interface AvisoDeLote { clave: string; client_id: string; titulo: string; detalle: string }
/** el aviso · el buzón manda a Slack SOLO el primero de cada clave (los siguientes suman repeticiones), así que el texto dice la política entera */
export function avisoDeLote(c: { id: string; client_id: string }, l: LoteVencido, d: Exclude<DecisionDeLote, { tipo: 'sano' }>, e: EnviosDeLote): AvisoDeLote {
  const desde = e.ultimo_en ? ` desde ${e.ultimo_en.slice(0, 16).replace('T', ' ')} UTC` : ''
  const titulo = `El lote ${l.lote} de la campaña ${c.id.slice(0, 8)} se mandó y no salió su parte`
  const detalle = d.tipo === 'reintentar'
    ? `${l.fila_ids.length} filas siguen sin parte${desde}. El sistema lo reintenta solo (intento ${d.intento} de ${MAX_REINTENTOS_DE_LOTE}, cada ${HORAS_PARA_DARLO_POR_MUERTO} h); si ninguno sale, deja de mandarlo y queda para una persona. Mira el error de la parte por filas.`
    : `${l.fila_ids.length} filas siguen sin parte tras ${MAX_REINTENTOS_DE_LOTE} reintentos${desde}. El sistema ya no lo manda más: lo tiene que mirar una persona. Mira el error de la parte por filas.`
  return { clave: claveDelAviso(l.idempotency_key), client_id: c.client_id, titulo, detalle }
}
