/**
 * POST /api/manual/hechos · el chequeo de hechos por código (R3–R5, R7) del manual de un cliente. Solo lectura, US$ 0, sin modelo.
 * Cuerpo: { client_id, manual?: objeto (por omisión, la versión vigente del cliente) }. Llave interna. Lo llama el alta tras promover el manual.
 * No escribe nada: devuelve el informe (cuántas afirmaciones, cuáles sin respaldo y por qué). Lo que solo se apoya en una síntesis de agente no cuenta como respaldo.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { chequeoDelManual, propiosDeFicha } from '@/lib/manual/cliente'
import { cargarFichaYRaspado, sintesisDelCliente, ultimoManual } from '@/lib/manual/almacen-supabase'

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
  if (c.manual !== undefined && (typeof c.manual !== 'object' || c.manual === null || Array.isArray(c.manual))) return NextResponse.json({ error: 'invalid_manual', detail: '`manual` debe ser un objeto' }, { status: 400 })
  try {
    const { ficha, filas } = await cargarFichaYRaspado(c.client_id)
    if (!ficha) return NextResponse.json({ error: 'cliente_desconocido', detail: 'no hay ficha con ese client_id' }, { status: 404 })
    let manual = c.manual as Record<string, unknown> | undefined
    let version: number | null = null
    if (!manual) {
      const u = await ultimoManual(c.client_id)
      if (!u) return NextResponse.json({ error: 'sin_manual', detail: 'el cliente no tiene manual todavía' }, { status: 404 })
      manual = u.manual
      version = u.version
    }
    const sintesis = await sintesisDelCliente(c.client_id)
    return NextResponse.json({ ok: true, client_id: c.client_id, manual_version: version, ...chequeoDelManual({ manual, filas, propios: propiosDeFicha(ficha), sintesis }) }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'hechos_fallo', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
