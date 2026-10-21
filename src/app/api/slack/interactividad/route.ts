/**
 * POST /api/slack/interactividad · los botones [Aprobar]/[Rechazar] de la pieza en el Slack de Emilio y el formulario del motivo del rechazo.
 * Firma de Slack OBLIGATORIA (sin ella, 401). Apagada por omisión (`NOTAS_DEL_DUENO=1` la enciende). Slack exige respuesta en 3 s: se responde enseguida y el trabajo sigue en `waitUntil`.
 */
import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { interpretarInteractividad, payloadDeInteractividad } from '@/lib/notas-del-dueno/interpretar'
import { procesar } from '@/lib/notas-del-dueno/recibir'
import { configuracionReal, encendido, firmaDeLaPeticion, puertosReales } from '@/lib/notas-del-dueno/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const cuerpo = await request.text()
  const firma = firmaDeLaPeticion(request, cuerpo)
  if (!firma.ok) return NextResponse.json({ error: 'firma_invalida', motivo: firma.motivo }, { status: 401 })
  if (!encendido()) return NextResponse.json({ error: 'apagado' }, { status: 503 })
  const intencion = interpretarInteractividad(payloadDeInteractividad(cuerpo))
  const P = puertosReales(request)
  const cfg = configuracionReal()
  const trabajo = (async () => {
    try {
      const r = await procesar(P, cfg, intencion)
      const donde = 'canal' in intencion && 'ts' in intencion && intencion.canal && intencion.ts ? { canal: intencion.canal, ts: intencion.ts } : null
      if (r.aviso && donde) await P.responderEnHilo(donde.canal, donde.ts, r.aviso)
    } catch { /* el reintento de Slack o un nuevo clic lo repite: todo es idempotente */ }
  })()
  waitUntil(trabajo)
  return new NextResponse(null, { status: 200 })
}
