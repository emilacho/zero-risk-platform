/**
 * DESCUBRIR · qué le pide el portero a Apify HOY sobre UN cliente. PURO, agnóstico, sin red, sin base, sin modelo.
 * Une lo que antes estaba partido (`planDeFuentesPublicas` = reseñas/textos/videos por rubro; `planDeAmpliacion` = Mapas/comentarios/reparto) y suma lo que faltaba:
 * sitio e Instagram propios, prensa y directorios (búsqueda + lectura de ≤ 3 páginas), las búsquedas que el portero PROPONE (≤ 3) y las menciones de terceros
 * (actor nuevo, interruptor APAGADO). TODO DIARIO (firma 14-oct de Emilio: sin rotación). El corte por tope y por número de corridas se hace AQUÍ, en código, con motivo.
 * El modelo NUNCA manda gasto: propone texto de búsqueda; lo que se pide pasa por las listas y los topes de este archivo.
 */
import { planDeFuentesPublicas, type EntradaDelPlan as EntradaDeFuentes, type LlamadaDeFuente } from '../fuentes-publicas/plan'
import { recortarAlTope } from '../cerebro/diario/topes'
import { normalizar } from '../manual/texto'
import { COSTO_MAXIMO_POR_FUNCION, COSTO_MAXIMO_POR_OMISION_USD } from './gasto'
import { MAX_ARTICULOS_POR_DIA, MAX_BUSQUEDAS_PROPUESTAS_POR_DIA, TOPE_DEL_PORTERO_USD, type Interruptores } from './datos'

/** el actor nuevo de menciones de terceros: PREPARADO detrás del interruptor `PORTERO_MENCIONES` (apagado). Aún NO existe en el Servicio vivo: encender exige aplicar su nodo con respaldo ANTES. */
export const ACTOR_DE_MENCIONES = { funcion: 'menciones_en_redes', actor: 'apify~instagram-tagged-scraper', descripcion: 'publicaciones de OTRAS cuentas que etiquetan o mencionan al negocio' } as const
export const MAX_CORRIDAS_DEL_PORTERO_POR_DIA = 16
/** mínimo del gasto de la tanda 2: lo que se declara por reseña pedida (hasta 100) */
export const MAX_RESENAS_POR_CORRIDA = 100
/** directorios por familia de rubro: DATO (se amplía sin tocar la lógica); una consulta de búsqueda por entrada */
export const DIRECTORIOS_POR_FAMILIA: Record<string, string[]> = {
  comida: ['tripadvisor', 'restaurantguru'], alojamiento: ['tripadvisor', 'booking'], salud: ['doctoralia'], servicios_profesionales: ['paginas amarillas'], software: ['g2', 'capterra'],
}
const MAX_CONSULTAS_DE_PRENSA = 2

export type FuenteDelPortero = 'sitio' | 'instagram' | 'mapas' | 'comentarios' | 'reparto' | 'resenas' | 'publicaciones' | 'videos' | 'prensa' | 'busqueda_propuesta' | 'menciones'
export interface AccionDelPortero {
  fuente: FuenteDelPortero
  funcion: string
  params: Record<string, unknown>
  metadata: { target_kind: 'own' | 'third_party'; llamado_por: string }
  usd_max: number
  medido: boolean
  objetivo: string
}
export interface EntradaDeDescubrir {
  cliente: { id: string; name?: string | null; website_url?: string | null; config?: unknown }
  rubro?: string | null
  pais?: string | null
  /** ciudad o zona del negocio (de la ficha o de sus sedes): sin ella no se busca por nombre en Mapas ni en prensa */
  ciudad?: string | null
  /** todas las ciudades/sedes del negocio (una búsqueda de Mapas por sede, hasta 3); si falta, se usa `ciudad` */
  ciudades?: string[]
  enlaces?: string[]
  redes?: EntradaDeFuentes['redes']
  mapas?: { url?: string | null; placeId?: string | null } | null
  publicaciones_propias: string[]
  gastado_hoy_usd: number
  interruptores: Interruptores
  /** búsquedas ya validadas por `validarBusquedas` (≤ 3) */
  busquedas_propuestas?: string[]
  tope_usd?: number
}
export interface PlanDelPortero {
  hacer: AccionDelPortero[]
  omitidas: Array<{ fuente: string; funcion: string; por_que: string }>
  no_cubiertas: Array<{ fuente: string; por_que: string }>
  tope_usd: number
  gastado_hoy_usd: number
  costo_maximo_del_plan_usd: number
  familias: string[]
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v.trim())).map((v) => v.trim()) : [])
const costoDe = (f: string) => COSTO_MAXIMO_POR_FUNCION[f] ?? { usd: COSTO_MAXIMO_POR_OMISION_USD, medido: false }
const accion = (fuente: FuenteDelPortero, funcion: string, params: Record<string, unknown>, objetivo: string, kind: 'own' | 'third_party' = 'own'): AccionDelPortero => {
  const c = costoDe(funcion)
  return { fuente, funcion, params, metadata: { target_kind: kind, llamado_por: 'portero-alimentar' }, usd_max: c.usd, medido: c.medido, objetivo }
}

