/**
 * ESCRIBIR LA ETIQUETA DE UNA FOTO · el ÚNICO lugar del cerebro que escribe en `client_social_images`, y solo estas 4 columnas.
 *
 * UN `PATCH` (actualizar) de UNA foto, filtrado por el id de la foto Y por el cliente (nunca uno sin el otro). Jamás inserta ni borra filas, jamás toca
 * `producto`, `url`, `caption` ni ninguna otra columna: pedirle otra se rechaza SIN hacer la petición. Una prueba permanente del repositorio vigila que nadie
 * más escriba en esa tabla desde `src/` y que este archivo exporte exactamente estas 4 columnas.
 */
export const COLUMNAS_QUE_ESCRIBE = ['que_muestra', 'producto_visto', 'etiquetada_en', 'etiqueta_modelo'] as const

export interface ValoresDeEtiqueta { que_muestra: string; producto_visto: string[]; etiquetada_en: string; etiqueta_modelo: string }
export interface ResultadoDeEscritura { ok: boolean; detalle?: string }

/** un id o un cliente que no sea un identificador simple podría romper el filtro de la dirección */
const identificadorSimple = (t: string): boolean => /^[A-Za-z0-9._-]{1,80}$/.test(t)

export function crearEscritor(args: { urlDeLaBase: string; llave: string; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> }) {
  const traer = args.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (a: { foto_id: string; cliente: string; valores: ValoresDeEtiqueta }): Promise<ResultadoDeEscritura> => {
    const columnas = Object.keys(a.valores)
    const sobran = columnas.filter((c) => !(COLUMNAS_QUE_ESCRIBE as readonly string[]).includes(c))
    if (sobran.length) return { ok: false, detalle: `columna no permitida: ${sobran.join(', ')}` }
    const faltan = COLUMNAS_QUE_ESCRIBE.filter((c) => !columnas.includes(c))
    if (faltan.length) return { ok: false, detalle: `faltan columnas de la etiqueta: ${faltan.join(', ')}` }
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
