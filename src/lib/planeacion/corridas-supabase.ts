/** Adaptador de `plan_corridas` sobre Supabase (service_role). Sin lógica: solo traduce el puerto de `corridas.ts` a consultas. */
import type { FilaDeCorrida, PuertoDeCorridas } from './corridas'

type Res = { data: unknown; error: { message: string; code?: string } | null }
/** lo mínimo del cliente de Supabase que usamos (la prueba pone un doble) */
export interface Db { from(t: string): any }

const TABLA = 'plan_corridas'
const COLS = 'id,client_id,corrida,estado,espera_desde,vence_en,intentos,motivo,dry_run,actualizado_en,prorrogas'
const una = (d: unknown): FilaDeCorrida | null => (Array.isArray(d) ? ((d[0] as FilaDeCorrida) ?? null) : ((d as FilaDeCorrida) ?? null))
const falla = (q: string, e: { message: string }): never => { throw new Error(`plan_corridas · ${q}: ${e.message}`) }

/** el flujo del plan en n8n: mesa y finanzas corren mientras él espera, así que basta con mirarlo a él */
export const FLUJO_DEL_PLAN = 'X9F0zp6LQ2xGEYVS'

/**
 * ¿Sigue viva en n8n? Mira si el flujo del plan tiene algo corriendo o en espera. No distingue qué cliente: leer el contenido de cada ejecución pesa demasiado para un reloj de 15 min, y equivocarse aquí solo
 * retrasa liberar al cliente, con tope. `null` = no se pudo saber. La llave no sale de aquí.
 */
export function sigueVivaEnN8n(o: { base?: string; llave?: string; traer?: typeof fetch } = {}): () => Promise<boolean | null> {
  const base = (o.base ?? process.env.N8N_BASE_URL ?? '').replace(/\/+$/, ''), llave = o.llave ?? process.env.N8N_API_KEY, traer = o.traer ?? fetch
  return async () => {
    if (!base || !llave) return null
    try {
      const pedidos = await Promise.all(['running', 'waiting'].map((status) => traer(`${base}/api/v1/executions?workflowId=${FLUJO_DEL_PLAN}&status=${status}&limit=1`, { headers: { 'X-N8N-API-KEY': llave, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })))
      if (pedidos.some((r) => !r.ok)) return null
      const cuerpos = await Promise.all(pedidos.map((r) => r.json() as Promise<{ data?: unknown }>))
      if (cuerpos.some((c) => !Array.isArray(c.data))) return null
      return cuerpos.some((c) => (c.data as unknown[]).length > 0)
    } catch { return null }
  }
}

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
        .eq('client_id', client_id).eq('corrida', corrida).eq('intentos', intentosEsperado).in('estado', ['esperando', 'corriendo', 'en_pausa']).select(COLS)) as Res
      if (r.error) return falla('avanzar', r.error)
      return una(r.data)
    },
    async anotarEntregaTardia(client_id, corrida, motivo) {
      const r = (await db.from(TABLA).update({ motivo, actualizado_en: new Date().toISOString() }).eq('client_id', client_id).eq('corrida', corrida).eq('estado', 'fallida').select(COLS)) as Res
      if (r.error) return falla('anotar la entrega tardía', r.error)
      return Boolean(una(r.data))
    },
    async vivasVencidas(ahoraIso) {
      const r = (await db.from(TABLA).select(COLS).in('estado', ['esperando', 'corriendo']).lt('vence_en', ahoraIso).limit(200)) as Res
      if (r.error) return falla('leer vencidas', r.error)
      return (r.data as FilaDeCorrida[]) ?? []
    },
  }
}
