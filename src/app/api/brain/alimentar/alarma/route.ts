/**
 * POST /api/brain/alimentar/alarma · la puerta ÚNICA para que un flujo de n8n avise en Slack sin ruido (21-oct · firma de Emilio): solo `#alertas`, UN mensaje por incidente,
 * repeticiones como respuesta en el hilo de ese mensaje y cierre con otra respuesta en el hilo. Llave interna (`x-api-key`). US$ 0, sin modelo.
 * Cuerpo: { dry_run, clave (un incidente = una clave), texto, resolver?: true, nota? }. Con `resolver: true` cierra el incidente en su hilo (no publica mensaje nuevo en el canal).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { avisarPorIncidente, resolverIncidente } from '@/lib/portero-alimenta/alertas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  if (typeof b.dry_run !== 'boolean') return NextResponse.json({ error: 'dry_run_obligatorio', detalle: '`dry_run` es obligatorio y debe ser true o false' }, { status: 400 })
  const clave = typeof b.clave === 'string' ? b.clave.trim().slice(0, 160) : ''
  const texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 1500) : ''
  if (!clave) return NextResponse.json({ error: 'entrada_invalida', detalle: '`clave` es obligatoria: un incidente = una clave' }, { status: 400 })
  if (b.resolver !== true && !texto) return NextResponse.json({ error: 'entrada_invalida', detalle: '`texto` es obligatorio' }, { status: 400 })
  if (b.dry_run) return NextResponse.json({ ok: true, dry_run: true, enviado: false, clave, accion: b.resolver === true ? 'resolver' : 'avisar' })
  try {
    const db = getSupabaseAdmin() as unknown as Db
    const r = b.resolver === true ? await resolverIncidente({ db })(clave, typeof b.nota === 'string' ? b.nota.slice(0, 300) : '') : await avisarPorIncidente({ db })(texto, clave)
    return NextResponse.json({ ok: r.ok, clave, accion: r.accion, detalle: r.detalle }, { status: r.ok ? 200 : 502 })
  } catch (e) {
    return NextResponse.json({ error: 'alarma_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
