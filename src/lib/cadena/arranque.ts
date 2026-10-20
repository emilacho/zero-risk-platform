/**
 * EL ARRANQUE POR EVENTO (CC#2 · 2026-10-20 · parte 3 «que las piezas se produzcan solas»). Hasta hoy el parte de producción solo lo pedía el reloj del vigía (06:00 y 18:00): entre «la campaña pasó a `activa`»
 * y la siguiente vuelta del reloj no ocurría nada. Ahora, al activarse la campaña, la plataforma deja EN ESE MOMENTO los mismos sobres de lote que dejaría el reloj (`cadena/vigia · briefear`), con la MISMA
 * llave de idempotencia: si el reloj corre después, la sala responde `duplicado` y no se produce dos veces. El reloj sigue ahí de respaldo.
 *
 * NACE APAGADO: `cadena_config.arranque_por_evento` ≠ `true` ⇒ no hace nada (la cadena es la de siempre). NUNCA frena el cambio de estado: un fallo se devuelve declarado y el reloj lo recoge.
 * No llama a ningún modelo ni despacha por su cuenta: solo deja sobres en la sala (que es quien despacha, ADR-018). La compuerta de la cadena ya la comprobó `avanzarCampana` antes de llegar aquí.
 */
import type { Almacen, Campana } from './almacen'
import { lotesVencidos } from './datos'

export const FUENTE_DEL_LOTE = 'cadena/vigia'
export const INTENCION_DEL_LOTE = 'briefear'

/** el sobre de un lote, idéntico al que arma el nodo «3 · Sobres de lote» del vigía */
export interface SobreDeLote {
  source: typeof FUENTE_DEL_LOTE
  intent: typeof INTENCION_DEL_LOTE
  payload: { modo: 'parte'; campana_id: string; lote: string; fila_ids: string[]; dry_run: boolean; client_id: string }
  idempotency_key: string
  logical_period: string
  tenant_id: string
  client_id: string
}

export function sobreDeLote(c: Pick<Campana, 'id' | 'client_id' | 'seco'>, l: { lote: string; fila_ids: string[]; idempotency_key: string }): SobreDeLote {
  return {
    source: FUENTE_DEL_LOTE, intent: INTENCION_DEL_LOTE,
    payload: { modo: 'parte', campana_id: c.id, lote: l.lote, fila_ids: l.fila_ids, dry_run: c.seco === true, client_id: c.client_id },
    idempotency_key: l.idempotency_key, logical_period: l.lote, tenant_id: c.client_id, client_id: c.client_id,
  }
}

export type ResultadoDelArranque =
  | { arranque: 'apagado' }
  | { arranque: 'hecho'; lotes: number; aceptados: number; duplicados: number; rechazados: Array<{ lote: string; detalle: string }> }
  | { arranque: 'fallo'; error: string }

/** cuántos lotes máximo se dejan de una vez (una campaña de 4 semanas no pasa de ~5; el tope impide un sobre por fila si algo se desborda) */
export const MAXIMO_DE_LOTES_POR_ARRANQUE = 12

export async function arrancarAlActivar(al: Almacen, c: Campana, ahora: string): Promise<ResultadoDelArranque> {
  try {
    if ((await al.leerConfig('arranque_por_evento')) !== true) return { arranque: 'apagado' }
    const { lotes } = await lotesVencidos(al, c, ahora.slice(0, 10))
    let aceptados = 0, duplicados = 0
    const rechazados: Array<{ lote: string; detalle: string }> = []
    for (const l of lotes.slice(0, MAXIMO_DE_LOTES_POR_ARRANQUE)) {
      const r = await al.emitirSobre(sobreDeLote(c, l))
      if (r.resultado === 'aceptado') aceptados++
      else if (r.resultado === 'duplicado') duplicados++
      else rechazados.push({ lote: l.lote, detalle: r.detalle ?? 'rechazado' })
    }
    return { arranque: 'hecho', lotes: Math.min(lotes.length, MAXIMO_DE_LOTES_POR_ARRANQUE), aceptados, duplicados, rechazados }
  } catch (e) {
    return { arranque: 'fallo', error: e instanceof Error ? e.message : String(e) }
  }
}
