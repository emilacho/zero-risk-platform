/**
 * POST /api/jefatura/colaterales-vuelta · la VUELTA de una revisión `colateral` de la jefatura a colaterales (2d pieza B · 11-nov · nace APAGADO: la fila `colateral` está inactiva
 * y el flujo de colaterales también). Colaterales abre la revisión con `devolver_a = { tipo: 'webhook', destino: <esta ruta> }`; cuando cierra, el flujo `jefatura · turno` entrega aquí
 * `{ marcas, salida }` (J4 solo entrega a `/api/jefatura/` de nuestro Vercel o a `/webhook/` de n8n). Solo una edición `en_curso` recibe algo (un veredicto tardío no aplica nada).
 * IDEMPOTENTE: solo se tocan retoques que siguen `propuesto` y atados a esa revisión. Llave: `x-sala-dispatch-key` (sin `SALA_DISPATCH_KEY`, 503; la llave interna no vale), como `cadena-vuelta`.
 */
import { NextResponse } from 'next/server'
import { puertosDeSupabase } from '@/lib/colaterales/puertos-supabase'
import { recibirVueltaColateral } from '@/lib/colaterales/vuelta'
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
    const r = await recibirVueltaColateral(puertosDeSupabase(), cuerpo)
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ error: 'colaterales_error', detalle: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
