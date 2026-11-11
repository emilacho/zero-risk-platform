/** Las dependencias reales del estudio (las rutas las arman aquí; las pruebas pasan las suyas). Las llaves se leen del entorno y no salen de este archivo. */
import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/validation'
import { VARIABLE_DE_LA_LLAVE as LLAVE_HIGGSFIELD } from '@/lib/video/higgsfield'
import { MODELO_DE_IMAGEN_DE_RESERVA } from './catalogo'
import { VARIABLE_DE_LA_LLAVE_FAL } from './fal'
import type { Deps } from './servicio'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'

export function depsReales(): Deps {
  return {
    db: getSupabaseAdmin() as unknown as Deps['db'],
    fetch,
    llaves: { openai: process.env.OPENAI_API_KEY || '', higgsfield: process.env[LLAVE_HIGGSFIELD] || '', fal: process.env[VARIABLE_DE_LA_LLAVE_FAL] || '' },
    bucket: sanitizeString(process.env.OFICINA_BUCKET, 100) || null,
    // el mismo modelo que usa la plataforma para imágenes; `gpt-image-1` se retiró el 23-oct y no se usa
    modeloDeImagen: ((m) => (m && m !== 'gpt-image-1' ? m : MODELO_DE_IMAGEN_DE_RESERVA))(sanitizeString(process.env.IMAGE_MODEL, 50)),
    ahora: () => Date.now(),
    // 11-nov · regla #18: tope y descuento del proveedor de video (`cadena_config.brazo_de_video`), leídos por el almacén de la cadena
    leerConfig: (clave) => almacenDeSupabase().leerConfig(clave),
  }
}

/** qué proveedores están listos (sin decir nada de las llaves) */
export function proveedoresListos(d: Deps) {
  return { varias: !!d.llaves.fal, imagen: !!d.llaves.openai, video: !!d.llaves.higgsfield, '3d': !!d.llaves.fal && !!d.llaves.openai, animar: !!d.llaves.fal, almacen: !!d.bucket }
}