export function descubrir(e: EntradaDeDescubrir): PlanDelPortero {
  const nombre = String(e.cliente.name ?? '').trim()
  const ciudad = String(e.ciudad ?? '').trim()
  const cfg = obj(obj(e.cliente.config).apify)
  const candidatas: AccionDelPortero[] = []
  const noCubiertas: PlanDelPortero['no_cubiertas'] = []

  // propias · sitio e Instagram (todos los días)
  const sitio = String(e.cliente.website_url ?? '').trim()
  if (sitio) candidatas.push(accion('sitio', 'website_content_scraper', { startUrls: [{ url: sitio }], maxCrawlPages: 6, maxCrawlDepth: 1 }, sitio))
  else noCubiertas.push({ fuente: 'sitio', por_que: 'la ficha no trae sitio web' })
  const handle = String(obj(cfg.own_handles).instagram ?? '').replace(/^@/, '').trim()
  if (handle) candidatas.push(accion('instagram', 'instagram_scraper', { usernames: [handle], resultsLimit: 12 }, `@${handle}`))
  else noCubiertas.push({ fuente: 'instagram', por_que: 'el alta no trae la cuenta propia de Instagram' })

  // Mapas propio (+ reseñas del propio mapa): por nombre ENTERO y CIUDAD; sin ciudad ni ficha conocida no se paga a ciegas (precedente: el homónimo de Gualaceo)
  if (e.mapas?.url || e.mapas?.placeId) candidatas.push(accion('mapas', 'own_google_maps_profile', e.mapas.url ? { startUrls: [{ url: e.mapas.url }], language: 'es' } : { placeIds: [e.mapas.placeId], language: 'es' }, e.mapas.url ?? e.mapas.placeId ?? ''))
  else if (nombre && ciudad) {
    // dedupe por la forma NORMALIZADA (sin mayúsculas ni tildes): «Olón», «olon» y «OLÓN» son la misma sede; se conserva la primera escritura
    const vistas = new Set<string>()
    const ciudades: string[] = []
    for (const c of [ciudad, ...(e.ciudades ?? [])].map((x) => x.trim()).filter(Boolean)) { const k = normalizar(c); if (!vistas.has(k)) { vistas.add(k); ciudades.push(c) } }
    ciudades.splice(3)
    // las reseñas NO vienen en la corrida de Mapas (medido 14-oct: aunque se pida `maxReviews`): van en una tanda aparte (`fase: 'tanda2'`) con la dirección de la ficha
    const m = accion('mapas', 'own_google_maps_profile', { searchStringsArray: ciudades.map((c) => `${nombre} ${c}`), maxCrawledPlacesPerSearch: 1, language: 'es' }, ciudades.map((c) => `${nombre} · ${c}`).join(' | '))
    // el máximo declarado es POR BÚSQUEDA (una por sede): el costo de la corrida es n_sedes × ese máximo
    m.usd_max = Math.round(m.usd_max * ciudades.length * 1e6) / 1e6
    candidatas.push(m)
  }
  else noCubiertas.push({ fuente: 'mapas', por_que: 'sin ciudad ni ficha de Mapas conocida: buscar solo por nombre arriesga un homónimo' })

  // comentarios de las publicaciones propias más nuevas
  const urls = e.publicaciones_propias.slice(0, 3).map((c) => `https://www.instagram.com/p/${c}/`)
  if (urls.length) candidatas.push(accion('comentarios', 'instagram_post_comments_scraper', { directUrls: urls, resultsLimit: 50, includeNestedComments: false }, urls.join(' ')))
  else noCubiertas.push({ fuente: 'comentarios', por_que: 'todavía no hay publicaciones propias vigiladas de las que leer comentarios' })

  // reparto (D-3)
  const reparto = strs(cfg.url_reparto)
  if (reparto.length) for (const url of reparto.slice(0, 2)) candidatas.push(accion('reparto', 'website_content_scraper', { startUrls: [{ url }], maxCrawlPages: 1, maxCrawlDepth: 0 }, url))
  else noCubiertas.push({ fuente: 'reparto', por_que: 'el alta no trae `url_reparto` (campo opcional): no hay página de reparto que leer' })

  // reseñas, textos de redes y videos según el rubro (catálogo de familias · plan de fuentes públicas)
  // los videos de otras redes se piden en poca cantidad (3) cada día; los de Instagram solo si hay publicaciones nuevas (`fase: 'tanda2'`)
  const LIMITE_DE_VIDEOS = 3
  const fp = planDeFuentesPublicas({ rubro: e.rubro, nombre, pais: e.pais, enlaces: e.enlaces, redes: e.redes, mapas: e.mapas ?? null, limites: { videos: LIMITE_DE_VIDEOS } })
  for (const l of fp.llamadas as LlamadaDeFuente[]) {
    // las reseñas de Google Maps salen en la tanda 2 (necesitan la ficha que trae la corrida de Mapas); los videos de Instagram, también
    if (l.funcion === 'resenas_google_maps' || l.funcion === 'videos_instagram') continue
    const a = accion(l.tipo === 'resenas' ? 'resenas' : l.tipo === 'publicaciones' ? 'publicaciones' : 'videos', l.funcion, l.params, l.objetivo)
    if (l.tipo === 'videos') a.usd_max = Math.round(COSTO_MAXIMO_POR_FUNCION[l.funcion].usd * (LIMITE_DE_VIDEOS / 10) * 1e6) / 1e6
    candidatas.push(a)
  }

  // prensa, artículos y directorios: UNA búsqueda por consulta (nombre exacto + ciudad); los resultados se leen en una segunda tanda (≤ 3 páginas)
  if (nombre && ciudad) {
    const consultas = [`"${nombre}" ${ciudad}`]
    for (const fam of fp.familias) for (const d of DIRECTORIOS_POR_FAMILIA[fam] ?? []) consultas.push(`"${nombre}" ${ciudad} ${d}`)
    for (const q of consultas.slice(0, MAX_CONSULTAS_DE_PRENSA)) candidatas.push(accion('prensa', 'google_serp_scraper', { queries: q, maxPagesPerQuery: 1, resultsPerPage: 10, languageCode: 'es' }, q, 'third_party'))
  } else noCubiertas.push({ fuente: 'prensa', por_que: 'sin nombre y ciudad no se buscan artículos ni menciones: arriesgarían un homónimo' })

  // las búsquedas que el portero propone (interruptor; ≤ 3; ya validadas por código)
  if (e.interruptores.proponer_busquedas) {
    for (const q of (e.busquedas_propuestas ?? []).slice(0, MAX_BUSQUEDAS_PROPUESTAS_POR_DIA)) candidatas.push(accion('busqueda_propuesta', 'google_serp_scraper', { queries: q, maxPagesPerQuery: 1, resultsPerPage: 10, languageCode: 'es' }, q, 'third_party'))
  }
  // menciones de terceros: actor nuevo detrás de su interruptor (apagado)
  if (e.interruptores.menciones) {
    if (handle) candidatas.push(accion('menciones', ACTOR_DE_MENCIONES.funcion, { username: [handle], resultsLimit: 30 }, `@${handle}`, 'third_party'))
    else noCubiertas.push({ fuente: 'menciones', por_que: 'sin cuenta propia no hay etiquetas que buscar' })
  }

  const tope = e.tope_usd ?? TOPE_DEL_PORTERO_USD
  const r = recortarAlTope(candidatas, e.gastado_hoy_usd, tope, MAX_CORRIDAS_DEL_PORTERO_POR_DIA)
  return {
    hacer: r.hacer,
    omitidas: r.omitidas.map((o) => ({ fuente: o.accion.fuente, funcion: o.accion.funcion, por_que: o.por_que })),
    no_cubiertas: [...noCubiertas, ...fp.omitidas.filter((o) => /no se halló|no tiene esa red|no trajo la ficha|sin el nombre/.test(o.motivo)).map((o) => ({ fuente: `${o.plataforma} (${o.tipo})`, por_que: o.motivo }))],
    tope_usd: tope,
    gastado_hoy_usd: e.gastado_hoy_usd,
    costo_maximo_del_plan_usd: Math.round(r.hacer.reduce((s, a) => s + a.usd_max, 0) * 1e6) / 1e6,
    familias: fp.familias,
  }
}

