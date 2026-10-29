/**
 * POST/GET /api/brain/alimentar/aprendizaje · desmenuza los comentarios crudos del dueño y consolida el aprendizaje (29-oct · firma de Emilio, RAG reutilizando el del cerebro).
 *  · POST (llave interna): `{ dry_run (por omisión true: solo cuenta), client_id?, solo?: 'desmenuzar'|'consolidar' }`. Con `dry_run:false` llama al modelo (centavos por nota) y escribe.
 *  · GET (cron de Vercel o llave interna): corre tras cada corrida del modo (en construcción 3 veces al día; en campaña una); a otra hora calla.
 * Detalle en `src/lib/portero-alimenta/aprendizaje/`. Jefatura y GPT no usan este módulo.
 */
import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { FLUJO_DEL_PORTERO } from '@/lib/portero-alimenta/gasto'
import { corridaQueSeRevisa, modoDelEntorno } from '@/lib/portero-alimenta/modo'
import { procesarAprendizajeDelEntorno } from '@/lib/portero-alimenta/aprendizaje/entorno'

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

async function correr(request: Request, pedido: { dry_run: boolean; client_id?: string; solo?: 'desmenuzar' | 'consolidar' }) {
  try {
    const ahora = new Date()
    const r = await procesarAprendizajeDelEntorno(
      { origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '', workflowId: process.env.PORTERO_WORKFLOW_ID || FLUJO_DEL_PORTERO, ejecucionId: `vercel-cron:aprendizaje:${ahora.toISOString().slice(0, 16)}` },
      pedido,
    )
    return NextResponse.json({ ok: r.errores.length === 0, ...r })
  } catch (e) {
    return NextResponse.json({ error: 'aprendizaje_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function GET(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  const modo = modoDelEntorno().modo
  // corre 2 h después de cada corrida del modo (14:45, 20:45 y 02:45 UTC en construcción; solo 14:45 en campaña); a otra hora calla
  if (!corridaQueSeRevisa(modo, new Date(), 90, 200)) return NextResponse.json({ ok: true, nada_que_hacer: true, modo, detalle: 'a esta hora no sigue a ninguna corrida del modo vigente' })
  return correr(request, { dry_run: false })
}
export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001' }, { status: 401 })
  let c: { dry_run?: unknown; client_id?: unknown; solo?: unknown } = {}
  try { c = await request.json() } catch { /* sin cuerpo = ensayo */ }
  return correr(request, {
    dry_run: c.dry_run === false ? false : true,
    client_id: typeof c.client_id === 'string' && c.client_id.trim() ? c.client_id.trim() : undefined,
    solo: c.solo === 'desmenuzar' || c.solo === 'consolidar' ? c.solo : undefined,
  })
}
