/**
 * PLAN DE AMPLIACIÓN (paso 1, lo que el flujo de la mañana NO cubre) · qué llamadas al Servicio de Apify pide el diario para UN cliente. PURO.
 *  · cubre SOLO fuentes PROPIAS (los competidores quedan fuera): Mapas propio (+ reseñas, D-2), comentarios de las publicaciones propias y las páginas de reparto que el cliente declaró (D-3: campo opcional
 *    `clients.config.apify.url_reparto`; sin él, «no cubierta» y no se inventa nada);
 *  · cada acción trae su costo MÁXIMO y si está MEDIDO o es estimado (los de Mapas, reseñas y comentarios NO están medidos: se medirán en la primera corrida real, P5);
 *  · el corte por tope (US$ 1,00 por cliente y día) y por número de corridas se hace AQUÍ, en código: lo que no cabe se devuelve en `omitidas` con su motivo.
 */
import { MAX_COMENTARIOS_POR_CORRIDA, MAX_CORRIDAS_DE_RESENAS_POR_DIA, TOPE_DE_RESENAS_POR_CORRIDA, recortarAlTope } from './topes'

export type FuenteDeAmpliacion = 'mapas' | 'comentarios' | 'reparto'
export interface AccionDeAmpliacion {
  fuente: FuenteDeAmpliacion
  funcion: 'own_google_maps_profile' | 'instagram_post_comments_scraper' | 'website_content_scraper'
  params: Record<string, unknown>
  metadata: { target_kind: 'own'; llamado_por: 'cerebro-diario-ampliacion' }
  usd_max: number
  medido: boolean
}
/** costos MÁXIMOS por corrida: el del sitio es el medido (243 corridas reales); los otros son estimaciones declaradas y se corrigen con la primera corrida real */
export const COSTO_MAXIMO_USD = { website_content_scraper: { usd: 0.0536, medido: true }, own_google_maps_profile: { usd: 0.1, medido: false }, instagram_post_comments_scraper: { usd: 0.05, medido: false } } as const
export const DIAS_ENTRE_CORRIDAS = { mapas: 1, comentarios: 1, reparto: 7 } as const
const DIA = 86_400_000

export interface EntradaDelPlan {
  cliente: { id: string; name?: string | null; config?: unknown }
  /** cuándo se observó por última vez cada fuente (ISO) · null = nunca */
  ultima: Partial<Record<FuenteDeAmpliacion, string | null>>
  /** códigos cortos de las publicaciones propias más nuevas (de lo ya vigilado de Instagram) */
  publicaciones_propias: string[]
  gastado_hoy_usd: number
  corridas_de_resenas_hoy: number
  ahora: Date
}
export interface PlanDeAmpliacion { hacer: AccionDeAmpliacion[]; omitidas: Array<{ fuente: FuenteDeAmpliacion | 'resenas'; por_que: string }>; no_cubiertas: Array<{ fuente: string; por_que: string }> }

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const vencida = (ult: string | null | undefined, dias: number, ahora: Date): boolean => !ult || ahora.getTime() - new Date(ult).getTime() >= dias * DIA - 60_000
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v.trim())).map((v) => v.trim()) : [])

export function planDeAmpliacion(e: EntradaDelPlan): PlanDeAmpliacion {
  const cfg = obj(obj(e.cliente.config).apify)
  const plan: PlanDeAmpliacion = { hacer: [], omitidas: [], no_cubiertas: [] }
  const candidatas: AccionDeAmpliacion[] = []
  const nombre = String(e.cliente.name ?? '').trim()

  // Mapas propio + reseñas (D-2): UNA corrida de la misma función; las reseñas son un parámetro, sin datos personales
  if (vencida(e.ultima.mapas, DIAS_ENTRE_CORRIDAS.mapas, e.ahora)) {
    if (!nombre) plan.no_cubiertas.push({ fuente: 'mapas', por_que: 'la ficha no trae nombre del negocio para buscar su ficha de Mapas' })
    else if (e.corridas_de_resenas_hoy >= MAX_CORRIDAS_DE_RESENAS_POR_DIA) plan.omitidas.push({ fuente: 'resenas', por_que: `tope de ${MAX_CORRIDAS_DE_RESENAS_POR_DIA} corrida de reseñas por cliente y día` })
    else {
      // el nombre EXACTO o la cuenta: nunca un homónimo (cabeza #419). La búsqueda lleva el nombre tal cual y 1 resultado.
      const c = COSTO_MAXIMO_USD.own_google_maps_profile
      candidatas.push({ fuente: 'mapas', funcion: 'own_google_maps_profile', params: { searchStringsArray: [nombre], maxCrawledPlacesPerSearch: 1, language: 'es', maxReviews: TOPE_DE_RESENAS_POR_CORRIDA, reviewsSort: 'newest', scrapeReviewsPersonalData: false }, metadata: { target_kind: 'own', llamado_por: 'cerebro-diario-ampliacion' }, usd_max: c.usd, medido: c.medido })
    }
  }
  // comentarios de las publicaciones propias más nuevas (solo si hay publicaciones ya vigiladas)
  if (vencida(e.ultima.comentarios, DIAS_ENTRE_CORRIDAS.comentarios, e.ahora)) {
    const urls = e.publicaciones_propias.slice(0, 3).map((c) => `https://www.instagram.com/p/${c}/`)
    if (!urls.length) plan.no_cubiertas.push({ fuente: 'comentarios', por_que: 'todavía no hay publicaciones propias vigiladas de las que leer comentarios' })
    else { const c = COSTO_MAXIMO_USD.instagram_post_comments_scraper; candidatas.push({ fuente: 'comentarios', funcion: 'instagram_post_comments_scraper', params: { directUrls: urls, resultsLimit: MAX_COMENTARIOS_POR_CORRIDA, includeNestedComments: false }, metadata: { target_kind: 'own', llamado_por: 'cerebro-diario-ampliacion' }, usd_max: c.usd, medido: c.medido }) }
  }
  // reparto (D-3): solo si el cliente declaró la dirección; si no, «no cubierta»
  const reparto = strs(cfg.url_reparto)
  if (!reparto.length) plan.no_cubiertas.push({ fuente: 'reparto', por_que: 'el alta no trae `url_reparto` (campo opcional, D-3): no hay página de reparto que leer' })
  else if (vencida(e.ultima.reparto, DIAS_ENTRE_CORRIDAS.reparto, e.ahora)) {
    for (const url of reparto.slice(0, 2)) { const c = COSTO_MAXIMO_USD.website_content_scraper; candidatas.push({ fuente: 'reparto', funcion: 'website_content_scraper', params: { startUrls: [{ url }], maxCrawlPages: 1, maxCrawlDepth: 0 }, metadata: { target_kind: 'own', llamado_por: 'cerebro-diario-ampliacion' }, usd_max: c.usd, medido: c.medido }) }
  }

  const r = recortarAlTope(candidatas, e.gastado_hoy_usd)
  plan.hacer = r.hacer
  for (const o of r.omitidas) plan.omitidas.push({ fuente: o.accion.fuente, por_que: o.por_que })
  return plan
}
