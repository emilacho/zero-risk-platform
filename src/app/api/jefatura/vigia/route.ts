/**
 * POST /api/jefatura/vigia · el reloj de la jefatura (lo llama n8n cada pocos minutos): da por muertos los pasos sin vuelta (> 12 min) y los reintenta UNA vez; si vuelve a morir, la revisión cierra `fallida` + aviso.
 * J3 · NADIE la llama todavía. Solo toca filas DE LA JEFATURA. Cuerpo opcional { dry_run?: boolean } (true = no escribe nada). Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503).
 * Con la jefatura APAGADA no hace nada (devuelve `apagada`): el vigía es parte de lo que se enciende al final.
 */
import { NextResponse } from 'next/server'
import { vigiar } from '@/lib/jefatura/revision/orquestador'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/jefatura/revision/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  const cuerpo: unknown = await request.json().catch(() => ({}))
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  if (cuerpo.dry_run !== undefined && typeof cuerpo.dry_run !== 'boolean') return NextResponse.json({ error: 'entrada_invalida', errores: ['`dry_run` debe ser verdadero o falso'] }, { status: 400 })
  try {
    const { P } = puertosReales()
    const config = await P.almacen.leerConfig()
    if (config.estado === 'apagada') return NextResponse.json({ accion: 'apagada', detalle: 'la jefatura está apagada: el vigía no hace nada' }, { status: 200 })
    if (cuerpo.dry_run === true) return NextResponse.json({ accion: 'dry_run', detalle: 'no se escribió nada' }, { status: 200 })
    const v = await vigiar(P, P.ahora())
    return NextResponse.json({ accion: 'vigilado', reanudar: v.reanudar, fallidos: v.fallidos, cierres: v.cierres }, { status: 200 })
  } catch (e) {
    return NextResponse.json({ error: 'jefatura_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
