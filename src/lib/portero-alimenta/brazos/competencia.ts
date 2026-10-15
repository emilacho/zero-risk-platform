/**
 * BRAZO · COMPETENCIA VIGILADA · PURO.
 *  · Vigila SOLO a los competidores que el DUEÑO confirmó una vez (`config.apify.competidores_confirmados = { en, nombres[] }`); la lista sale del análisis del alta (`competitor_list`), que puede estar equivocada.
 *  · UN competidor por día de semana (lunes a viernes, UTC) con un máximo de 5: el costo y las corridas del día quedan acotados; ninguna familia pasa las 16 corridas diarias del portero ni el tope de US$ 1,50.
 *  · Por competidor, lo que haya: ficha de Mapas (puntaje y reseñas), Instagram (si el dueño dio su cuenta), anuncios en la Biblioteca de Meta y precios de su SITIO PROPIO (no de un directorio).
 *  · Todo archivado con `alcance = competidor`, `propiedad = ajena`, el nombre del competidor en el texto y SIN datos personales (nada de autores de reseñas ni de publicaciones).
 *
 * Medido el 15-oct sobre un competidor de Náufrago: Maps con 20 reseñas US$ 0,015 · Instagram sin cuenta conocida: no se puede pedir · anuncios en Meta US$ 0,09 con 0 filas (el actor cobra un
 * evento de arranque fijo) · sitio propio: no tenía (solo Tripadvisor).
 */
import { normalizar } from '../../manual/texto'
import { clasificarLinea } from '../../cerebro/diario/comparar'
import { contenidoDeSitio } from '../../cerebro/diario/huella'
import { coincidePorPalabra } from '../../texto/coincidencia'
import { DIA_EN_MS, MARCA_DE_BRAZO, slugDe, sinUsuarios, type AccionDeBrazo, type FichaDeBrazo, type ResultadoDeUnBrazo } from './tipos'
import { esFilaDeBrazo, type FilaCrudaDeBrazo } from './demanda'

export const MAX_COMPETIDORES_VIGILADOS = 5
const VIGENCIA_DIAS = 14
/** directorios y redes: la «web» de un competidor que apunta aquí NO es su sitio propio (no se leen precios de ahí) */
export const HOSTS_QUE_NO_SON_SITIO_PROPIO = ['tripadvisor', 'restaurantguru', 'facebook.com', 'instagram.com', 'google.', 'yelp', 'booking.com', 'foursquare', 'tiktok.com', 'youtube.com', 'linktr.ee', 'wa.me', 'whatsapp.com', 'pedidosya', 'rappi', 'ubereats', 'paginasamarillas', 'linkedin.com']
const USD = { mapas: 0.02, instagram: 0.03, anuncios: 0.15, sitio: 0.0536 }

export interface Competidor { nombre: string; slug: string; tipo: string; web: string | null; sitio_propio: string | null; instagram: string | null }
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const ORDEN_DE_TIPO: Record<string, number> = { direct: 0, indirect: 1, alternative: 2 }
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }
const esSitioPropio = (u: string): boolean => { const h = hostDe(u); return !!h && !HOSTS_QUE_NO_SON_SITIO_PROPIO.some((x) => h.includes(x)) }

export interface ListaDeCompetidores { vigilados: Competidor[]; sin_confirmar: string[]; motivo: string | null }
/** los competidores confirmados por el dueño (máx. 5, directos primero); sin confirmación NO hay competidores vigilados */
export function competidoresConfirmados(config: unknown): ListaDeCompetidores {
  const ap = obj(obj(config).apify)
  const crudos = Array.isArray(ap.competitor_list) ? (ap.competitor_list as unknown[]).map(obj) : []
  const conf = obj(ap.competidores_confirmados)
  const nombres = Array.isArray(conf.nombres) ? (conf.nombres as unknown[]).map(txt).filter(Boolean) : []
  if (!crudos.length) return { vigilados: [], sin_confirmar: [], motivo: 'la ficha del cliente no trae lista de competidores (`competitor_list`)' }
  if (!nombres.length || !txt(conf.en)) return { vigilados: [], sin_confirmar: crudos.map((c) => txt(c.name)).filter(Boolean), motivo: 'el dueño todavía no confirmó la lista de competidores (`config.apify.competidores_confirmados`)' }
  const confirmados = new Set(nombres.map(normalizar))
  const vig: Competidor[] = []
  const sin: string[] = []
  for (const c of crudos) {
    const nombre = txt(c.name)
    if (!nombre) continue
    if (!confirmados.has(normalizar(nombre))) { sin.push(nombre); continue }
    const web = txt(c.website) || null
    const ig = txt(c.instagram).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '') || null
    vig.push({ nombre, slug: slugDe(nombre), tipo: txt(c.competitor_type) || 'direct', web, sitio_propio: web && esSitioPropio(web) ? web : null, instagram: ig })
  }
  vig.sort((a, b) => (ORDEN_DE_TIPO[a.tipo] ?? 3) - (ORDEN_DE_TIPO[b.tipo] ?? 3) || (a.slug < b.slug ? -1 : 1))
  return { vigilados: vig.slice(0, MAX_COMPETIDORES_VIGILADOS), sin_confirmar: [...sin, ...vig.slice(MAX_COMPETIDORES_VIGILADOS).map((c) => c.nombre)], motivo: null }
}

