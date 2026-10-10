/**
 * POST /api/manual/materia · la materia del cliente ORDENADA por código y recortada POR BLOQUE con aviso (R2) + su frase propia literal (R1).
 * Solo lectura, US$ 0, sin modelo. Cuerpo: { client_id, topes? }. Llave interna. Lo llama el alta (n8n) en lugar de `.slice(0, 3500)`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { materiaDelCliente, propiosDeFicha } from '@/lib/manual/cliente'
import { cargarFichaYRaspado } from '@/lib/manual/almacen-supabase'
import { TOPES_POR_BLOQUE, type NombreDeBloque } from '@/lib/manual/materia'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const cuerpo: unknown = await request.json().catch(() => null)
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return NextResponse.json({ error: 'invalid_body', detail: 'el cuerpo debe ser un objeto JSON' }, { status: 400 })
  const c = cuerpo as Record<string, unknown>
  if (typeof c.client_id !== 'string' || !UUID.test(c.client_id)) return NextResponse.json({ error: 'invalid_client_id', detail: 'client_id debe ser un uuid' }, { status: 400 })
  const topes: Partial<Record<NombreDeBloque, number>> = {}
  if (c.topes && typeof c.topes === 'object' && !Array.isArray(c.topes)) {
    for (const [k, v] of Object.entries(c.topes as Record<string, unknown>)) if (k in TOPES_POR_BLOQUE && typeof v === 'number' && v > 0 && v <= 60000) topes[k as NombreDeBloque] = v
  }
  try {
    const { ficha, filas } = await cargarFichaYRaspado(c.client_id)
    if (!ficha) return NextResponse.json({ error: 'cliente_desconocido', detail: 'no hay ficha con ese client_id' }, { status: 404 })
    return NextResponse.json({ ok: true, client_id: c.client_id, filas_leidas: filas.length, ...materiaDelCliente(filas, propiosDeFicha(ficha), topes) }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'materia_fallo', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
