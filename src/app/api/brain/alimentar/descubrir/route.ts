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
import { brazosDelEntorno } from '@/lib/portero-alimenta/brazos'
import { modeloRegistrado } from '@/lib/portero-alimenta/entorno'
import { rutaArticulos, rutaClientes, rutaDescubrir, rutaTanda2 } from '@/lib/portero-alimenta/rutas'
import { eldineroFrena, modoDelEntorno } from '@/lib/portero-alimenta/modo'
import { frenarCuerpoPorPlan, revisarPlanApify } from '@/lib/portero-alimenta/plan-apify'
import { avisarAAlertas } from '@/lib/portero-alimenta/avisos'

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
      brazos: brazosDelEntorno(),
      modo: modoDelEntorno().modo,
      // en seco NO se llama a ningún modelo (US$ 0)
      llamarModelo: conModelo ? modeloRegistrado({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '', workflowId: b.workflow_id as string, ejecucionId: b.workflow_execution_id as string, clientId: b.client_id as string, comando: 'portero.proponer_busquedas' }) : undefined,
    }
    // `fase: 'articulos'` = la segunda tanda (qué páginas de la búsqueda de hoy vale leer); sin fase, el plan del día
    const r = b.fase === 'articulos' ? await rutaArticulos(deps, cuerpo) : b.fase === 'tanda2' ? await rutaTanda2(deps, cuerpo) : b.fase === 'clientes' ? await rutaClientes(deps, cuerpo) : await rutaDescubrir(deps, cuerpo)
    // el plan de Apify (28-oct): si el mes ya está en el tope (~90 % del crédito) no se pide nada a Apify y se avisa UNA vez por ciclo; las fases «clientes» no piden nada
    if (b.fase === 'clientes' || !(r.status === 200)) return NextResponse.json(r.body, { status: r.status })
    const frena = eldineroFrena(deps.modo)
    const plan = await revisarPlanApify({ dry_run: b.dry_run !== false, frena, avisar: avisarAAlertas({ db: getSupabaseAdmin() as unknown as Db }) })
    const salida = plan.leido ? (frena ? frenarCuerpoPorPlan(r.body, plan.decision) : { ...r.body, plan_apify: { ...plan.decision, frena: false } }) : { ...r.body, plan_apify: { leido: false, detalle: plan.detalle } }
    return NextResponse.json(salida, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'portero_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
