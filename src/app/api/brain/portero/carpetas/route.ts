/**
 * GET /api/brain/portero/carpetas · encargo 7 (21-nov) · el vault por carpetas, en UNA lectura (US$ 0, sin modelo):
 *  · sin `capa` ni `raw`: el árbol capa → red → tipo con conteo, nuevas (7 días) y portada por carpeta, más RAW y vistas;
 *  · con `capa` (y opcionales `red`, `tipo`) o con `raw`: las piezas de esa carpeta, paginadas (`pagina`, `por_pagina`).
 * `client_id=` para un cliente, `bodega=1` para la bodega viral del mundo. El dashboard solo pinta. Llave interna (`x-api-key`).
 */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { consultaDelEntorno } from '@/lib/cerebro/portero/entorno'
import { leerCarpetas } from '@/lib/cerebro/portero/carpetas'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', code: 'E-AUTH-001', detail: auth.reason }, { status: 401 })
  const u = new URL(request.url).searchParams
  const r = await leerCarpetas(consultaDelEntorno(), {
    cliente: u.get('client_id') ?? '',
    bodega: u.get('bodega') === '1' || u.get('bodega') === 'true',
    capa: u.get('capa') || null,
    red: u.get('red') || null,
    tipo: u.get('tipo') || null,
    raw: u.get('raw') || null,
    pagina: u.get('pagina') ? Number(u.get('pagina')) : undefined,
    por_pagina: u.get('por_pagina') ? Number(u.get('por_pagina')) : undefined,
  })
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'entrada_invalida' ? 400 : 502 })
}
