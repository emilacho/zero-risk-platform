/**
 * LA PUERTA DEL ALTA CREA LA FICHA POR NOMBRE (CC#1 · noche del 19-oct · decisión de Lenovo con autoridad de Emilio).
 *
 * Antes, la puerta de trato cerrado rechazaba un `client_id` que no existiera (E79: un id inventado esquivaba el freno de gasto POR CLIENTE). Un cliente de cero no podía entrar solo.
 * Ahora, quien tiene la llave del trato puede mandar un NOMBRE y la puerta crea la ficha, con dos defensas:
 *   1. el `client_id` lo genera la BASE (nunca lo trae quien llama): no hay id inventado que esquive nada;
 *   2. cada ficha nueva tiene SU PROPIO freno de gasto (el de cualquier cliente) y se crean COMO MÁXIMO `MAX_FICHAS_NUEVAS_POR_DIA` por día UTC por esta puerta.
 * Un nombre que ya tiene ficha devuelve la existente (no cuenta contra el tope). El slug sale de la misma función que usa `/api/clients/upsert`,
 * así el alta posterior reconcilia esta fila en vez de duplicarla. Puro: lo que toca la base entra por `PuertosDeFicha`.
 */
import { slugify } from '@/lib/discovery-output/ensure-client'

export const MAX_FICHAS_NUEVAS_POR_DIA = 3
export const ORIGEN_PUERTA = 'puerta_trato_cerrado'
export const LARGO_MIN_NOMBRE = 2
export const LARGO_MAX_NOMBRE = 120

export interface FichaNueva {
  name: string
  slug: string
  industry?: string
  country?: string
  website_url?: string
  config: { creado_por: typeof ORIGEN_PUERTA; creado_en: string }
}
export interface FichaCreadaHoy { id: string; created_at: string }

export interface PuertosDeFicha {
  /** la ficha con ese slug, si existe (cualquier estado) */
  buscarPorSlug(slug: string): Promise<{ id: string; name: string; archivada?: boolean } | null>
  /** crea la ficha y devuelve su id (lo asigna la base). Si el slug ya existe lanza un error con `code: 'duplicado'` */
  crear(f: FichaNueva): Promise<{ id: string }>
  /** las fichas creadas por ESTA puerta desde `desdeIso`, de la más vieja a la más nueva (desempate por id) */
  creadasPorLaPuerta(desdeIso: string): Promise<FichaCreadaHoy[]>
  /** borra una ficha que esta misma llamada acaba de crear (solo si se pasó del tope por una carrera); el almacén solo borra filas creadas por esta puerta */
  borrar(id: string): Promise<void>
  ahora(): Date
}

export type RespuestaDeFicha =
  | { ok: true; status: 200 | 201; client_id: string; creado: boolean; nombre: string; slug: string; archivada?: boolean }
  | { ok: false; status: 400 | 429; error: string; detalle?: string; errores?: string[]; maximo?: number }

const texto = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined)
const https = (u: string) => { try { return new URL(u).protocol === 'https:' } catch { return false } }

/** el nombre es lo único obligatorio; lo demás se acepta si es texto razonable y se ignora si no */
export function validarPedido(cuerpo: unknown): { ok: true; nombre: string; industry?: string; country?: string; website_url?: string } | { ok: false; errores: string[] } {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, errores: ['el cuerpo debe ser un objeto'] }
  const c = cuerpo as Record<string, unknown>
  const nombre = texto(c.client_name) ?? texto(c.name)
  const errores: string[] = []
  if (!nombre) errores.push('client_name es obligatorio')
  else {
    if (nombre.length < LARGO_MIN_NOMBRE || nombre.length > LARGO_MAX_NOMBRE) errores.push(`client_name debe tener entre ${LARGO_MIN_NOMBRE} y ${LARGO_MAX_NOMBRE} caracteres`)
    if (!/[\p{L}\p{N}]/u.test(nombre)) errores.push('client_name debe tener al menos una letra o un número')
  }
  const url = texto(c.website_url) ?? texto(c.website)
  if (url && !https(url)) errores.push('website_url debe ser una dirección https')
  if (errores.length) return { ok: false, errores }
  return {
    ok: true, nombre: nombre!, ...(texto(c.industry) ? { industry: texto(c.industry)!.slice(0, 120) } : {}),
    ...(texto(c.country) ? { country: texto(c.country)!.slice(0, 60) } : {}), ...(url ? { website_url: url } : {}),
  }
}

/** medianoche UTC del día de `ahora` */
export const inicioDelDiaUtc = (ahora: Date): string => new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())).toISOString()

export async function fichaPorNombre(P: PuertosDeFicha, cuerpo: unknown): Promise<RespuestaDeFicha> {
  const v = validarPedido(cuerpo)
  if (!v.ok) return { ok: false, status: 400, error: 'pedido_invalido', errores: v.errores }
  const slug = slugify(v.nombre)
  const existente = await P.buscarPorSlug(slug)
  // una ficha archivada/churned es la misma ficha (el cliente que vuelve entra, como en E79), pero se DICE para que quien llama no lo ignore
  if (existente) return { ok: true, status: 200, client_id: existente.id, creado: false, nombre: existente.name, slug, ...(existente.archivada ? { archivada: true } : {}) }

  const ahora = P.ahora()
  const nueva: FichaNueva = {
    name: v.nombre, slug, ...(v.industry ? { industry: v.industry } : {}), ...(v.country ? { country: v.country } : {}), ...(v.website_url ? { website_url: v.website_url } : {}),
    config: { creado_por: ORIGEN_PUERTA, creado_en: ahora.toISOString() },
  }
  const desde = inicioDelDiaUtc(ahora)
  // tope ANTES de crear (camino normal: no se crea la ficha ni se toca nada)
  if ((await P.creadasPorLaPuerta(desde)).length >= MAX_FICHAS_NUEVAS_POR_DIA) return topeAlcanzado()
  let id: string
  try {
    id = (await P.crear(nueva)).id
  } catch (e) {
    // carrera por el mismo nombre: la otra llamada ganó el slug ⇒ se devuelve esa ficha
    if ((e as { code?: string } | null)?.code === 'duplicado') {
      const ganada = await P.buscarPorSlug(slug)
      if (ganada) return { ok: true, status: 200, client_id: ganada.id, creado: false, nombre: ganada.name, slug, ...(ganada.archivada ? { archivada: true } : {}) }
    }
    throw e
  }
  // tope DESPUÉS de crear (carrera entre nombres distintos): si esta ficha quedó más allá del tope en el orden de llegada, se deshace
  const hoy = await P.creadasPorLaPuerta(desde)
  const posicion = hoy.findIndex((f) => f.id === id)
  if (posicion >= MAX_FICHAS_NUEVAS_POR_DIA || (posicion < 0 && hoy.length >= MAX_FICHAS_NUEVAS_POR_DIA)) {
    await P.borrar(id)
    return topeAlcanzado()
  }
  return { ok: true, status: 201, client_id: id, creado: true, nombre: v.nombre, slug }
}

function topeAlcanzado(): RespuestaDeFicha {
  return { ok: false, status: 429, error: 'tope_de_fichas_nuevas', maximo: MAX_FICHAS_NUEVAS_POR_DIA, detalle: `la puerta crea como máximo ${MAX_FICHAS_NUEVAS_POR_DIA} fichas nuevas por día (UTC); el resto, mañana o con la ficha ya creada` }
}
