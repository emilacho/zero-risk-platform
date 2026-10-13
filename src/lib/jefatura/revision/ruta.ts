/**
 * Lo común de las rutas `/api/jefatura/{revisiones,turnos,vigia}`: la llave de despacho de la sala y la construcción de los puertos reales. Sin la variable `SALA_DISPATCH_KEY` la puerta queda CERRADA (503);
 * la llave interna NO vale aquí (mismo patrón que `/api/oficina/*`). Toda ruta es `nodejs` y `force-dynamic`.
 * Es una copia deliberada de `checkLlaveDeLaSala` de la oficina (10 líneas): así la jefatura no importa la ruta de la oficina, que arrastra sus adaptadores; una prueba exige el mismo comportamiento.
 */
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { crearPuertos, entornoDeProceso } from './adaptadores'
import type { Db } from './almacen-supabase'
import type { Puertos } from './puertos'

export function checkLlaveDeLaSala(request: Request): { ok: true } | { ok: false; status: 401 | 503; error: string; detalle: string } {
  const esperada = (process.env.SALA_DISPATCH_KEY ?? '').trim()
  if (!esperada) return { ok: false, status: 503, error: 'sala_dispatch_key_not_configured', detalle: 'las rutas de la jefatura quedan cerradas sin SALA_DISPATCH_KEY' }
  const x = Buffer.from((request.headers.get('x-sala-dispatch-key') ?? '').trim()), y = Buffer.from(esperada)
  if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return { ok: false, status: 401, error: 'unauthorized', detalle: 'falta o no coincide x-sala-dispatch-key' }
  return { ok: true }
}

export function puertosReales(): { P: Puertos; db: Db } {
  const db = getSupabaseAdmin() as unknown as Db
  return { P: crearPuertos(db, entornoDeProceso()), db }
}

export const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
