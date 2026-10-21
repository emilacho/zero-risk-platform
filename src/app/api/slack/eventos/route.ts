/**
 * POST /api/slack/eventos · Slack avisa de cada mensaje; solo se atiende el que Emilio escribe DENTRO del hilo de una pieza (su comentario).
 * Firma de Slack OBLIGATORIA. El reto de verificación (`url_verification`) se contesta tras verificar la firma. Apagada por omisión.
 */
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { interpretarEvento } from '@/lib/notas-del-dueno/interpretar'
import { procesar } from '@/lib/notas-del-dueno/recibir'
import { configuracionReal, encendido, firmaDeLaPeticion, puertosReales, reintentarLosPendientes } from '@/lib/notas-del-dueno/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const cuerpo = await request.text()
  const firma = firmaDeLaPeticion(request, cuerpo)
  if (!firma.ok) return NextResponse.json({ error: 'firma_invalida', motivo: firma.motivo }, { status: 401 })
  let json: unknown = null
  try { json = JSON.parse(cuerpo) } catch { return NextResponse.json({ error: 'cuerpo_ilegible' }, { status: 400 }) }
  const intencion = interpretarEvento(json)
  if (intencion.tipo === 'reto') return NextResponse.json({ challenge: intencion.challenge })
  if (!encendido()) return NextResponse.json({ error: 'apagado' }, { status: 503 })
  const P = puertosReales(request)
  const cfg = configuracionReal()
  waitUntil((async () => { try { await procesar(P, cfg, intencion) } catch { /* el comentario se vuelve a escribir: la nota es idempotente */ } await reintentarLosPendientes(request) })())
  return new NextResponse(null, { status: 200 })
}
