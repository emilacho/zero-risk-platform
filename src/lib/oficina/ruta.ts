/**
 * Lo común de las rutas `/api/oficina/*`: la llave de despacho de la sala y la construcción de los puertos reales. Sin la variable `SALA_DISPATCH_KEY` la puerta queda CERRADA (503);
 * la llave interna NO vale aquí (patrón de `/api/sala/recados`). Toda ruta es `nodejs` y `force-dynamic`.
 */
import crypto from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { crearPuertos, type Entorno } from './adaptadores'
import type { Db } from './almacen-supabase'
import type { Puertos } from './puertos'

export function checkLlaveDeLaSala(request: Request): { ok: true } | { ok: false; status: 401 | 503; error: string; detalle: string } {
  const esperada = (process.env.SALA_DISPATCH_KEY ?? '').trim()
  if (!esperada) return { ok: false, status: 503, error: 'sala_dispatch_key_not_configured', detalle: 'las rutas de la oficina quedan cerradas sin SALA_DISPATCH_KEY' }
  const x = Buffer.from((request.headers.get('x-sala-dispatch-key') ?? '').trim()), y = Buffer.from(esperada)
  if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return { ok: false, status: 401, error: 'unauthorized', detalle: 'falta o no coincide x-sala-dispatch-key' }
  return { ok: true }
}

export function entornoDe(request: Request): Entorno {
  const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined)
  return {
    baseUrl: new URL(request.url).origin, internalKey: process.env.INTERNAL_API_KEY ?? '',
    openaiKey: process.env.OPENAI_API_KEY, revisorModelo: process.env.OFICINA_REVISOR_MODEL,
    revisorPrecioEntrada: num(process.env.OFICINA_REVISOR_PRECIO_ENTRADA_USD_M), revisorPrecioSalida: num(process.env.OFICINA_REVISOR_PRECIO_SALIDA_USD_M),
    slackToken: process.env.OFICINA_SLACK_BOT_TOKEN, slackCanalHilo: process.env.OFICINA_SLACK_CANAL, slackCanalAlertas: process.env.OFICINA_SLACK_ALERTAS,
  }
}

export function puertosReales(request: Request): { P: Puertos; db: Db } {
  const db = getSupabaseAdmin() as unknown as Db
  return { P: crearPuertos(db, entornoDe(request)), db }
}

export const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
