/**
 * POST /api/vigia/lecturas · el vigilante de costos de n8n manda lo que leyó con SU llave (código de respuesta y, si leyó, el uso del mes) y aquí se decide qué decir en `#alertas`:
 * una alarma por incidente, cambios y «volvió» en su hilo, y el tope del mes una vez por umbral y ciclo (lógica en `lib/vigia-de-lecturas/vigia.ts`). Llave interna (`x-api-key`). US$ 0, sin modelo.
 * Cuerpo: { dry_run, lecturas: [{ proveedor, estado, tipo_error?, caidas_seguidas?, uso?: { usado_usd, tope_usd, ciclo_hasta } }] }. Con `dry_run: true` solo devuelve lo que haría.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { avisarPorIncidente, resolverIncidente } from '@/lib/portero-alimenta/alertas'
import { decidir, ejecutar, leerCuerpo } from '@/lib/vigia-de-lecturas/vigia'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 800

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const c = leerCuerpo(cuerpo)
  if (!c.ok) return NextResponse.json({ error: 'entrada_invalida', detalle: c.detalle }, { status: 400 })
  const acciones = decidir(c.lecturas)
  if (c.dry_run) return NextResponse.json({ ok: true, dry_run: true, acciones })
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const resultados = await ejecutar(acciones, { avisar: avisarPorIncidente({ db }), resolver: resolverIncidente({ db }) })
    const ok = resultados.every((r) => r.ok)
    return NextResponse.json({ ok, dry_run: false, resultados }, { status: ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ error: 'vigia_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
