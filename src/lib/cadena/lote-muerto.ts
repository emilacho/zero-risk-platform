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
 *   · entonces se reenvía con una llave NUEVA y determinista (`<llave>:r<n>`), a lo sumo `MAX_REINTENTOS_DE_LOTE` veces, y se avisa por el buzón (C1) con una
 *     clave fija por LLAVE de lote (campaña · semana · versión · huella): el primer aviso abre el incidente en #alertas y los siguientes solo suman repeticiones (UN mensaje por lote;
 *     una versión nueva del calendario es otro lote y abre su propio aviso);
 *   · agotado el tope, el lote deja de mandarse (sin reintento indefinido) y se vuelve a pasar por el buzón con la MISMA clave: si el incidente ya estaba abierto solo suma una
 *     repetición (sin mensaje); si nunca se abrió (un aviso anterior falló), lo abre: un lote que no sale nunca no queda en silencio (pedido de CC6);
 *   · un lote sano (sin envío previo, o con envío más nuevo que el plazo) sale con la llave de su último envío: la sala contesta «duplicado» y no pasa nada (= hoy);
 *   · campañas en seco: no se tocan (sus filas nunca se marcan, a propósito).
 * Puertos OPCIONALES en el almacén: sin `enviosDeLote` todo queda exactamente como hoy. Un aviso que falla NO frena el reenvío (el lote es lo urgente) y se anota en la respuesta.
 */
import { buildIdempotencyKey } from '@/lib/sala-event-log/idempotency'
import { FUENTE_DEL_LOTE, INTENCION_DEL_LOTE } from './arranque'
import type { LoteVencido } from './lotes'

export const HORAS_PARA_DARLO_POR_MUERTO = 2
export const MAX_REINTENTOS_DE_LOTE = 3

export interface EnviosDeLote { envios: number; ultimo_en: string | null }
export type DecisionDeLote =
  | { tipo: 'sano'; llave: string }
  | { tipo: 'reintentar'; intento: number; llave: string }
  | { tipo: 'agotado'; envios: number }

/** la llave del envío n (0 = el original, 1..3 = reintentos) */
export const llaveDeEnvio = (llave: string, n: number): string => (n <= 0 ? llave : `${llave}:r${n}`)
/** la clave del incidente en el buzón: una por LLAVE de lote (campaña · semana · versión · huella) */
export const claveDelAviso = (llave: string): string => `cadena:lote-sin-parte:${llave}`

/** el viaje al que la sala manda los lotes (regla de ruteo `cadena/vigia` + `briefear` → BRIEF) y la operación de su evento de ENTRADA */
export const VIAJE_DEL_LOTE = 'BRIEF'
export const OPERACION_DE_ENTRADA = `${VIAJE_DEL_LOTE}.intake.${FUENTE_DEL_LOTE}.${INTENCION_DEL_LOTE}`
/** las llaves con que la sala guarda la entrada del envío n (posición n = envío n: 0 el original, 1..MAX los reintentos) */
export function llavesDelRegistro(clientId: string, lote: string, llave: string): string[] {
  return Array.from({ length: MAX_REINTENTOS_DE_LOTE + 1 }, (_, n) => buildIdempotencyKey({ operation_type: OPERACION_DE_ENTRADA, client_id: clientId, logical_period: lote, input_hash: llaveDeEnvio(llave, n) }))
}
/** de las filas del registro encontradas con esas llaves: cuántos envíos lleva (el último índice + 1) y cuándo fue el último */
export function enviosDesdeElRegistro(llaves: string[], filas: Array<{ idempotency_key: string; created_at: string }>): EnviosDeLote {
  let n = -1
  let en: string | null = null
  for (const f of filas) {
    const i = llaves.indexOf(f.idempotency_key)
    if (i > n) { n = i; en = f.created_at }
  }
  return { envios: n + 1, ultimo_en: en }
}

export function decidirLote(l: Pick<LoteVencido, 'idempotency_key'>, e: EnviosDeLote, ahora: string): DecisionDeLote {
  const envios = Number.isFinite(e.envios) && e.envios > 0 ? Math.floor(e.envios) : 0
  if (envios === 0 || !e.ultimo_en) return { tipo: 'sano', llave: l.idempotency_key }
  const ultimo = Date.parse(e.ultimo_en), hora = Date.parse(ahora)
  // fecha ilegible ⇒ no se adivina: se comporta como hoy
  if (!Number.isFinite(ultimo) || !Number.isFinite(hora)) return { tipo: 'sano', llave: llaveDeEnvio(l.idempotency_key, envios - 1) }
  if (hora - ultimo < HORAS_PARA_DARLO_POR_MUERTO * 3600_000) return { tipo: 'sano', llave: llaveDeEnvio(l.idempotency_key, envios - 1) }
  const hechos = envios - 1
  if (hechos >= MAX_REINTENTOS_DE_LOTE) return { tipo: 'agotado', envios }
  return { tipo: 'reintentar', intento: hechos + 1, llave: llaveDeEnvio(l.idempotency_key, hechos + 1) }
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
