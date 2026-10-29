/**
 * GET/POST /api/brain/portero/etiquetar-pendientes · el ETIQUETADO AUTOMÁTICO de fotos (27-oct · encargo recuperacion-y-vigia-independiente, punto 5).
 * Toda foto `ok` sin etiqueta (propias primero) se etiqueta sola, de CUALQUIER cliente activo, sin corrida a mano: lo llama un cron de Vercel después de la corrida del portero
 * (el copiado de fotos ocurre dentro de ella) y también se puede pedir para un cliente. Tope por cliente y día según el modo (29-oct: construcción SIN tope, campaña 10; ≈ US$ 0,008 por foto) y plazo total;
 * una foto que falla no frena a las demás. Cada llamada la registra el etiquetador del paso 4 (`log-invocation`), con el flujo del portero como `workflow_id`.
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron) o la llave interna. GET (cron) actúa de verdad; POST acepta `client_id`, `tope_por_cliente` y `dry_run` (por omisión true: solo cuenta).
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { clientesActivos } from '@/lib/portero-alimenta/clientes'
import { FLUJO_DEL_PORTERO } from '@/lib/portero-alimenta/gasto'
import { etiquetarPendientesDelEntorno } from '@/lib/cerebro/portero/etiquetar-entorno'
import { corridaQueSeRevisa, modoDelEntorno, topeDeEtiquetasPorClienteYDia } from '@/lib/portero-alimenta/modo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function autorizado(request: Request): boolean {
  const esperado = process.env.CRON_SECRET
  const dado = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (esperado && dado) {
    const a = Buffer.from(dado), b = Buffer.from(esperado)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
  }
  return checkInternalKey(request).ok
}

async function correr(request: Request, o: { dry_run: boolean; client_id?: string; tope_por_cliente?: number }) {
  if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  try {
    let clientes: string[]
    if (o.client_id) clientes = [o.client_id]
    else {
      const act = await clientesActivos(getSupabaseAdmin() as unknown as Db)
      if (!act.ok) return NextResponse.json({ error: 'clientes_no_leidos', detalle: act.detalle.slice(0, 200) }, { status: 502 })
      clientes = act.datos.clientes.map((c) => c.client_id)
    }
    const dia = new Date().toISOString().slice(0, 10)
    const r = await etiquetarPendientesDelEntorno(
      { origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '', workflowId: process.env.PORTERO_WORKFLOW_ID || FLUJO_DEL_PORTERO, ejecucionId: `vercel-cron:etiquetar-pendientes:${dia}T${new Date().toISOString().slice(11, 16)}` },
      { clientes, dry_run: o.dry_run, tope_por_cliente: o.tope_por_cliente ?? topeDeEtiquetasPorClienteYDia(modoDelEntorno().modo) },
    )
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: 'etiquetar_pendientes_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/** el etiquetado se adapta a las corridas del modo (28-oct): corre 2 h después de cada una (14:30, 20:30 y 02:30 UTC en construcción; solo 14:30 en campaña); a otra hora el cron calla */
export async function GET(request: Request) {
  const modo = modoDelEntorno().modo
  if (!corridaQueSeRevisa(modo, new Date(), 90, 300)) {
    if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
    return NextResponse.json({ ok: true, nada_que_hacer: true, modo, detalle: 'a esta hora no sigue a ninguna corrida del modo vigente' })
  }
  return correr(request, { dry_run: false })
}
export async function POST(request: Request) {
  let c: { dry_run?: unknown; client_id?: unknown; tope_por_cliente?: unknown } = {}
  try { c = await request.json() } catch { /* sin cuerpo = ensayo de todos */ }
  return correr(request, {
    dry_run: c.dry_run === false ? false : true,
    client_id: typeof c.client_id === 'string' && c.client_id.trim() ? c.client_id.trim() : undefined,
    tope_por_cliente: typeof c.tope_por_cliente === 'number' ? c.tope_por_cliente : undefined,
  })
}
