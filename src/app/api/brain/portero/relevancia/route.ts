/**
 * POST /api/brain/portero/relevancia · el JUICIO DE RELEVANCIA de lo ajeno pedido a mano (encargo 4): la prueba de 40 piezas juzgadas a mano y la primera pasada por cliente.
 * La corrida diaria NO pasa por aquí: va al cierre del vigilante (`/api/brain/alimentar/vigilar`).
 * Cuerpo: `client_id` (o `clientes`), `dry_run` (por omisión true: solo cuenta), `workflow_id` + `workflow_execution_id` (obligatorios para llamar al modelo),
 * `tandas` (por omisión 2, máx. 50), `ids` (solo esas piezas) y `escribir` (false = devuelve los juicios sin escribirlos).
 * Llama al modelo SOLO con `PORTERO_RELEVANCIA=on` (apagado por omisión), dry_run:false y el proceso operativo. La corrida DIARIA pide además `PORTERO_RELEVANCIA_DIARIA=on`. Llave interna.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { juzgarRelevancia } from '@/lib/portero-alimenta/relevancia'
import { depsDeRelevanciaDelEntorno } from '@/lib/portero-alimenta/relevancia-entorno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const textos = (x: unknown): string[] => (Array.isArray(x) ? x : [x]).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let c: Record<string, unknown>
  try { c = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const clientes = [...textos(c.client_id), ...textos(c.clientes)]
  if (!clientes.length) return NextResponse.json({ error: 'falta_client_id' }, { status: 400 })
  try {
    const deps = depsDeRelevanciaDelEntorno({ db: getSupabaseAdmin() as unknown as Db, origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '' })
    const r = await juzgarRelevancia(deps, {
      clientes,
      dry_run: c.dry_run === false ? false : true,
      workflow_id: typeof c.workflow_id === 'string' ? c.workflow_id : undefined,
      workflow_execution_id: typeof c.workflow_execution_id === 'string' ? c.workflow_execution_id : undefined,
      tandas_por_cliente: typeof c.tandas === 'number' ? c.tandas : undefined,
      ids: c.ids === undefined ? undefined : textos(c.ids),
      escribir: c.escribir === false ? false : true,
      plazoMs: 270_000,
    })
    return NextResponse.json({ ok: r.estado === 'ok', ...r }, { status: r.estado === 'error' ? 500 : 200 })
  } catch (e) {
    return NextResponse.json({ error: 'relevancia_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
