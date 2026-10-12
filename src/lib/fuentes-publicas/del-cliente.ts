/**
 * Fuentes públicas · de la FICHA y el RASPADO PROPIOS del cliente a la entrada del planificador, y el costo estimado. PURO (sin base, sin modelo).
 * Regla de oro: solo se usa lo que es del propio negocio — su sitio, su perfil declarado, su ficha de mapas con el MISMO nombre. Una ficha de mapas de un homónimo, o un enlace que aparece
 * en la ficha de OTRO negocio, no entran jamás (se vio en la práctica: un raspado de mapas trae hoteles vecinos con sus propios enlaces).
 */
import { normalizar } from '../manual/texto'
import { LIMITES_POR_OMISION, planDeFuentesPublicas, type EntradaDelPlan, type PlanDeFuentesPublicas } from './plan'
import type { Red } from './catalogo'

export interface FichaDeFuentes { name?: string | null; industry?: string | null; market?: string | null; country?: string | null; website_url?: string | null; config?: unknown }
export interface FilaPropia { apify_function: string; params?: unknown; respuesta?: unknown; ensayo?: boolean | null }

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const host = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const sinPuntuacion = (s: string): string => normalizar(s).replace(/[^a-z0-9]+/g, ' ').trim()

/** todas las direcciones que aparecen escritas dentro de una respuesta de raspado */
export function direccionesDe(respuesta: unknown): string[] {
  let t = ''
  try { t = JSON.stringify(respuesta) ?? '' } catch { return [] }
  const out = new Set<string>()
  for (const m of t.matchAll(/https?:\\?\/\\?\/[^\s"'<>)\\]+/g)) out.add(m[0].replace(/\\/g, '').replace(/[.,;]+$/, ''))
  return [...out]
}

const PERFIL_DE_RED: Record<Exclude<Red, 'instagram'>, RegExp> = {
  facebook: /^(www\.)?(facebook|fb)\.com\/(?!sharer|share|plugins|tr\b|dialog|login|policies|help|ads|groups|events|watch|marketplace|profile\.php\?id=0)[^/?#]+\/?$/i,
  tiktok: /^(www\.)?tiktok\.com\/@[^/?#]+\/?$/i,
  youtube: /^(www\.)?youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)\/?$/i,
}

export function entradaDelPlanDesdeFicha(ficha: FichaDeFuentes, filas: FilaPropia[], limites?: EntradaDelPlan['limites']): EntradaDelPlan {
  const miHost = host(ficha.website_url ?? '')
  const propias = filas.filter((f) => !f.ensayo)
  // ── enlaces: SOLO los que aparecen en el sitio propio del cliente
  const enlaces: string[] = []
  for (const f of propias) {
    if (f.apify_function !== 'website_content_scraper' || !miHost) continue
    const u = String(obj(f.params).url ?? obj(f.params).startUrl ?? '')
    if (host(u) !== miHost) continue
    for (const d of direccionesDe(f.respuesta)) if (!enlaces.includes(d)) enlaces.push(d)
  }
  // ── redes: lo declarado en la ficha manda; lo que falte, de los enlaces del sitio propio (solo direcciones de PERFIL)
  const declarado = obj(obj(obj(ficha.config).apify).own_handles)
  const redes: Partial<Record<Red, string>> = {}
  for (const r of ['instagram', 'facebook', 'tiktok', 'youtube'] as Red[]) {
    const v = declarado[r]
    if (typeof v === 'string' && v.trim()) redes[r] = v.trim()
  }
  for (const r of ['facebook', 'tiktok', 'youtube'] as const) {
    if (redes[r]) continue
    const hallado = enlaces.find((e) => PERFIL_DE_RED[r].test(e.replace(/^https?:\/\//i, '')))
    if (hallado) redes[r] = hallado
  }
  // ── ficha propia de mapas: el MISMO nombre (sin tildes ni puntuación) o el mismo sitio web; si no, no hay ficha propia
  const nombre = sinPuntuacion(ficha.name ?? '')
  let mapas: EntradaDelPlan['mapas'] = null
  for (const f of propias) {
    if (mapas || !/(^own_google_maps_profile$|^google_maps_scraper$)/.test(f.apify_function)) continue
    for (const it of Array.isArray(f.respuesta) ? f.respuesta : []) {
      const o = obj(it)
      const titulo = sinPuntuacion(String(o.title ?? o.name ?? ''))
      const mismoNombre = !!nombre && titulo === nombre
      const mismoSitio = !!miHost && host(String(o.website ?? '')) === miHost
      if (!mismoNombre && !mismoSitio) continue
      const url = typeof o.url === 'string' ? o.url : ''
      const placeId = typeof o.placeId === 'string' ? o.placeId : ''
      if (url || placeId) { mapas = { url: url || null, placeId: placeId || null }; break }
    }
  }
  const pais = ficha.country || (ficha.market ? String(ficha.market).split(',').pop()!.trim() : null)
  return { rubro: ficha.industry ?? null, nombre: ficha.name ?? null, pais: pais ?? null, enlaces, redes, mapas, ...(limites ? { limites } : {}) }
}

/** US$ por unidad pedida, MEDIDO en corridas reales el 2026-10-12 (ronda 75) · las que no se corrieron llevan `medido:false` y un valor prudente */
export const COSTO_UNITARIO_USD: Record<string, { usd: number; unidad: string; medido: boolean }> = {
  resenas_google_maps: { usd: 0.00045, unidad: 'reseña', medido: true },
  resenas_tripadvisor: { usd: 0.0019, unidad: 'reseña', medido: true },
  resenas_facebook: { usd: 0.0006, unidad: 'reseña', medido: false },
  resenas_booking: { usd: 0.003, unidad: 'reseña', medido: false },
  resenas_app_store: { usd: 0.003, unidad: 'reseña', medido: false },
  trustpilot_scraper: { usd: 0.003, unidad: 'reseña', medido: false },
  software_review_scraper: { usd: 0.003, unidad: 'reseña', medido: false },
  publicaciones_facebook: { usd: 0.0042, unidad: 'publicación', medido: true },
  videos_instagram: { usd: 0.0557, unidad: 'video (con transcripción)', medido: true },
  videos_tiktok: { usd: 0.024, unidad: 'video (con transcripción)', medido: true },
  videos_youtube: { usd: 0.085, unidad: 'video (con transcripción)', medido: true },
}

export function topeDeLlamada(params: Record<string, unknown>): number {
  for (const k of ['maxReviews', 'maxItemsPerQuery', 'maxReviewsPerHotel', 'resultsLimit', 'resultsPerPage', 'maxResults', 'maxItems']) if (typeof params[k] === 'number') return params[k] as number
  return LIMITES_POR_OMISION.resenas
}

export interface EstimacionDeCosto { total_usd: number; por_llamada: Array<{ funcion: string; objetivo: string; tope: number; usd: number; medido: boolean }>; sin_precio: string[] }
export function estimarCosto(plan: PlanDeFuentesPublicas): EstimacionDeCosto {
  const por_llamada: EstimacionDeCosto['por_llamada'] = []
  const sin_precio: string[] = []
  for (const l of plan.llamadas) {
    const p = COSTO_UNITARIO_USD[l.funcion]
    if (!p) { sin_precio.push(l.funcion); continue }
    const tope = topeDeLlamada(l.params)
    por_llamada.push({ funcion: l.funcion, objetivo: l.objetivo, tope, usd: Math.round(p.usd * tope * 1e4) / 1e4, medido: p.medido })
  }
  return { total_usd: Math.round(por_llamada.reduce((a, x) => a + x.usd, 0) * 1e4) / 1e4, por_llamada, sin_precio }
}

export function planDeLaFicha(ficha: FichaDeFuentes, filas: FilaPropia[], limites?: EntradaDelPlan['limites']): { entrada: EntradaDelPlan; plan: PlanDeFuentesPublicas; estimado: EstimacionDeCosto } {
  const entrada = entradaDelPlanDesdeFicha(ficha, filas, limites)
  const plan = planDeFuentesPublicas(entrada)
  return { entrada, plan, estimado: estimarCosto(plan) }
}
