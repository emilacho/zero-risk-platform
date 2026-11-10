/**
 * POST /api/jefatura/cadena-vuelta · la VUELTA de una revisión de REGISTRO de la jefatura a la cadena (tramo 2 · 10-nov · nace APAGADO: nadie abre revisiones de registro mientras la
 * jefatura no retenga `registro`). La cadena abre la revisión con `devolver_a = { tipo: 'webhook', destino: <esta ruta> }`; cuando cierra, el flujo `jefatura · turno` entrega aquí
 * `{ marcas, salida }` (J4 solo entrega a `/api/jefatura/` de nuestro Vercel o a `/webhook/` de n8n). La ruta cierra el brief o la gran idea con el texto que pasa TODOS los chequeos.
 * IDEMPOTENTE: una entrega repetida no duplica nada. Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503; la llave interna no vale), como `oficina-vuelta`.
 */
import { NextResponse } from 'next/server'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'
import { recibirVueltaDeRegistro } from '@/lib/cadena/mesas'
import { checkLlaveDeLaSala, esObjeto } from '@/lib/oficina/ruta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = checkLlaveDeLaSala(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error, detalle: auth.detalle }, { status: auth.status })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  if (!esObjeto(cuerpo)) return NextResponse.json({ error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }, { status: 400 })
  try {
    const r = await recibirVueltaDeRegistro(almacenDeSupabase(), cuerpo, new Date().toISOString())
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'cadena_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
