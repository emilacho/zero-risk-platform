/**
 * ESCRIBIR LA ETIQUETA DE UNA FOTO · el ÚNICO lugar del cerebro que escribe en `client_social_images`, y solo estas columnas: las 6 de la etiqueta y, desde el relevo 19,
 * las 3 de la «toma» (`con_personas`, `tipo_de_toma`, `formato`). Se aceptan EXACTAMENTE tres combinaciones: las 6 solas (etiqueta vieja), las 9 (etiqueta completa) o
 * las 3 solas (poner la toma a una foto ya etiquetada).
 *
 * UN `PATCH` (actualizar) de UNA foto, filtrado por el id de la foto Y por el cliente (nunca uno sin el otro). Jamás inserta ni borra filas, jamás toca
 * `producto`, `url`, `caption` ni ninguna otra columna: pedirle otra se rechaza SIN hacer la petición. Una prueba permanente del repositorio vigila que nadie
 * más escriba en esa tabla desde `src/` y que este archivo exporte exactamente estas 9 columnas.
 */
import { FORMATOS_VALIDOS } from './formato'

export const COLUMNAS_DE_LA_ETIQUETA = ['que_muestra', 'producto_visto', 'etiquetada_en', 'etiqueta_modelo', 'texto_visible', 'etiqueta_confianza'] as const
export const COLUMNAS_DE_LA_TOMA = ['con_personas', 'tipo_de_toma', 'formato'] as const
/** todo lo que este archivo puede escribir en la tabla: nada más */
export const COLUMNAS_QUE_ESCRIBE = [...COLUMNAS_DE_LA_ETIQUETA, ...COLUMNAS_DE_LA_TOMA] as const
export const CONFIANZAS_VALIDAS = ['alta', 'media', 'baja'] as const
export const TIPOS_DE_TOMA_VALIDOS = ['producto', 'ambiente', 'personas', 'texto_afiche', 'otro'] as const

export interface ValoresDeLaToma { con_personas: boolean | null; tipo_de_toma: (typeof TIPOS_DE_TOMA_VALIDOS)[number] | null; formato: 'vertical' | 'cuadrado' | 'horizontal' | null }
export interface ValoresDeLaEtiquetaBase { que_muestra: string; producto_visto: string[]; etiquetada_en: string; etiqueta_modelo: string; texto_visible: string; etiqueta_confianza: (typeof CONFIANZAS_VALIDAS)[number] }
/** las 6 solas · las 6 + las 3 · o las 3 solas (el escritor rechaza cualquier otra mezcla antes de hacer la petición) */
export interface ValoresDeEtiqueta extends Partial<ValoresDeLaEtiquetaBase>, Partial<ValoresDeLaToma> {}
export interface ResultadoDeEscritura { ok: boolean; detalle?: string }

/** un id o un cliente que no sea un identificador simple podría romper el filtro de la dirección */
const identificadorSimple = (t: string): boolean => /^[A-Za-z0-9._-]{1,80}$/.test(t)

export function crearEscritor(args: { urlDeLaBase: string; llave: string; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> }) {
  const traer = args.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (a: { foto_id: string; cliente: string; valores: ValoresDeEtiqueta }): Promise<ResultadoDeEscritura> => {
    const columnas = Object.keys(a.valores)
    const v = a.valores as Record<string, unknown>
    const sobran = columnas.filter((c) => !(COLUMNAS_QUE_ESCRIBE as readonly string[]).includes(c))
    if (sobran.length) return { ok: false, detalle: `columna no permitida: ${sobran.join(', ')}` }
    const hayBase = COLUMNAS_DE_LA_ETIQUETA.some((c) => columnas.includes(c))
    const hayToma = COLUMNAS_DE_LA_TOMA.some((c) => columnas.includes(c))
    // una etiqueta a medias no se escribe: o las 6 de la etiqueta completas, o ninguna; la toma, completa (las 3) o ninguna
    const faltan = [...(hayBase ? COLUMNAS_DE_LA_ETIQUETA : []), ...(hayToma ? COLUMNAS_DE_LA_TOMA : [])].filter((c) => !columnas.includes(c))
    if (!hayBase && !hayToma) return { ok: false, detalle: 'faltan columnas de la etiqueta: no hay nada que escribir' }
    if (faltan.length) return { ok: false, detalle: `faltan columnas de la etiqueta: ${faltan.join(', ')}` }
    if (hayBase && !(CONFIANZAS_VALIDAS as readonly string[]).includes(v.etiqueta_confianza as string)) return { ok: false, detalle: 'la confianza de la etiqueta debe ser alta, media o baja' }
    if (hayToma) {
      if (v.con_personas !== null && typeof v.con_personas !== 'boolean') return { ok: false, detalle: '`con_personas` debe ser verdadero, falso o vacío' }
      if (v.tipo_de_toma !== null && !(TIPOS_DE_TOMA_VALIDOS as readonly string[]).includes(v.tipo_de_toma as string)) return { ok: false, detalle: `\`tipo_de_toma\` debe ser ${TIPOS_DE_TOMA_VALIDOS.join(', ')} o vacío` }
      if (v.formato !== null && !(FORMATOS_VALIDOS as readonly string[]).includes(v.formato as string)) return { ok: false, detalle: '`formato` debe ser vertical, cuadrado, horizontal o vacío' }
    }
    if (!identificadorSimple(a.foto_id) || !identificadorSimple(a.cliente)) return { ok: false, detalle: 'falta el id de la foto o el cliente, o no es un identificador simple' }
    if (!args.llave || !args.urlDeLaBase) return { ok: false, detalle: 'la base no está configurada en el servidor' }
    try {
      const r = await traer(`${args.urlDeLaBase.replace(/\/$/, '')}/rest/v1/client_social_images?id=eq.${a.foto_id}&client_id=eq.${a.cliente}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', apikey: args.llave, Authorization: `Bearer ${args.llave}`, Prefer: 'return=minimal' },
        body: JSON.stringify(a.valores),
      })
      return r.ok ? { ok: true } : { ok: false, detalle: `la base respondió ${r.status}: ${(await r.text()).slice(0, 120)}` }
    } catch (e) {
      return { ok: false, detalle: e instanceof Error ? e.message : String(e) }
    }
  }
}
