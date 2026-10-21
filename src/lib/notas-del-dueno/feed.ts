/**
 * LAS NOTAS DEL DUEÑO, LISTAS PARA QUE EL CEREBRO LAS INGIERA (firma de Emilio 13:47: «todas las oficinas pueden consultar el cerebro; deja las notas listas para que lo INGIERA por su puerta»).
 * Esto es SOLO LECTURA y estable: una forma fija por nota (cliente, pieza, decisión, comentario, fecha). Quien las ingiere es el portero del cerebro (CC-CEREBRO), a su manera: este módulo NO escribe nada
 * en las tablas del cerebro ni llama a su puerta. Por eso el que consulta pide con un cursor (`desde`) y vuelve por lo nuevo.
 */
import type { Nota } from './tipos'

export const VERSION_DEL_FEED = 'notas_del_dueno.v1'
export const LIMITE_POR_OMISION = 100
export const LIMITE_MAXIMO = 500

export interface EventoDeNota {
  esquema: typeof VERSION_DEL_FEED
  id: string
  client_id: string
  /** `cliente`: vale para ese cliente · `general`: el dueño la marcó para todos sus clientes */
  alcance: Nota['alcance']
  /** la decisión del dueño sobre la pieza, o `comentario` si solo comentó */
  decision: Nota['tipo']
  comentario: string | null
  pieza: { hitl_id: string | null; output_id: string | null; titulo: string | null; version: string | null; familia: string | null }
  fecha: string
  autor: string
  origen: Nota['origen']
}

export const eventoParaElCerebro = (n: Nota): EventoDeNota => ({
  esquema: VERSION_DEL_FEED, id: n.id, client_id: n.client_id, alcance: n.alcance, decision: n.tipo, comentario: n.comentario,
  pieza: { hitl_id: n.hitl_id, output_id: n.output_id, titulo: n.pieza_titulo, version: n.pieza_version, familia: n.pieza_familia },
  fecha: n.creada_en, autor: n.autor, origen: n.origen,
})

/** el tope pedido, acotado: entero entre 1 y LIMITE_MAXIMO (si no es un número válido, el de omisión) */
export function limiteDe(crudo: string | null): number {
  const n = Number(crudo)
  if (crudo === null || crudo.trim() === '' || !Number.isInteger(n) || n < 1) return LIMITE_POR_OMISION
  return Math.min(n, LIMITE_MAXIMO)
}

/** una fecha ISO legible o null */
export function fechaDe(crudo: string | null): string | null {
  if (!crudo) return null
  const t = Date.parse(crudo)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
