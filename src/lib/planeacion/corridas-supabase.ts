/** Adaptador de `plan_corridas` sobre Supabase (service_role). Sin lógica: solo traduce el puerto de `corridas.ts` a consultas. */
import type { FilaDeCorrida, PuertoDeCorridas } from './corridas'

type Res = { data: unknown; error: { message: string; code?: string } | null }
/** lo mínimo del cliente de Supabase que usamos (la prueba pone un doble) */
export interface Db { from(t: string): any }

const TABLA = 'plan_corridas'
const COLS = 'id,client_id,corrida,estado,espera_desde,vence_en,intentos,motivo,dry_run,actualizado_en'
const una = (d: unknown): FilaDeCorrida | null => (Array.isArray(d) ? ((d[0] as FilaDeCorrida) ?? null) : ((d as FilaDeCorrida) ?? null))
const falla = (q: string, e: { message: string }): never => { throw new Error(`plan_corridas · ${q}: ${e.message}`) }

export function almacenDeCorridas(db: Db, ahora: () => Date = () => new Date()): PuertoDeCorridas {
  return {
    ahora,
    async insertarUnaVez(f) {
      const ins = (await db.from(TABLA).upsert(f, { onConflict: 'client_id,corrida', ignoreDuplicates: true }).select(COLS)) as Res
      if (ins.error) {
        // 23505 = el índice único parcial «una activa por cliente»
        if (ins.error.code === '23505') return { choque: true }
        return falla('insertar', ins.error)
      }
      const creada = una(ins.data)
      if (creada) return { creada: true, fila: creada }
      const ya = (await db.from(TABLA).select(COLS).eq('client_id', f.client_id).eq('corrida', f.corrida).limit(1)) as Res
      if (ya.error) return falla('releer', ya.error)
      const fila = una(ya.data)
      if (!fila) return falla('releer', { message: 'la fila no existe tras ON CONFLICT DO NOTHING' })
      return { creada: false, fila }
    },
    async leer(client_id, corrida) {
      const r = (await db.from(TABLA).select(COLS).eq('client_id', client_id).eq('corrida', corrida).limit(1)) as Res
      if (r.error) return falla('leer', r.error)
      return una(r.data)
    },
    async activaDe(client_id) {
      const r = (await db.from(TABLA).select(COLS).eq('client_id', client_id).in('estado', ['esperando', 'corriendo']).limit(1)) as Res
      if (r.error) return falla('leer la activa', r.error)
      return una(r.data)
    },
    async avanzarSi(client_id, corrida, intentosEsperado, cambios) {
      const r = (await db.from(TABLA).update({ ...cambios, actualizado_en: new Date().toISOString() })
        .eq('client_id', client_id).eq('corrida', corrida).eq('intentos', intentosEsperado).in('estado', ['esperando', 'corriendo']).select(COLS)) as Res
      if (r.error) return falla('avanzar', r.error)
      return una(r.data)
    },
    async vivasVencidas(ahoraIso) {
      const r = (await db.from(TABLA).select(COLS).in('estado', ['esperando', 'corriendo']).lt('vence_en', ahoraIso).limit(200)) as Res
      if (r.error) return falla('leer vencidas', r.error)
      return (r.data as FilaDeCorrida[]) ?? []
    },
  }
}
