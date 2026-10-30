/**
 * CERRAR LAS PAUSAS «HASTA LA ALTA» (30-oct · firma de Emilio) · archivo aparte y sin dependencias de las rutas, para que `alimentar.ts` y `listo.ts` lo usen sin ciclos.
 */
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/** la condición de fin que cierra sola una pausa: «hasta que termine la alta de este cliente» */
export const FIN_ALTA_TERMINADA = 'alta_terminada'

/**
 * La alta avisó que terminó (el «listo» del despertar, o el ⑧ que completa): cierra SOLAS las pausas abiertas de ese cliente que llevan `termina_con = alta_terminada`, con motivo y quién.
 * `terminoEn` = la hora del despertar/completar que avisó: una alta ANTERIOR a la pausa no la cierra. Nunca lanza: devuelve `{ cerradas, error? }` (la alta no debe caerse por esto).
 */
export async function cerrarPausasDeAlta(db: Db, clientId: string, terminoEn: Date, ahora: Date = new Date()): Promise<{ cerradas: number; error?: string }> {
  try {
    const q = await db.from('cerebro_portero_pausas').select('id, desde').eq('client_id', clientId).eq('termina_con', FIN_ALTA_TERMINADA).is('levantada_en', null).limit(10)
    if (q.error) return { cerradas: 0, error: `cerebro_portero_pausas: ${q.error.message}` }
    let cerradas = 0
    for (const p of lista(q.data)) {
      const desde = Date.parse(txt(p.desde))
      if (!Number.isFinite(desde) || terminoEn.getTime() <= desde) continue
      const u = await db.from('cerebro_portero_pausas').update({ levantada_en: ahora.toISOString(), levantada_por: 'alta terminada', motivo_de_levantarla: 'alta terminada: el despertar/completar de la alta avisó que el cerebro está listo' }).eq('id', String(p.id)).is('levantada_en', null)
      if (u.error) return { cerradas, error: `cerebro_portero_pausas: ${u.error.message}` }
      cerradas++
    }
    return { cerradas }
  } catch (e) { return { cerradas: 0, error: e instanceof Error ? e.message : String(e) } }
}