/** el día de semana (1 = lunes … 5 = viernes, UTC) que le toca a cada competidor, estable por su posición en la lista ordenada (máximo 5 vigilados: uno por día hábil) */
export const diaDeCompetidor = (indice: number): number => 1 + indice
export function competidoresDelDia(vigilados: Competidor[], ahora: Date): Competidor[] {
  const dia = ahora.getUTCDay()
  return vigilados.filter((_, i) => diaDeCompetidor(i) === dia)
}

export interface EntradaDeAccionesDeCompetencia { vigilados: Competidor[]; ahora: Date; ciudad?: string | null; mercado?: string | null; pais?: string | null; forzar?: boolean }
export function accionesDeCompetencia(e: EntradaDeAccionesDeCompetencia): AccionDeBrazo[] {
  const donde = txt(e.ciudad) || txt(e.mercado)
  const pais = (txt(e.pais).length === 2 ? txt(e.pais) : 'EC').toUpperCase()
  const hoy = e.forzar ? e.vigilados : competidoresDelDia(e.vigilados, e.ahora)
  const meta = { target_kind: 'third_party' as const, llamado_por: 'portero-alimentar' }
  const out: AccionDeBrazo[] = []
  for (const c of hoy) {
    const m = (tipo: string) => ({ [MARCA_DE_BRAZO]: `competencia:${c.slug}:${tipo}` })
    out.push({ fuente: 'competencia', funcion: 'google_maps_scraper', params: { searchStringsArray: [c.nombre], locationQuery: donde, resultsLimit: 1, language: 'es', ...m('mapas') }, metadata: meta, usd_max: USD.mapas, medido: true, objetivo: `${c.nombre} · Maps` })
    if (c.instagram) out.push({ fuente: 'competencia', funcion: 'instagram_scraper', params: { usernames: [c.instagram], resultsLimit: 6, ...m('instagram') }, metadata: meta, usd_max: USD.instagram, medido: false, objetivo: `${c.nombre} · @${c.instagram}` })
    out.push({ fuente: 'competencia', funcion: 'facebook_ads_library_scraper', params: { searchTerms: [c.nombre], countryCode: pais, maxItems: 20, ...m('anuncios') }, metadata: meta, usd_max: USD.anuncios, medido: false, objetivo: `${c.nombre} · anuncios Meta` })
    if (c.sitio_propio) out.push({ fuente: 'competencia', funcion: 'competitor_website_scraper', params: { startUrls: [{ url: c.sitio_propio }], maxCrawlPages: 3, ...m('sitio') }, metadata: meta, usd_max: USD.sitio, medido: true, objetivo: c.sitio_propio })
  }
  return out
}

const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const coma = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',')
const marca = (f: FilaCrudaDeBrazo): { slug: string; tipo: string } | null => {
  const m = String(obj(f.params)[MARCA_DE_BRAZO] ?? '').match(/^competencia:([a-z0-9-]+):(mapas|instagram|anuncios|sitio)$/)
  return m ? { slug: m[1], tipo: m[2] } : null
}

