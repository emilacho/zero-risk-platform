/**
 * POST /api/brain/portero/etiquetar · «qué MUESTRA esta foto» (paso 4 del cerebro). UNA llamada al modelo por foto (Sonnet 5.5, razonamiento al mínimo, 25 s,
 * sin reintentos), con la foto bajada SOLO de nuestro almacén. Escribe SOLO 6 columnas de `client_social_images` (`que_muestra`, `producto_visto`, `etiquetada_en`,
 * `etiqueta_modelo`, `texto_visible`, `etiqueta_confianza`); jamás toca `producto`. Exige `workflow_id` y `workflow_execution_id` y registra cada llamada por `log-invocation`.
 * 🔴 NO se publica ni se corre sin la firma de Emilio (la corrida real ≈ US$ 0,15, tope US$ 0,40). Auth igual a las rutas internas: `x-api-key: INTERNAL_API_KEY`.
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { crearBajador } from '@/lib/cerebro/portero/almacen'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { crearEscritor } from '@/lib/cerebro/portero/etiqueta-escritura'
import { etiquetar } from '@/lib/cerebro/portero/etiquetar'
import { llamarAlModeloConImagen } from '@/lib/cerebro/portero/modelo'
import { crearRegistrador } from '@/lib/cerebro/portero/registro'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  let cuerpo: unknown
  try { cuerpo = await request.json() } catch { return NextResponse.json({ error: 'invalid_json', code: 'E-INPUT-PARSE' }, { status: 400 }) }
  const urlDeLaBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const r = await etiquetar(
    {
      consulta: consultaDelEntorno(),
      urlDeLaBase,
      llamarModelo: llamarAlModeloConImagen,
      bajarFoto: crearBajador({ urlDeLaBase }),
      escribir: crearEscritor({ urlDeLaBase, llave: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
      registrar: crearRegistrador({ origen: new URL(request.url).origin, llaveInterna: process.env.INTERNAL_API_KEY ?? '' }),
    },
    cuerpo,
  )
  return NextResponse.json(r.cuerpo, { status: r.status })
}
