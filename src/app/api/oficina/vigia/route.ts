/**
 * POST /api/oficina/vigia · el reloj de la oficina (cada 10 min, lo llama n8n): vence la bandeja de la oficina y da por muertos los pasos sin vuelta. SALA 1 · PR 4 · NADIE la llama todavía.
 * Solo toca filas DE LA OFICINA. Cuerpo opcional { dry_run?: boolean } (true = solo cuenta, no escribe). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503).
 * Con la oficina APAGADA no hace nada (devuelve `apagada`): el vigía es parte de lo que se enciende al final.
 */
import { NextResponse } from 'next/server'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'
import { revisarPasosMuertos, vencerBandeja } from '@/lib/oficina/vigia'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  const cuerpo: unknown = await request.json().catch(() => ({}))
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  if (cuerpo.dry_run !== undefined && typeof cuerpo.dry_run !== 'boolean') return NextResponse.json({ error: 'entrada_invalida', errores: ['`dry_run` debe ser verdadero o falso'] }, { status: 400 })
  try {
    const { P, db } = puertosReales(request)
    const config = await P.almacen.leerConfig()
    if (config.estado === 'apagada') return NextResponse.json({ accion: 'apagada', detalle: 'la oficina está apagada: el vigía no hace nada' }, { status: 200 })
    if (cuerpo.dry_run === true) return NextResponse.json({ accion: 'dry_run', detalle: 'no se escribió nada' }, { status: 200 })
    const ahora = P.ahora()
    const v = await vencerBandeja(db, ahora)
    const m = await revisarPasosMuertos(P, db, ahora)
    return NextResponse.json({ accion: 'vigilado', vencidas: v.vencidas, reanudar: m.reanudar, fallidos: m.fallidos }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
