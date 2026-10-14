/**
 * Lo común de las rutas `/api/jefatura/{revisiones,turnos,vigia}`: la puerta (llave interna o de despacho) y la construcción de los puertos reales. Sin ninguna de las dos variables la puerta queda CERRADA (503).
 * Toda ruta es `nodejs` y `force-dynamic`.
 * Es una copia deliberada de `checkLlaveDeLaSala` de la oficina (10 líneas): así la jefatura no importa la ruta de la oficina, que arrastra sus adaptadores; una prueba exige el mismo comportamiento.
 */
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { crearPuertos, entornoDeProceso } from './adaptadores'
import type { Db } from './almacen-supabase'
import { N8N_POR_OMISION } from './contrato'
import type { Puertos } from './puertos'

const igual = (recibida: string, esperada: string): boolean => {
  const x = Buffer.from(recibida.trim()), y = Buffer.from(esperada)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/**
 * Dos llaves abren la puerta: la INTERNA (`x-api-key` = `INTERNAL_API_KEY`, la que usan los empleados técnicos y la sala, como `/api/sala/intake`) y la de despacho
 * (`x-sala-dispatch-key` = `SALA_DISPATCH_KEY`, la que mandan los flujos de n8n). Ninguna se acepta en la cabecera de la otra; sin ninguna de las dos variables, 503.
 */
export function checkLlaveDeLaSala(request: Request): { ok: true } | { ok: false; status: 401 | 503; error: string; detalle: string } {
  const despacho = (process.env.SALA_DISPATCH_KEY ?? '').trim(), interna = (process.env.INTERNAL_API_KEY ?? '').trim()
  if (!despacho && !interna) return { ok: false, status: 503, error: 'sala_dispatch_key_not_configured', detalle: 'las rutas de la jefatura quedan cerradas sin INTERNAL_API_KEY ni SALA_DISPATCH_KEY' }
  if (interna && igual(request.headers.get('x-api-key') ?? '', interna)) return { ok: true }
  if (despacho && igual(request.headers.get('x-sala-dispatch-key') ?? '', despacho)) return { ok: true }
  return { ok: false, status: 401, error: 'unauthorized', detalle: 'falta o no coincide x-api-key (llave interna) ni x-sala-dispatch-key' }
}

/** a dónde despierta la ruta al flujo `jefatura · turno`: SOLO nuestro n8n */
export const webhookDelTurno = (env: Record<string, string | undefined> = process.env): string =>
  `${((env.N8N_WEBHOOK_BASE ?? '').trim() || N8N_POR_OMISION).replace(/\/+$/, '')}/zero-risk/jefatura-turno`

export function puertosReales(): { P: Puertos; db: Db } {
  const db = getSupabaseAdmin() as unknown as Db
  return { P: crearPuertos(db, entornoDeProceso()), db }
}

export const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const numero = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
