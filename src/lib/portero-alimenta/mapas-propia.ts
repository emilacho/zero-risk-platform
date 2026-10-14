/**
 * LA FICHA DE MAPAS QUE ES DEL CLIENTE · una búsqueda por nombre devuelve VARIAS fichas y casi siempre homónimos (medido el 14-oct: 10 fichas ajenas por 1 propia).
 * Tomar «la primera» archivó el teléfono, la dirección y el horario de OTRO negocio como si fueran del cliente. Una ficha es del cliente solo si:
 *   (a) por sí sola la confirma `esSobreElCliente` (nombre + identidad, o ciudad + rubro), o
 *   (b) su título es EXACTAMENTE el nombre del cliente y está en una de sus sedes declaradas (una ficha de Mapas casi nunca trae sitio ni teléfono propios).
 * Si hay MÁS de una candidata distinta, es ambiguo: ninguna. PURO, agnóstico.
 */
import { coincidePorPalabra } from '../texto/coincidencia'
import { normalizar } from '../manual/texto'
import { esSobreElCliente, type ContextoDelCliente } from './filtro'

export type FichaCruda = Record<string, unknown>
export interface ResultadoDeFicha { ficha: FichaCruda | null; candidatas: number; ambigua: boolean; descartadas: Array<{ titulo: string; motivo: string }> }

export function fichaPropiaDeMapas(items: FichaCruda[], ctx: ContextoDelCliente): ResultadoDeFicha {
  const nombreN = normalizar(ctx.nombre)
  const candidatas = new Map<string, FichaCruda>()
  const descartadas: Array<{ titulo: string; motivo: string }> = []
  for (const it of items) {
    const texto = [it.title, it.address, it.city, it.website, it.phone, it.phoneUnformatted].filter((x) => typeof x === 'string').join(' ')
    const ver = esSobreElCliente(texto, ctx)
    const ubic = [it.address, it.city].filter((x) => typeof x === 'string').join(' ')
    const exactaEnSede = !!nombreN && normalizar(it.title) === nombreN && ctx.ubicacion.some((u) => u && coincidePorPalabra(ubic, u))
    if (ver.estado === 'propio' || exactaEnSede) candidatas.set(String(it.placeId ?? it.cid ?? it.url ?? candidatas.size), it)
    else descartadas.push({ titulo: String(it.title ?? '').slice(0, 80), motivo: ver.estado === 'ajeno' ? ver.motivo : `${ver.motivo} · y su título no es exactamente el nombre del cliente en una de sus sedes` })
  }
  return { ficha: [...candidatas.values()][0] ?? null, candidatas: candidatas.size, ambigua: candidatas.size > 1, descartadas }
}
