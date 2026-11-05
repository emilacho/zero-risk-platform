/** EL ESTUDIO · `GET /api/estudio/catalogo` · modelos, formatos y precios de lista para la pantalla, y qué proveedores están listos (sin las llaves). */
import { NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { FORMATOS_DE_IMAGEN, MODELOS_3D, MODELOS_DE_VIDEO, RELACIONES_DE_VIDEO, RESOLUCIONES_DE_VIDEO, SEGUNDOS_DE_VIDEO, costoDeImagen } from '@/lib/estudio/catalogo'
import { depsReales, proveedoresListos } from '@/lib/estudio/deps'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = checkInternalKey(request)
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  const d = depsReales()
  return NextResponse.json({
    ok: true,
    listos: proveedoresListos(d),
    imagen: { modelo: d.modeloDeImagen, formatos: FORMATOS_DE_IMAGEN, precio: Object.fromEntries(FORMATOS_DE_IMAGEN.map((f) => [f, { sin_foto: costoDeImagen(f, false), con_foto: costoDeImagen(f, true) }])) },
    video: { modelos: MODELOS_DE_VIDEO, formatos: RELACIONES_DE_VIDEO, resoluciones: RESOLUCIONES_DE_VIDEO, segundos: SEGUNDOS_DE_VIDEO, precio: 'se cotiza con el proveedor antes de crear' },
    '3d': { modelos: MODELOS_3D.map((m) => ({ id: m.id, nombre: m.nombre, nota: m.nota, precio: m.precio })), imagen_previa_usd: costoDeImagen('1:1', false) },
  })
}
