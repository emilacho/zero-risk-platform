/** EL ESTUDIO · `POST /api/estudio/mover-a-papelera` `{ client_id, id }` · la ✕ de la galería · la pieza pasa a la papelera por 30 días (nunca se borra en el acto). No gasta. */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { depsReales } from '@/lib/estudio/deps'
import { moverAPapelera } from '@/lib/estudio/servicio'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  try {
    const r = await moverAPapelera(depsReales(), String(body.client_id ?? ''), String(body.id ?? ''))
    if (!r.ok) return NextResponse.json({ error: r.error, detalle: r.detalle }, { status: r.status })
    return NextResponse.json({ ok: true, pieza: r.valor })
  } catch (e) {
    return NextResponse.json({ error: 'cambio_fallido', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
