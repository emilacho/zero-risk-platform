/**
 * FUENTES PÚBLICAS · EL PLAN POR CLIENTE · PURO y AGNÓSTICO (sin red, sin base, sin modelo).
 *
 * Dado el rubro del cliente, su país, las direcciones públicas que se hallaron sobre él y las redes que tiene, decide QUÉ se le pide al Servicio de Apify:
 * reseñas públicas en las plataformas que aplican a su rubro, y textos/videos de las redes que tiene. Lo que no aplica o no se pudo pedir queda en `omitidas`
 * CON SU MOTIVO (nunca en silencio, nunca inventando una dirección).
 */
import { normalizar } from '../manual/texto'
import { coincideAlguna } from '../texto/coincidencia'
import { codigoDePais } from '../pais/pais-del-cliente'
import {
  FAMILIAS, PLATAFORMAS_DE_RESENAS, REDES_CON_CONTENIDO,
  type IdDeFamilia, type PlataformaDeResenas, type Red, type TipoDeFuentePublica,
} from './catalogo'

export interface EntradaDelPlan {
  rubro?: string | null
  /** nombre del negocio o producto · lo piden las plataformas que buscan por nombre (directorios de software) */
  nombre?: string | null
  /** país (código de 2 letras o nombre) */
  pais?: string | null
  /** direcciones públicas halladas sobre el cliente (su sitio, enlaces del sitio, lo que halló el descubrimiento) */
  enlaces?: string[]
  /** las redes del cliente: usuario o dirección */
  redes?: Partial<Record<Red, string | null | undefined>>
  /** la ficha propia de mapas, si el raspado de mapas la trajo */
  mapas?: { url?: string | null; placeId?: string | null } | null
  /** cuánto pedir por cada cosa (tope por llamada) */
  limites?: { resenas?: number; publicaciones?: number; videos?: number }
}
export interface LlamadaDeFuente { tipo: TipoDeFuentePublica; plataforma: string; funcion: string; params: Record<string, unknown>; objetivo: string }
export interface Omitida { tipo: TipoDeFuentePublica; plataforma: string; motivo: string }
export interface PlanDeFuentesPublicas { familias: IdDeFamilia[]; llamadas: LlamadaDeFuente[]; omitidas: Omitida[] }

export const LIMITES_POR_OMISION = { resenas: 100, publicaciones: 20, videos: 10 } as const

/** las familias de un rubro (puede ser más de una) · sin coincidencia ⇒ `general` (solo aplican las plataformas «de todas») */
export function familiasDelRubro(rubro: string | null | undefined): IdDeFamilia[] {
  // ronda 76 · por PALABRA ENTERA (antes por trozo: «barbería» caía en comida, «apicultura» en software, «cabañas» en belleza)
  if (!normalizar(rubro ?? '')) return ['general']
  const halladas = (Object.keys(FAMILIAS) as Array<keyof typeof FAMILIAS>).filter((f) => coincideAlguna(rubro, FAMILIAS[f]))
  return halladas.length ? halladas : ['general']
}

export function plataformasQueAplican(familias: IdDeFamilia[], pais?: string | null): PlataformaDeResenas[] {
  const iso = codigoDePais(pais ?? '')
  return PLATAFORMAS_DE_RESENAS.filter((p) => {
    const familiaOk = p.familias === 'todas' || p.familias.some((f) => familias.includes(f))
    const paisOk = !p.paises || !iso || p.paises.includes(iso)
    return familiaOk && paisOk
  })
}

