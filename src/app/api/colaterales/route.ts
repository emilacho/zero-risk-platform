/**
 * POST /api/colaterales · colaterales tramo 2d (nace APAGADO: solo lo llama el flujo «Colaterales · una edición», inactivo).
 * Llave interna + firma del flujo (sin `workflow_id` y `workflow_execution_id`: 403). Toda la lógica en `lib/colaterales/puerta.ts`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { atenderColaterales } from '@/lib/colaterales/puerta'
import { puertosDeSupabase } from '@/lib/colaterales/puertos-supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return NextResponse.json({ error: 'invalid_body', detail: 'el cuerpo debe ser un objeto JSON' }, { status: 400 })
  try {
    const r = await atenderColaterales(puertosDeSupabase(), cuerpo as Record<string, unknown>, new Date())
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'colaterales_fallo', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
