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

/** 03-nov: el tipo de una pausa que se abre por un BORRADO del cliente (la marca `motivo_tipo` de `cerebro_portero_pausas`) */
export const TIPO_BORRADO = 'borrado'
/** a las 3 h de abierta una pausa «hasta la alta» suena UNA alarma; las que no son de borrado se cierran ahí, las de borrado esperan al fin del alta */
export const HORAS_PARA_AVISAR_DE_UNA_PAUSA = 3
/** una pausa por borrado sin alta a las 24 h se cierra sola con una alarma: el cliente vuelve a raspar (nadie tiene que reanudarla a mano) */
export const HORAS_MAXIMAS_DE_UNA_PAUSA_DE_BORRADO = 24

/**
 * LA VIGÍA DE PAUSAS «HASTA LA ALTA» (03-nov · firma de Emilio): ninguna pausa queda abierta sin que alguien se entere. Corre en el cron de cada 5 minutos (solo lee la base; US$ 0).
 *  · pausa corriente: a las 3 h se CIERRA con UNA alarma en #alertas (el alta no avisó que terminó, pero el cliente no puede quedar sin recolectar);
 *  · pausa por borrado: a las 3 h solo AVISA (UNA vez); la cierra el fin del alta (el ⑦ real) o, si a las 24 h no hubo alta, se cierra sola con otra alarma.
 * Cada alarma es un incidente con su clave (no se repite). Una falla de lectura/escritura se DICE en `errores`; nunca lanza.
 */
export async function vigiarPausasDeAlta(db: Db, ahora: Date, avisar?: (texto: string, clave?: string) => Promise<unknown>): Promise<{ abiertas: number; avisadas: number; cerradas: number; errores: string[] }> {
  const out = { abiertas: 0, avisadas: 0, cerradas: 0, errores: [] as string[] }
  try {
    const q = await db.from('cerebro_portero_pausas').select('id, client_id, desde, motivo, motivo_tipo').eq('termina_con', FIN_ALTA_TERMINADA).is('levantada_en', null).limit(100)
    if (q.error) { out.errores.push(`cerebro_portero_pausas: ${q.error.message}`); return out }
    const filas = lista(q.data)
    out.abiertas = filas.length
    if (!filas.length) return out
    const nombres = new Map<string, string>()
    try {
      const c = await db.from('clients').select('id, name').in('id', filas.map((f) => String(f.client_id)))
      for (const x of lista(c.data)) nombres.set(String(x.id), txt(x.name))
    } catch { /* sin nombre: se usa el id corto */ }
    for (const p of filas) {
      const id = String(p.id), cliente = String(p.client_id)
      const desde = Date.parse(txt(p.desde))
      if (!Number.isFinite(desde)) { out.errores.push(`pausa ${id}: fecha ilegible`); continue }
      const horas = (ahora.getTime() - desde) / 3_600_000
      const quien = nombres.get(cliente) || cliente.slice(0, 8)
      const borrado = txt(p.motivo_tipo) === TIPO_BORRADO
      const decir = async (texto: string, clave: string) => { if (!avisar) return; try { await avisar(texto, clave); out.avisadas++ } catch (e) { out.errores.push(`aviso ${clave}: ${e instanceof Error ? e.message : String(e)}`) } }
      const cerrar = async (por: string, porQue: string): Promise<boolean> => {
        const u = await db.from('cerebro_portero_pausas').update({ levantada_en: ahora.toISOString(), levantada_por: por, motivo_de_levantarla: porQue }).eq('id', id).is('levantada_en', null)
        if (u.error) { out.errores.push(`cerrar ${id}: ${u.error.message}`); return false }
        out.cerradas++
        return true
      }
      if (borrado) {
        if (horas >= HORAS_MAXIMAS_DE_UNA_PAUSA_DE_BORRADO) {
          if (await cerrar('vigía de pausas: 24 h sin alta', `pausa por borrado: pasaron ${HORAS_MAXIMAS_DE_UNA_PAUSA_DE_BORRADO} h sin que el alta terminara; el cliente vuelve a recolectar`))
            await decir(`🟠 Portero del cerebro · la pausa por borrado de ${quien} cumplió ${HORAS_MAXIMAS_DE_UNA_PAUSA_DE_BORRADO} h sin que el alta terminara: se cerró sola y ${quien} vuelve a recolectar en la próxima corrida`, `pausa-alta:${id}:24h`)
        } else if (horas >= HORAS_PARA_AVISAR_DE_UNA_PAUSA) {
          await decir(`🟡 Portero del cerebro · ${quien} lleva ${Math.floor(horas)} h pausado por un borrado y el alta no ha terminado (se cierra con el fin del alta o sola a las ${HORAS_MAXIMAS_DE_UNA_PAUSA_DE_BORRADO} h)`, `pausa-alta:${id}:3h`)
        }
      } else if (horas >= HORAS_PARA_AVISAR_DE_UNA_PAUSA) {
        if (await cerrar(`vigía de pausas: ${HORAS_PARA_AVISAR_DE_UNA_PAUSA} h`, `la pausa «hasta la alta» cumplió ${HORAS_PARA_AVISAR_DE_UNA_PAUSA} h sin aviso de fin del alta: se cierra sola`))
          await decir(`🟠 Portero del cerebro · la pausa «hasta la alta» de ${quien} cumplió ${HORAS_PARA_AVISAR_DE_UNA_PAUSA} h sin que el alta avisara que terminó: se cerró sola y ${quien} vuelve a recolectar`, `pausa-alta:${id}:3h`)
      }
    }
  } catch (e) { out.errores.push(e instanceof Error ? e.message : String(e)) }
  return out
}