const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const esDeHost = (u: string, hosts: string[]): boolean => {
  const h = hostDe(u)
  return !!h && hosts.some((x) => {
    if (!x.endsWith('.*')) return h === x || h.endsWith('.' + x)
    // «nombre.*»: ese nombre con cualquier dominio de país (nombre.com · nombre.com.xx · nombre.xx)
    const base = x.slice(0, -2).replace(/\./g, '\\.')
    return new RegExp('(^|\\.)' + base + '\\.[a-z]{2,}(\\.[a-z]{2})?$').test(h)
  })
}
const conEsquema = (u: string): string => (/^https?:\/\//i.test(u) ? u : `https://${u}`)

/** la primera dirección pública hallada en esos hosts · null si no se halló (no se inventa) */
export function hallarDireccion(enlaces: string[], hosts: string[], filtro?: (u: string) => boolean): string | null {
  for (const e of enlaces) if (typeof e === 'string' && esDeHost(e, hosts) && (!filtro || filtro(e))) return conEsquema(e.trim())
  return null
}

/** usuario de una red, desde un usuario suelto o desde una dirección de perfil · '' si no se puede sacar */
export function usuarioDeRed(valor: string | null | undefined, hosts: string[]): string {
  const s = String(valor ?? '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(s)) {
    if (!esDeHost(s, hosts)) return ''
    try {
      const partes = new URL(conEsquema(s)).pathname.split('/').filter(Boolean)
      const p = partes[0] ?? ''
      if (!p || ['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'watch', 'channel', 'c', 'user', 'video'].includes(p.toLowerCase())) return partes[0] === 'channel' || partes[0] === 'c' || partes[0] === 'user' ? partes[1] ?? '' : ''
      return p.replace(/^@/, '')
    } catch { return '' }
  }
  return s.replace(/^@/, '')
}

export function planDeFuentesPublicas(e: EntradaDelPlan): PlanDeFuentesPublicas {
  const lim = { ...LIMITES_POR_OMISION, ...(e.limites ?? {}) }
  const enlaces = (e.enlaces ?? []).filter((x) => typeof x === 'string' && x.trim())
  const familias = familiasDelRubro(e.rubro)
  const llamadas: LlamadaDeFuente[] = []
  const omitidas: Omitida[] = []

  // ── reseñas públicas · solo las plataformas que aplican a ESTE rubro
  const aplican = plataformasQueAplican(familias, e.pais)
  for (const p of aplican) {
    if (p.id === 'google_maps') {
      const url = e.mapas?.url?.trim(); const placeId = e.mapas?.placeId?.trim()
      if (url) llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { startUrls: [{ url }], maxReviews: lim.resenas }, objetivo: url })
      else if (placeId) llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { placeIds: [placeId], maxReviews: lim.resenas }, objetivo: placeId })
      else omitidas.push({ tipo: 'resenas', plataforma: p.nombre, motivo: 'el raspado de mapas no trajo la ficha propia del negocio (sin ficha no hay reseñas que pedir)' })
      continue
    }
    if (p.params === 'busqueda' && p.funcion === 'software_review_scraper') {
      const nombre = (e.nombre ?? '').trim()
      if (nombre) llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { query: nombre, resultsLimit: lim.resenas }, objetivo: nombre })
      else omitidas.push({ tipo: 'resenas', plataforma: p.nombre, motivo: 'sin el nombre del producto no se puede buscar en el directorio' })
      continue
    }
    const url = hallarDireccion(enlaces, p.hosts, p.id === 'facebook' ? (u) => !/\/(posts|photos|videos|events)\//i.test(u) : undefined)
    if (!url) { omitidas.push({ tipo: 'resenas', plataforma: p.nombre, motivo: 'no se halló una dirección pública del negocio en esa plataforma (no se inventa)' }); continue }
    if (p.funcion === 'trustpilot_scraper') llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { startUrls: [{ url }] }, objetivo: url })
    else if (p.id === 'facebook') llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { startUrls: [{ url: /\/reviews\/?$/i.test(url) ? url : url.replace(/\/+$/, '') + '/reviews' }], resultsLimit: lim.resenas }, objetivo: url })
    else if (p.funcion === 'resenas_booking') llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { startUrls: [{ url }], maxReviewsPerHotel: lim.resenas }, objetivo: url })
    else if (p.funcion === 'resenas_app_store') llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { startUrls: [{ url }], includeReviews: true, maxItems: 1 }, objetivo: url })
    else llamadas.push({ tipo: 'resenas', plataforma: p.nombre, funcion: p.funcion, params: { startUrls: [{ url }], maxItemsPerQuery: lim.resenas }, objetivo: url })
  }
  // las plataformas que NO aplican a este rubro quedan dichas (para que nadie crea que se olvidaron)
  for (const p of PLATAFORMAS_DE_RESENAS) if (!aplican.includes(p)) omitidas.push({ tipo: 'resenas', plataforma: p.nombre, motivo: `no aplica a este rubro${p.paises ? ' o a su país' : ''}` })

  // ── textos y videos · solo de las redes que el cliente TIENE
  for (const r of REDES_CON_CONTENIDO) {
    const dato = e.redes?.[r.red]
    const usuario = usuarioDeRed(dato, r.hosts)
    const direccion = String(dato ?? '').trim() && /^https?:\/\//i.test(String(dato).trim()) ? conEsquema(String(dato).trim()) : ''
    if (!usuario && !direccion) {
      for (const t of r.produce) omitidas.push({ tipo: t, plataforma: r.nombre, motivo: 'el cliente no tiene esa red declarada ni hallada' })
      continue
    }
    if (r.produce.includes('publicaciones') && r.funcionPublicaciones) {
      if (r.red === 'instagram') omitidas.push({ tipo: 'publicaciones', plataforma: r.nombre, motivo: 'los pies de las publicaciones de Instagram ya los trae la lectura del perfil propio (no se pide dos veces)' })
      else llamadas.push({ tipo: 'publicaciones', plataforma: r.nombre, funcion: r.funcionPublicaciones, params: { startUrls: [{ url: direccion || `https://www.${r.hosts[0]}/${usuario}` }], resultsLimit: lim.publicaciones, captionText: true }, objetivo: direccion || usuario })
    }
    if (r.produce.includes('videos') && r.funcionVideos) {
      if (r.red === 'instagram') llamadas.push({ tipo: 'videos', plataforma: r.nombre, funcion: r.funcionVideos, params: { username: [usuario], resultsLimit: lim.videos, includeTranscript: true }, objetivo: usuario })
      else if (r.red === 'tiktok') llamadas.push({ tipo: 'videos', plataforma: r.nombre, funcion: r.funcionVideos, params: { profiles: [usuario], resultsPerPage: lim.videos }, objetivo: usuario })
      else if (r.red === 'youtube') llamadas.push({ tipo: 'videos', plataforma: r.nombre, funcion: r.funcionVideos, params: { startUrls: [{ url: direccion || `https://www.youtube.com/@${usuario}` }], maxResults: lim.videos }, objetivo: direccion || usuario })
    }
  }
  return { familias, llamadas, omitidas }
}
