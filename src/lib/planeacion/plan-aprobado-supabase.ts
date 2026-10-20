/**
 * Los puertos de «un plan con pendientes aprobado emite briefear» sobre Supabase y la propia puerta de la sala (CC#2 · 20-oct). Toca `hitl_queue` (lee el elemento y deja la marca en su `metadata`)
 * y llama a `/api/sala/intake` de la misma plataforma con la llave interna. No toca nada más.
 */
import type { PuertosPlanAprobado, SobreBriefear, RespuestaDeLaSala } from './plan-aprobado'

type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const comoObjeto = (x: unknown): Record<string, unknown> | null => (x !== null && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null)

export function puertosPlanAprobado(db: Db, origen: string, env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): PuertosPlanAprobado {
  return {
    ahora: () => new Date(),
    async leerElemento(id) {
      const r = await db.from('hitl_queue').select('id,type,status,client_id,payload,metadata').eq('id', id).maybeSingle()
      if (r.error) throw new Error('no pude leer la bandeja: ' + r.error.message)
      if (!r.data) return null
      const f = r.data as Fila
      return { id: String(f.id), type: (f.type as string | null) ?? null, status: String(f.status), client_id: (f.client_id as string | null) ?? null, payload: comoObjeto(f.payload), metadata: comoObjeto(f.metadata) }
    },
    async guardarMarca(id, marca) {
      const previa = await db.from('hitl_queue').select('metadata').eq('id', id).maybeSingle()
      if (previa.error) throw new Error('no pude leer la bandeja: ' + previa.error.message)
      const r = await db.from('hitl_queue').update({ metadata: { ...(comoObjeto(previa.data?.metadata) ?? {}), ...marca } }).eq('id', id)
      if (r.error) throw new Error('no pude guardar la marca: ' + r.error.message)
    },
    async emitir(sobre: SobreBriefear): Promise<RespuestaDeLaSala> {
      const llave = env.INTERNAL_API_KEY
      if (!llave) return { ok: false, code: 'sin_llave_interna', detail: 'INTERNAL_API_KEY no está en el entorno' }
      const r = await fetchImpl(`${origen.replace(/\/$/, '')}/api/sala/intake`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': llave }, body: JSON.stringify(sobre), signal: AbortSignal.timeout(20_000) })
      const cuerpo = (await r.json().catch(() => null)) as RespuestaDeLaSala | null
      return cuerpo && typeof cuerpo === 'object' ? cuerpo : { ok: false, code: 'respuesta_ilegible', detail: `HTTP ${r.status}` }
    },
  }
}