/**
 * SEGUNDA TANDA · de los resultados de búsqueda a las páginas que vale leer (≤ 3). Código: nunca el sitio propio, nunca una red social ni un buscador,
 * y solo resultados que nombran al cliente por su nombre entero en el título o el resumen.
 */
const HOSTS_QUE_NO_SON_ARTICULO = ['instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'google.com', 'maps.google.com', 'x.com', 'twitter.com', 'linkedin.com', 'wa.me', 'whatsapp.com']
const hostDe = (u: string): string => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
export function articulosParaLeer(resultados: Array<{ url?: unknown; title?: unknown; description?: unknown }>, o: { sitioPropio?: string | null; yaVistas: ReadonlySet<string>; nombreCoincide: (t: string) => boolean }): string[] {
  const propio = o.sitioPropio ? hostDe(o.sitioPropio) : ''
  const out: string[] = []
  for (const r of resultados) {
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    const h = hostDe(url)
    if (!url || !h || h === propio || HOSTS_QUE_NO_SON_ARTICULO.some((x) => h === x || h.endsWith(`.${x}`)) || o.yaVistas.has(url) || out.includes(url)) continue
    if (!o.nombreCoincide(`${String(r.title ?? '')} ${String(r.description ?? '')}`)) continue
    out.push(url)
    if (out.length >= MAX_ARTICULOS_POR_DIA) break
  }
  return out
}