export interface EntradaDeFichasDeCompetencia { client_id: string; vigilados: Competidor[]; filas: FilaCrudaDeBrazo[] }
export function fichasDeCompetencia(e: EntradaDeFichasDeCompetencia): ResultadoDeUnBrazo {
  const declarado: string[] = []
  const fichas: FichaDeBrazo[] = []
  const nuevas = new Map<string, FilaCrudaDeBrazo>()
  for (const f of e.filas.filter((x) => esFilaDeBrazo(x, 'competencia:')).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    const m = marca(f)
    if (m && !nuevas.has(`${m.slug}|${m.tipo}`)) nuevas.set(`${m.slug}|${m.tipo}`, f)
  }
  for (const c of e.vigilados) {
    const comun = { brazo: 'competencia' as const, alcance: 'competidor' as const, client_id: e.client_id, origen: 'tercero' as const, sobre: c.nombre, decision: 'reemplaza' as const }
    const base = (f: FilaCrudaDeBrazo, tipo: string, extra: Pick<FichaDeBrazo, 'clase' | 'titulo' | 'contenido' | 'fuente_url'>): FichaDeBrazo => ({
      ...comun, ...extra, ref: `brazo:competencia:${c.slug}:${tipo}:${f.created_at.slice(0, 10)}`, atributo: `competidor:${c.slug}:${tipo}`, fecha_fuente: f.created_at.slice(0, 10), observado_en: f.created_at,
      vigente_hasta: new Date(new Date(f.created_at).getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString(),
    })
    const sello = (f: FilaCrudaDeBrazo) => `Dato de un competidor, no del cliente. Observado ${f.created_at.slice(0, 10)}.`

    const fm = nuevas.get(`${c.slug}|mapas`)
    if (fm) {
      // la búsqueda por nombre devuelve homónimos: solo cuenta la ficha cuyo título trae el nombre del competidor (palabras enteras)
      const it = lista(fm.respuesta).find((x) => coincidePorPalabra(txt(x.title), c.nombre))
      if (!it) declarado.push(`${c.nombre}: Maps no trajo una ficha con ese nombre (no se archiva un homónimo)`)
      else {
        const p = num(it.totalScore), n = num(it.reviewsCount)
        fichas.push(base(fm, 'mapas', {
          clase: 'competidor_mapas', titulo: `Competidor · ${c.nombre} · Mapas`, fuente_url: txt(it.url) || null,
          contenido: `«${c.nombre}» (competidor) en Google Maps: ${p !== null ? `puntaje ${coma(p)}` : 'sin puntaje'}, ${n ?? 0} reseñas${txt(it.categoryName) ? `, categoría ${txt(it.categoryName)}` : ''}${txt(it.address) ? `, ${sinUsuarios(it.address, 120)}` : ''}. ${sello(fm)}`,
        }))
      }
    } else declarado.push(`${c.nombre}: sin corrida de Maps todavía`)

    const fi = nuevas.get(`${c.slug}|instagram`)
    if (fi) {
      const it = lista(fi.respuesta).find((x) => normalizar(txt(x.username) || txt(x.ownerUsername)) === normalizar(c.instagram ?? ''))
      if (!it) declarado.push(`${c.nombre}: Instagram no trajo la cuenta @${c.instagram} (cuenta privada o inexistente)`)
      else {
        const posts = lista(it.latestPosts)
        const pies = posts.map((p) => sinUsuarios(p.caption, 110)).filter(Boolean).slice(0, 3)
        fichas.push(base(fi, 'instagram', {
          clase: 'competidor_instagram', titulo: `Competidor · ${c.nombre} · Instagram`, fuente_url: `https://www.instagram.com/${c.instagram}/`,
          contenido: `«${c.nombre}» (competidor) en Instagram @${c.instagram}: ${num(it.followersCount) ?? 's/d'} seguidores, ${num(it.postsCount) ?? 's/d'} publicaciones. `
            + `${pies.length ? `Últimas publicaciones (texto recortado, sin usuarios): ${pies.map((p) => `«${p}»`).join(' · ')}. ` : ''}${sello(fi)}`,
        }))
      }
    }

    const fa = nuevas.get(`${c.slug}|anuncios`)
    if (fa) {
      const filas = lista(fa.respuesta).filter((x) => !('error' in x))
      const muestra = filas.map((x) => sinUsuarios(x.adBody ?? x.ad_creative_body ?? x.body ?? x.text, 110)).filter(Boolean).slice(0, 3)
      fichas.push(base(fa, 'anuncios', {
        clase: 'competidor_anuncios', titulo: `Competidor · ${c.nombre} · Anuncios en Meta`, fuente_url: null,
        contenido: filas.length
          ? `«${c.nombre}» (competidor): ${filas.length} anuncio(s) encontrados en la Biblioteca de anuncios de Meta por búsqueda de su nombre. ${muestra.length ? `Textos: ${muestra.map((m) => `«${m}»`).join(' · ')}. ` : ''}La búsqueda es por palabra: puede incluir anuncios de otros que solo lo nombran. ${sello(fa)}`
          : `«${c.nombre}» (competidor): 0 anuncios en la Biblioteca de anuncios de Meta para su nombre (no pauta ahí, o la biblioteca no lo muestra para ese país). ${sello(fa)}`,
      }))
    }

    const fs = nuevas.get(`${c.slug}|sitio`)
    if (fs && c.sitio_propio) {
      const paginas = lista(fs.respuesta).map((p) => ({ url: txt(p.url), text: p.text }))
      const lineas = contenidoDeSitio(paginas).lineas.filter((l) => clasificarLinea(l) === 'precio').slice(0, 12)
      if (lineas.length) {
        fichas.push(base(fs, 'precios', {
          clase: 'competidor_precios', titulo: `Competidor · ${c.nombre} · Precios de su sitio`, fuente_url: c.sitio_propio,
          contenido: `Precios publicados por «${c.nombre}» (competidor) en su sitio ${c.sitio_propio}: ${lineas.join(' · ')}. ${sello(fs)}`,
        }))
      } else declarado.push(`${c.nombre}: su sitio no mostró líneas de precio legibles (puede estar en imagen o PDF)`)
    } else if (!c.sitio_propio) declarado.push(`${c.nombre}: no tiene sitio propio conocido (su «web» es un directorio o falta): no se leen precios`)
  }
  return { brazo: 'competencia', estado: fichas.length ? 'listo' : 'sin_material', fichas, declarado }
}
