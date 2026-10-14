/**
 * POST /api/jefatura/oficina-vuelta · la VUELTA de una revisión de la jefatura al encargo de la oficina que la pidió (J8a · NADIE la llama todavía; la oficina y la jefatura nacen apagadas).
 * La oficina abre la revisión con `devolver_a = { tipo: 'webhook', destino: <esta ruta> }`; cuando la revisión cierra, el flujo `jefatura · turno` entrega aquí `{ marcas, salida }` (J4 solo entrega
 * a `/api/jefatura/` de nuestro Vercel o a `/webhook/` de n8n). La ruta aplica la salida al encargo (`salida.artifact_id` = el encargo) y lo hace seguir: chequeos duros, entrega y bandeja.
 * IDEMPOTENTE: una entrega repetida no duplica nada. Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503; la llave interna no vale), la misma de las rutas de la oficina y de la jefatura.
 */
import { NextResponse } from 'next/server'
import { recibirJefatura } from '@/lib/oficina/orquestador'
import { despertarAlFlujoDeLaOficina } from '@/lib/oficina/despertar'
import { checkLlaveDeLaSala, esObjeto, puertosReales } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// aplicar la salida sigue el encargo hasta su cierre (chequeos, entrega, archivos)
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  const salida = cuerpo.salida
  const errores: string[] = []
  if (!esObjeto(salida)) errores.push('`salida` debe ser la salida de la revisión')
  else {
    if (typeof salida.artifact_id !== 'string' || !UUID.test(salida.artifact_id)) errores.push('`salida.artifact_id` debe ser el uuid del encargo')
    if (salida.artifact_type !== 'pieza') errores.push('`salida.artifact_type` debe ser «pieza»: esta ruta solo vuelve a la oficina')
    if (typeof salida.resultado !== 'string') errores.push('`salida.resultado` es obligatorio')
  }
  if (errores.length) return NextResponse.json({ error: 'entrada_invalida', errores }, { status: 400 })
  try {
    const { P } = puertosReales(request)
    const s = salida as unknown as Parameters<typeof recibirJefatura>[2]
    const r = await recibirJefatura(P, String(s.artifact_id), s)
    // R3 · si lo que sigue es un paso de EMPLEADO (la re-imagen), la ruta despierta al flujo `oficina · turno` con la llave de SU entorno (nadie más lo despertaría)
    if (r.status === 200 && r.cuerpo.accion === 'esperar' && esObjeto(r.cuerpo.turno)) {
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: process.env.SALA_DISPATCH_KEY, n8nWebhookBase: process.env.N8N_WEBHOOK_BASE }, String(s.artifact_id), r.cuerpo.turno)
      return NextResponse.json({ ...r.cuerpo, despertado: d.despertado, ...(d.despertado ? {} : { motivo_sin_despertar: d.motivo }) }, { status: r.status })
    }
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'oficina_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
