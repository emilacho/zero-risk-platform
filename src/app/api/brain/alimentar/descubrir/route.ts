/**
 * POST /api/brain/alimentar/descubrir · qué le pide HOY el portero a Apify sobre UN cliente (todo diario) · solo lee.
 * `dry_run` obligatorio; con false exige workflow_id + workflow_execution_id. APAGADO por `PORTERO_ALIMENTAR`. El modelo solo propone búsquedas (interruptor `PORTERO_PROPONER_BUSQUEDAS`).
 * Llave interna (`x-api-key`). Nace APAGADO: nadie la llama todavía.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { interruptoresDelEntorno } from '@/lib/portero-alimenta/datos'
import { modeloRegistrado } from '@/lib/portero-alimenta/entorno'
import { rutaArticulos, rutaDescubrir } from '@/lib/portero-alimenta/rutas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  try {
    const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
    const conModelo = b.dry_run === false && typeof b.workflow_id === 'string' && typeof b.workflow_execution_id === 'string' && typeof b.client_id === 'string'
    const deps = {
      db: getSupabaseAdmin() as unknown as Db,
      interruptores: interruptoresDelEntorno(),
      // en seco NO se llama a ningún modelo (US$ 0)
      llamarModelo: conModelo ? modeloRegistrado({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '', workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string, clientId: b.client_id as string, comando: 'portero.proponer_busquedas' }) : undefined,
    }
    // `fase: 'articulos'` = la segunda tanda (qué páginas de la búsqueda de hoy vale leer); sin fase, el plan del día
    const r = b.fase === 'articulos' ? await rutaArticulos(deps, cuerpo) : await rutaDescubrir(deps, cuerpo)
    return NextResponse.json(r.body, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'portero_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
