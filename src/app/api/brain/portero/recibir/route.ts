/**
 * POST /api/brain/portero/recibir · el portero ARCHIVA material nuevo de un cliente (paso 7 del cerebro).
 * Exige `workflow_id` y `workflow_execution_id`, filtra por segmento, hereda lo que no cambió, llama al modelo (Sonnet 5.5, una llamada por trozo, sin reintentos,
 * 25 s, con topes) solo para lo nuevo, copia el texto original y escribe TODO o nada por ingreso. Registra cada llamada por `log-invocation`.
 * Ruta NUEVA del portero del cerebro. Auth igual a las rutas internas: `x-api-key: INTERNAL_API_KEY`. Con `prueba: true` todo va a «prueba-portero» y lleva la marca de prueba.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { llamarAlModelo, llamarAlModeloConImagen } from '@/lib/cerebro/portero/modelo'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { crearRegistrador } from '@/lib/cerebro/portero/registro'
import { crearAlmacen } from '@/lib/cerebro/portero/recibir/escritura'
import { recibir } from '@/lib/cerebro/portero/recibir/recibir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
/** hasta 8 llamadas al modelo de 25 s cada una, una tras otra */
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 }) }
  const r = await recibir(
    {
      consulta: consultaDelEntorno(),
      almacen: crearAlmacen({ urlDeLaBase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '', llave: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
      llamarModelo: llamarAlModelo,
      llamarModeloConImagen: llamarAlModeloConImagen,
      registrar: crearRegistrador({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '' }),
    },
    cuerpo,
  )
  return NextResponse.json(r.cuerpo, { status: r.status })
}
