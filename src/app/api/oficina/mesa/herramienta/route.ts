/**
 * POST /api/oficina/mesa/herramienta · las tres herramientas del tablero de la mesa (`mesa_pedir` · `mesa_devolver` · `pedir_material`) llamadas por el conector del corredor de agentes.
 * NACE APAGADA como todo lo de la mesa: solo hay tablero si existe un encargo de familia `*_mesa` con un turno abierto, y esas familias se siembran inactivas.
 * Se abre con la llave INTERNA (`x-api-key`), la que ya usa el corredor; la llave de despacho de la sala NO abre esta ruta, y si ambas fueran iguales la ruta se cierra (503), igual que `material-vuelta`.
 * Quien llama debe ser el agente del turno abierto; un pedido fuera de turno, de otro encargo o de una familia que no es de la mesa se rechaza sin tocar nada.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { registrarHerramienta } from '@/lib/oficina/mesa/herramienta'
import { esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const sala = (process.env.SALA_DISPATCH_KEY ?? '').trim()
  if (sala && sala === (process.env.INTERNAL_API_KEY ?? '').trim()) return NextResponse.json({ ok: false, error: 'llaves_iguales', detalle: 'la llave interna y la de despacho no pueden ser la misma: esta ruta queda cerrada' }, { status: 503 })
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: 'unauthorized', detalle: auth.reason }, { status: auth.reason.includes('not configured') ? 503 : 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ ok: false, error: 'entrada_invalida', detalle: 'el cuerpo debe ser un objeto' }, { status: 400 })
  try {
    const { P } = puertosReales(request)
    const r = await registrarHerramienta(P, cuerpo)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
