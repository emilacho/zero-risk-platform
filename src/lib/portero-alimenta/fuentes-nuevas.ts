/**
 * LAS SEIS FUENTES NUEVAS DEL CEREBRO · 02-nov (firma de Emilio «activa ya 1, 2, 4, 6, 7, 8» · prioridad: que todo quede BIEN integrado, antes que barato).
 * Cada fuente es un PASO diario del portero (rastro propio en `cerebro_pasos_diarios`, ver `pasos-diarios.ts`), una vez por corrida, y todo termina como FICHAS del cerebro con su fuente, su fecha real,
 * su origen y su alcance (el nivel del embudo sale del alcance, ver `embudo.ts`). El cerebro solo guarda y entrega: aquí no se redacta ningún informe.
 *
 *  · anuncios_google      · anuncios de la competencia en Google y YouTube (Centro de transparencia de anuncios) · clase `competidor_anuncios_google` · alcance competidor
 *  · busquedas_google     · interés de búsqueda del rubro en el país (Google Trends)                              · clase `tendencia_busqueda`         · alcance país
 *  · horas_de_mas_gente   · horas de más gente en Mapas (del raspado de Mapas que YA existe: US$ 0 de Apify)        · clase `horas_de_mas_gente` / `competidor_horas_de_mas_gente`
 *  · eventos_locales      · eventos de las ciudades del cliente (fecha futura)                                      · clase `evento_local`               · alcance país
 *  · comentarios_ig_fb    · comentarios de Instagram y Facebook de la competencia, UNA vez por publicación         · clase `competidor_comentarios`     · alcance competidor
 *  · foros                · hilos y comentarios de Reddit sobre el rubro y el país                                  · clase `foro`                       · alcance mercado (voz del público)
 *
 * Reglas duras que viven aquí y se prueban:
 *  · nada de un tercero es dato del cliente: cada ficha lleva su alcance y el nombre de quien la origina; lo que no se puede atribuir se descarta y se CUENTA;
 *  · un anuncio solo vale si su dominio es el del competidor (no un homónimo); un hilo solo vale si habla del rubro Y del lugar; un evento solo vale si cae en una ciudad del cliente y es futuro;
 *  · sin datos personales: nunca el nombre de quien publicó o comentó, y se quitan @usuarios;
 *  · cada fuente respeta un tope por llamada y un tope por paso; lo que falla se DICE en `errores`, no se oculta.
 */
import { normalizar, contenidoDe } from '../manual/texto'
import { coincidePorPalabra } from '../texto/coincidencia'
import { paisIsoDe } from '../cerebro/zona'
import { leerTodas } from './paginar'
import { archivarFichasDeBrazos, type ResultadoDeArchivo } from './brazos/archivo'
import { HOSTS_QUE_NO_SON_SITIO_PROPIO } from './brazos/competencia'
import { DIA_EN_MS, slugDe, sinUsuarios, type FichaDeBrazo, type NombreDeBrazo } from './brazos/tipos'

type Obj = Record<string, unknown>
export type Db = { from(tabla: string): any }
export type Ejecutar = (actor: string, input: Obj, maxUsd: number) => Promise<{ items: unknown[]; costo_usd: number }>

export const FUENTES_NUEVAS = ['anuncios_google', 'busquedas_google', 'horas_de_mas_gente', 'eventos_locales', 'comentarios_ig_fb', 'foros'] as const
export type FuenteNueva = (typeof FUENTES_NUEVAS)[number]
export const esFuenteNueva = (v: unknown): v is FuenteNueva => typeof v === 'string' && (FUENTES_NUEVAS as readonly string[]).includes(v)

/** interruptor: ENCENDIDAS por firma de Emilio (02-nov); `PORTERO_FUENTES_NUEVAS=off` las apaga sin tocar el resto */
export const fuentesNuevasEncendidas = (env: Record<string, string | undefined> = process.env): boolean => String(env.PORTERO_FUENTES_NUEVAS ?? 'on').trim().toLowerCase() !== 'off'

/** la clase de cada fuente: lo que la consulta, el resumen vivo y la mesa de análisis piden por nombre */
export const CLASES_NUEVAS = {
  anuncios: 'competidor_anuncios_google',
  busqueda: 'tendencia_busqueda',
  horas_propias: 'horas_de_mas_gente',
  horas_competencia: 'competidor_horas_de_mas_gente',
  evento: 'evento_local',
  comentarios: 'competidor_comentarios',
  foro: 'foro',
} as const

export const ACTORES_DE_FUENTES = {
  anuncios_google: 'scrapesage~google-ads-transparency-scraper',
  busquedas_google: 'apify~google-trends-scraper',
  busquedas_respaldo: 'data_xplorer~google-trends-fast-scraper',
  eventos_locales: 'muhammadafzal~google-events',
  foros: 'harshmaur~reddit-scraper',
} as const

/** topes: por llamada y por paso (US$). Medidos el 02-nov con llamadas reales; el plan de Apify se informa aparte */
export const TOPE_POR_LLAMADA_USD = { anuncios_google: 0.06, busquedas_google: 0.05, eventos_locales: 0.08, foros: 0.08 } as const
export const TOPE_POR_PASO_USD = { anuncios_google: 0.4, busquedas_google: 0.1, eventos_locales: 0.3, foros: 0.2 } as const
export const MAX_COMPETIDORES_CON_ANUNCIOS = 8
export const ANUNCIOS_POR_COMPETIDOR = 10
export const MAX_CIUDADES = 3
/** eventos: una llamada por ciudad tarda 30-100 s y el paso vive 300 s: como máximo dos ciudades por paso */
export const MAX_CIUDADES_DE_EVENTOS = 2
export const DIAS_ADELANTE_DE_EVENTOS = 120
export const DIAS_ATRAS_DE_FOROS = 180
export const COMENTARIOS_POR_FICHA = 15

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Obj[]) : [])
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null }
const dia = (iso: string | null | undefined): string => (iso ?? '').slice(0, 10)
const fechaIso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v))
  const d = new Date(n)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}
const corto = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const mismoNegocio = (a: string, b: string) => !!a && !!b && (coincidePorPalabra(a, b) || coincidePorPalabra(b, a))
const hostDe = (u: string): string => { try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() } catch { return '' } }

const NOMBRE_DEL_PAIS: Record<string, string> = { ec: 'Ecuador', co: 'Colombia', pe: 'Perú', mx: 'México', ar: 'Argentina', cl: 'Chile', uy: 'Uruguay', py: 'Paraguay', bo: 'Bolivia', es: 'España' }

// ───────────────────────────── los datos del cliente que las fuentes necesitan ─────────────────────────────

export interface CompetidorDeFuente { nombre: string; slug: string; dominio: string | null; instagram: string | null; facebook: string | null }
export interface DatosDelCliente {
  clientId: string
  nombre: string
  /** el rubro tal como lo dice la ficha */
  rubro: string
  /** el término corto con el que se busca (≤3 palabras) */
  termino: string | null
  iso: string | null
  pais: string | null
  ciudades: string[]
  competidores: CompetidorDeFuente[]
}

const ENLACES = new Set(['de', 'del', 'la', 'el', 'las', 'los', 'para', 'con', 'en', 'y', 'e', 'a', 'por'])
/** «seguridad industrial y protección contra incendios (extintores) · B2B» → «seguridad industrial»; «restaurante de mariscos costero ecuatoriano» → «restaurante de mariscos» */
export function terminoDelRubro(rubro: unknown): string | null {
  const primera = txt(rubro).split(/[·(,;:|]| y /i)[0] ?? ''
  const w = primera.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, 3)
  // una palabra de enlace al final («software CRM para», «tienda online de») no es parte del término
  while (w.length > 1 && ENLACES.has(normalizar(w[w.length - 1]))) w.pop()
  const t = w.join(' ').trim()
  return t.length >= 4 && normalizar(t) !== 'unknown' ? t : null
}

const limpiaManejo = (v: unknown): string | null => {
  const h = txt(v).replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram|facebook|fb)\.com\//i, '').replace(/[/?#].*$/, '')
  return h || null
}

/** los competidores de la ficha (`competitor_list` + agregados − vetados), con el dominio de su sitio propio y sus cuentas */
export function competidoresDeLaFicha(config: unknown): CompetidorDeFuente[] {
  const ap = obj(obj(config).apify)
  const vetados = new Set((Array.isArray(ap.competidores_vetados) ? (ap.competidores_vetados as unknown[]) : []).map((n) => normalizar(txt(n))).filter(Boolean))
  const out: CompetidorDeFuente[] = []
  for (const c of [...arr(ap.competitor_list), ...arr(ap.competidores_agregados)]) {
    const nombre = txt(c.name)
    if (!nombre || vetados.has(normalizar(nombre))) continue
    const h = obj(c.handles)
    const web = txt(c.website) || txt(c.url) || txt(c.web)
    const host = web ? hostDe(web) : ''
    const dominio = host && !HOSTS_QUE_NO_SON_SITIO_PROPIO.some((x) => host.includes(x)) ? host : null
    out.push({ nombre, slug: slugDe(nombre), dominio, instagram: limpiaManejo(c.instagram ?? h.instagram), facebook: limpiaManejo(c.facebook ?? h.facebook) })
  }
  const vistos = new Set<string>()
  return out.filter((c) => (vistos.has(c.slug) ? false : (vistos.add(c.slug), true)))
}

export function datosDelCliente(cliente: Obj, clientId: string, ciudadesDeSedes: string[]): DatosDelCliente {
  const cfg = obj(cliente.config)
  const iso = paisIsoDe(cliente.country ?? cliente.pais, cliente.market)
  const gusto = obj(cfg.apify).ciudades_de_gusto
  const deGusto = (Array.isArray(gusto) ? gusto : []).map((g) => (typeof g === 'string' ? g : txt(obj(g).ciudad) || txt(obj(g).name))).filter(Boolean)
  const delMercado = txt(cliente.market).split(/[,·]/)[0] ?? ''
  const vistas = new Set<string>()
  const ciudades = [...ciudadesDeSedes, ...deGusto, delMercado].map((c) => c.trim()).filter((c) => c && !vistas.has(normalizar(c)) && (vistas.add(normalizar(c)), true)).slice(0, MAX_CIUDADES)
  const rubro = txt(cliente.industry)
  return { clientId, nombre: txt(cliente.name), rubro, termino: terminoDelRubro(rubro), iso, pais: iso ? (NOMBRE_DEL_PAIS[iso] ?? null) : null, ciudades, competidores: competidoresDeLaFicha(cliente.config) }
}

type Ctx = { clientId: string; ahora: Date }
const base = (brazo: NombreDeBrazo, alcance: FichaDeBrazo['alcance'], ctx: Ctx): Pick<FichaDeBrazo, 'brazo' | 'alcance' | 'client_id' | 'observado_en' | 'decision' | 'origen'> => ({ brazo, alcance, client_id: ctx.clientId, observado_en: ctx.ahora.toISOString(), decision: 'suma', origen: 'tercero' })

// ───────────────────────────── 1 · anuncios de la competencia en Google y YouTube ─────────────────────────────

export const pedidoDeAnuncios = (dominio: string, iso: string | null): Obj => ({ domains: [dominio], region: iso ? iso.toUpperCase() : 'ANYWHERE', maxAdsPerSearch: ANUNCIOS_POR_COMPETIDOR, includeAdText: true, resultType: 'ads' })

export interface InformeDeAnuncios { recibidos: number; de_otro_dominio: number; sin_identificador: number }
export function fichasDeAnuncios(items: unknown[], c: CompetidorDeFuente, ctx: Ctx): { fichas: FichaDeBrazo[]; informe: InformeDeAnuncios } {
  const informe: InformeDeAnuncios = { recibidos: items.length, de_otro_dominio: 0, sin_identificador: 0 }
  const fichas: FichaDeBrazo[] = []
  for (const it of arr(items)) {
    const dom = hostDe(txt(it.domain))
    if (!c.dominio || !dom || !(dom === c.dominio || dom.endsWith(`.${c.dominio}`))) { informe.de_otro_dominio++; continue }
    const id = txt(it.creativeId)
    if (!id) { informe.sin_identificador++; continue }
    const primera = fechaIso(it.firstShown), ultima = fechaIso(it.lastShown)
    const formato = txt(it.format).toLowerCase()
    const lineas = (Array.isArray(it.adTextLines) ? (it.adTextLines as unknown[]) : []).map(txt).filter(Boolean)
    const texto = corto(sinUsuarios([txt(it.adHeadline), txt(it.adDescription), ...lineas].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · '), 400), 300)
    const dondeSale = formato === 'video' ? 'video (YouTube)' : formato === 'text' ? 'texto (buscador de Google)' : formato === 'image' ? 'imagen (red de display de Google)' : formato || 'formato sin dato'
    const dias = num(it.shownForDays)
    const pais = txt(it.region)
    const url = txt(it.adUrl) || null
    const contenido = `Competidor ${c.nombre} · anuncio en Google: ${dondeSale}${texto ? ` · texto: «${texto}»` : ' · sin texto legible'} · anunciante ${txt(it.advertiserName) || c.nombre}${pais ? ` · país ${pais}` : ''} · se mostró desde ${dia(primera) || 'fecha sin dato'} hasta ${dia(ultima) || 'fecha sin dato'}${dias !== null ? ` (${dias} días)` : ''}${url ? ` · ver en la biblioteca de Google: ${url}` : ''}`
    fichas.push({
      ...base('anuncios_google', 'competidor', ctx), ref: `brazo:anuncios_google:${ctx.clientId}:${id}`, atributo: `anuncio_google:${c.slug}:${id}`, clase: CLASES_NUEVAS.anuncios,
      titulo: `Competidor · ${c.nombre} · Anuncio en Google (${formato || 'sin formato'})`, contenido, fuente_url: url, fecha_fuente: primera, vigente_hasta: new Date(Math.max(Date.parse(ultima ?? '') || 0, ctx.ahora.getTime()) + 30 * DIA_EN_MS).toISOString(), sobre: c.nombre,
      datos: { competidor: c.nombre, dominio: c.dominio, formato, pais, anuncio_id: id, ultima_vez_visto: ultima, ...(txt(it.imageUrl) ? { imagen_url: txt(it.imageUrl) } : {}), ...(txt(it.previewUrl) ? { vista_previa_url: txt(it.previewUrl) } : {}) },
    })
  }
  return { fichas, informe }
}

// ───────────────────────────── 2 · interés de búsqueda del rubro (Google Trends) ─────────────────────────────

export const pedidoDeBusqueda = (termino: string, iso: string): Obj => ({ searchTerms: [termino], geo: iso.toUpperCase(), timeRange: 'today 3-m', viewedFrom: iso.toLowerCase(), maxItems: 3 })

export const pedidoDeBusquedaRespaldo = (termino: string, iso: string): Obj => ({ mode: 'keyword', keyword: termino, predefinedTimeframe: 'today 3-m', geo: iso.toUpperCase(), fetchRegionalData: true })
/** el respaldo trae otra forma (serie por día y regiones con rango): se pasa a la del actor oficial para armar UNA sola ficha */
export function desdeElRespaldoDeBusquedas(it: unknown): Obj {
  const x = obj(it)
  const serie = obj(Object.values(obj(x.timeline_data))[0])
  return {
    interestOverTime_timelineData: Object.entries(serie).map(([f, v]) => ({ time: String(Date.parse(`${f}T00:00:00Z`) / 1000), value: [num(v) ?? 0], hasData: [(num(v) ?? 0) > 0] })),
    interestBySubregion: arr(x.region_data).map((r) => ({ geoName: txt(r.region), value: [num(r.value) ?? 0], hasData: [(num(r.value) ?? 0) > 0] })),
    interestByCity: [], relatedQueries_top: [], relatedQueries_rising: [],
  }
}
const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const valorDe = (v: unknown): number | null => (Array.isArray(v) ? num(v[0]) : num(v))
const conDato = (x: Obj): boolean => (Array.isArray(x.hasData) ? x.hasData[0] === true : x.hasData === true) && (valorDe(x.value) ?? 0) > 0

/** una ficha del interés de búsqueda: semanas, pico, cambio, zonas y búsquedas relacionadas/en subida. Sin volumen (todo en cero) NO es una tendencia: no se archiva. */
export function fichaDeBusqueda(items: unknown[], d: DatosDelCliente, ctx: Ctx): { ficha: FichaDeBrazo | null; motivo: string | null } {
  const it = arr(items)[0]
  if (!it || !d.termino || !d.iso) return { ficha: null, motivo: 'la fuente no devolvió datos' }
  const dias = arr(it.interestOverTime_timelineData).map((x) => ({ f: fechaIso(num(x.time)), v: valorDe(x.value) ?? 0 })).filter((x): x is { f: string; v: number } => !!x.f).map((x) => ({ f: dia(x.f), v: x.v })).sort((a, b) => (a.f < b.f ? -1 : 1))
  if (!dias.length) return { ficha: null, motivo: 'la serie vino vacía' }
  if (!dias.some((x) => x.v > 0)) return { ficha: null, motivo: 'volumen de búsqueda demasiado bajo para medirse (todo en cero)' }
  const semanas: number[] = []
  for (let i = dias.length; i > 0; i -= 7) semanas.unshift(Math.round(promedio(dias.slice(Math.max(0, i - 7), i).map((x) => x.v))))
  const ult = promedio(semanas.slice(-4)), ant = promedio(semanas.slice(-8, -4))
  const pico = dias.reduce((m, x) => (x.v > m.v ? x : m), dias[0])
  const cambio = ant > 0 ? Math.round(((ult - ant) / ant) * 100) : null
  const nombreDe = (x: Obj) => txt(x.geoName).replace(/ Province$/, '')
  const zonas = arr(it.interestBySubregion).filter(conDato).sort((a, b) => (valorDe(b.value) ?? 0) - (valorDe(a.value) ?? 0)).slice(0, 5).map((x) => `${nombreDe(x)} ${valorDe(x.value)}`)
  const ciudades = arr(it.interestByCity).filter(conDato).sort((a, b) => (valorDe(b.value) ?? 0) - (valorDe(a.value) ?? 0)).slice(0, 5).map((x) => `${nombreDe(x)} ${valorDe(x.value)}`)
  const delCliente = d.ciudades.map((c) => [...arr(it.interestBySubregion), ...arr(it.interestByCity)].find((x) => conDato(x) && (normalizar(nombreDe(x)).includes(normalizar(c)) || normalizar(c).includes(normalizar(nombreDe(x)))))).filter((x): x is Obj => !!x).map((x) => `${nombreDe(x)} ${valorDe(x.value)}`)
  const relacionadas = arr(it.relatedQueries_top).slice(0, 6).map((x) => txt(x.query)).filter(Boolean)
  const ensubida = arr(it.relatedQueries_rising).slice(0, 6).map((x) => `${txt(x.query)} (${txt(x.formattedValue) || num(x.value)})`).filter((x) => x.trim() !== '()')
  const pais = d.pais ?? d.iso.toUpperCase()
  const url = `https://trends.google.com/trends/explore?date=today%203-m&geo=${d.iso.toUpperCase()}&q=${encodeURIComponent(d.termino)}`
  const contenido = `Interés de búsqueda en Google de «${d.termino}» en ${pais}, últimos 3 meses (${dias[0].f} a ${dias[dias.length - 1].f}; escala 0-100, 100 = el día de más búsquedas): ${cambio === null ? 'sin base de comparación con las 4 semanas anteriores' : `las últimas 4 semanas ${cambio >= 0 ? 'suben' : 'bajan'} ${Math.abs(cambio)} % frente a las 4 anteriores`} · pico ${pico.f} (${pico.v}) · promedio semanal (de la más antigua a la más reciente): ${semanas.join(', ')} · zonas con más interés: ${zonas.length ? zonas.join(', ') : 'sin dato'}${ciudades.length ? ` · ciudades: ${ciudades.join(', ')}` : ''}${delCliente.length ? ` · en las zonas del cliente: ${delCliente.join(', ')}` : ''} · búsquedas relacionadas: ${relacionadas.length ? relacionadas.join('; ') : 'sin dato'} · en subida: ${ensubida.length ? ensubida.join('; ') : 'sin dato'}`
  return {
    motivo: null,
    ficha: {
      ...base('busquedas_google', 'pais', ctx), origen: 'plataforma', ref: `brazo:busquedas_google:${ctx.clientId}:${slugDe(d.termino)}:${d.iso}:${dia(ctx.ahora.toISOString())}`, atributo: `busqueda:${slugDe(d.termino)}:${d.iso}`, clase: CLASES_NUEVAS.busqueda,
      titulo: `Tendencia de búsqueda · ${d.termino} · ${pais}`, contenido, fuente_url: url, fecha_fuente: `${dias[dias.length - 1].f}T00:00:00.000Z`, vigente_hasta: new Date(ctx.ahora.getTime() + 14 * DIA_EN_MS).toISOString(), decision: 'reemplaza', sobre: pais,
      datos: { termino: d.termino, pais: d.iso, semanas, cambio_pct: cambio, pico_dia: pico.f, pico_valor: pico.v, relacionadas, en_subida: ensubida },
    },
  }
}

// ───────────────────────────── 3 · horas de más gente en Mapas (del raspado que ya existe) ─────────────────────────────

const DIAS_DE_LA_SEMANA: Array<[string, string]> = [['Mo', 'lunes'], ['Tu', 'martes'], ['We', 'miércoles'], ['Th', 'jueves'], ['Fr', 'viernes'], ['Sa', 'sábado'], ['Su', 'domingo']]
const hora = (h: number) => `${String(h).padStart(2, '0')}h`

export function textoDeHoras(hist: unknown): string | null {
  const h = obj(hist)
  const partes: string[] = []
  for (const [k, nombre] of DIAS_DE_LA_SEMANA) {
    const v = arr(h[k]).map((x) => ({ h: num(x.hour), p: num(x.occupancyPercent) })).filter((x): x is { h: number; p: number } => x.h !== null && x.p !== null && x.p > 0)
    if (!v.length) continue
    const top = [...v].sort((a, b) => b.p - a.p || a.h - b.h).slice(0, 3).sort((a, b) => a.h - b.h)
    partes.push(`${nombre} ${top.map((x) => `${hora(x.h)} (${x.p} %)`).join(', ')}`)
  }
  return partes.length ? partes.join(' · ') : null
}

export interface FilaCruda { apify_function?: unknown; respuesta?: unknown; created_at?: unknown; ensayo?: unknown }
export interface InformeDeHoras { lugares_con_horas: number; propios: number; competencia: number; sin_atribuir: number }
/** las horas de más gente de la ficha propia confirmada y de cada competidor, leídas del raspado de Mapas que ya está en `apify_raw` */
export function fichasDeHoras(filas: FilaCruda[], d: DatosDelCliente, ctx: Ctx): { fichas: FichaDeBrazo[]; informe: InformeDeHoras } {
  const informe: InformeDeHoras = { lugares_con_horas: 0, propios: 0, competencia: 0, sin_atribuir: 0 }
  const fichas: FichaDeBrazo[] = []
  const vistos = new Set<string>()
  const ordenadas = [...filas].filter((f) => f.ensayo !== true).sort((a, b) => (txt(b.created_at) < txt(a.created_at) ? -1 : 1))
  for (const f of ordenadas) {
    for (const it of arr(f.respuesta)) {
      const histograma = it.popularTimesHistogram
      const texto = textoDeHoras(histograma)
      const titulo = txt(it.title)
      if (!texto || !titulo) continue
      const lugar = slugDe(`${titulo}-${txt(it.city) || txt(it.address)}`)
      if (vistos.has(lugar)) continue
      const propio = f.apify_function === 'own_google_maps_profile' && mismoNegocio(titulo, d.nombre)
      const comp = propio ? undefined : d.competidores.find((c) => mismoNegocio(titulo, c.nombre))
      if (!propio && !comp) { informe.sin_atribuir++; continue }
      vistos.add(lugar)
      informe.lugares_con_horas++
      if (propio) informe.propios++; else informe.competencia++
      const ciudad = txt(it.city) || null
      const observado = fechaIso(f.created_at) ?? ctx.ahora.toISOString()
      fichas.push({
        ...base('horas', propio ? 'cliente' : 'competidor', ctx), origen: 'plataforma', ref: `brazo:horas:${ctx.clientId}:${lugar}`, atributo: `horas_de_mas_gente:${lugar}`, clase: propio ? CLASES_NUEVAS.horas_propias : CLASES_NUEVAS.horas_competencia,
        titulo: `${propio ? 'Horas de más gente' : `Competidor · ${comp!.nombre} · Horas de más gente`} · ${titulo}${ciudad ? ` (${ciudad})` : ''}`,
        contenido: `${propio ? 'Horas de más gente en la ficha de Mapas del cliente' : `Competidor ${comp!.nombre}: horas de más gente en su ficha de Mapas`} «${titulo}»${ciudad ? ` en ${ciudad}` : ''} (las tres horas más llenas de cada día, % de ocupación): ${texto}`,
        fuente_url: txt(it.url) || null, fecha_fuente: observado, vigente_hasta: new Date(ctx.ahora.getTime() + 60 * DIA_EN_MS).toISOString(), decision: 'reemplaza', renueva_vigencia: true, sobre: propio ? d.nombre : comp!.nombre,
        datos: { lugar: titulo, ...(ciudad ? { ciudad } : {}), ...(propio ? {} : { competidor: comp!.nombre }) },
      })
    }
  }
  return { fichas, informe }
}

// ───────────────────────────── 4 · eventos locales de las ciudades del cliente ─────────────────────────────

export const pedidoDeEventos = (ciudad: string, pais: string | null): Obj => ({ searchQueries: ['eventos', 'festival feria concierto'], location: `${ciudad}${pais ? `, ${pais}` : ''}`, maxResults: 12 })

export interface InformeDeEventos { recibidos: number; fuera_de_la_ciudad: number; sin_fecha_o_pasados: number; muy_lejanos: number }
export function fichasDeEventos(items: unknown[], ciudad: string, pais: string | null, ctx: Ctx): { fichas: FichaDeBrazo[]; informe: InformeDeEventos } {
  const informe: InformeDeEventos = { recibidos: items.length, fuera_de_la_ciudad: 0, sin_fecha_o_pasados: 0, muy_lejanos: 0 }
  const fichas: FichaDeBrazo[] = []
  const limite = ctx.ahora.getTime() + DIAS_ADELANTE_DE_EVENTOS * DIA_EN_MS
  for (const it of arr(items)) {
    const titulo = txt(it.title)
    const inicio = fechaIso(txt(it.startDate) ? `${txt(it.startDate)}${/Z|[+-]\d\d:?\d\d$/.test(txt(it.startDate)) ? '' : 'Z'}` : null)
    if (!titulo || !inicio) { informe.sin_fecha_o_pasados++; continue }
    const t = Date.parse(inicio)
    // la hora local no trae zona: se acepta el día completo de hoy
    if (t < ctx.ahora.getTime() - DIA_EN_MS) { informe.sin_fecha_o_pasados++; continue }
    if (t > limite) { informe.muy_lejanos++; continue }
    const donde = `${txt(it.venue)} ${txt(it.address)}`
    if (!normalizar(donde).includes(normalizar(ciudad))) { informe.fuera_de_la_ciudad++; continue }
    const fin = fechaIso(txt(it.endDate))
    const lugar = [txt(it.venue), txt(it.address)].filter(Boolean).join(', ')
    const dd = dia(inicio)
    fichas.push({
      ...base('eventos', 'pais', ctx), ref: `brazo:evento:${ctx.clientId}:${slugDe(ciudad)}:${slugDe(titulo)}:${dd}`, atributo: `evento:${slugDe(ciudad)}:${slugDe(titulo)}:${dd}`, clase: CLASES_NUEVAS.evento,
      titulo: `Evento en ${ciudad} · ${corto(titulo, 80)} · ${dd}`,
      contenido: `Evento en ${ciudad}${pais ? ` (${pais})` : ''}: ${titulo} · fecha ${dd}${txt(it.startDate).includes('T') ? ` ${txt(it.startDate).split('T')[1].slice(0, 5)} (hora local)` : ''}${txt(it.eventType) ? ` · tipo ${txt(it.eventType)}` : ''}${lugar ? ` · lugar ${lugar}` : ''}${txt(it.organizer) ? ` · organiza ${sinUsuarios(txt(it.organizer), 80)}` : ''}`,
      fuente_url: txt(it.ticketUrl) || null, fecha_fuente: inicio, vigente_hasta: new Date((fin ? Date.parse(fin) : t) + DIA_EN_MS).toISOString(), sobre: ciudad,
      datos: { ciudad, fecha_evento: dd, ...(txt(it.venue) ? { lugar: txt(it.venue) } : {}), ...(txt(it.eventType) ? { tipo: txt(it.eventType) } : {}) },
    })
  }
  return { fichas, informe }
}

// ───────────────────────────── 5 · comentarios de Instagram y Facebook de la competencia (una ficha por publicación) ─────────────────────────────

export interface FilaDeComentario { red?: unknown; cuenta?: unknown; post_ref?: unknown; post_url?: unknown; comentario_ref?: unknown; texto?: unknown; me_gusta?: unknown; fecha_comentario?: unknown }
const NOMBRE_DE_RED: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X' }
export interface InformeDeComentariosFichados { comentarios: number; publicaciones: number; sin_competidor: number }
/** una ficha por publicación: sus comentarios con fecha real, sin nombres ni @usuarios. Ya leída = ya fichada: no se repite */
export function fichasDeComentarios(filas: FilaDeComentario[], d: DatosDelCliente, ctx: Ctx): { fichas: FichaDeBrazo[]; informe: InformeDeComentariosFichados } {
  const informe: InformeDeComentariosFichados = { comentarios: filas.length, publicaciones: 0, sin_competidor: 0 }
  const grupos = new Map<string, FilaDeComentario[]>()
  for (const f of filas) { const k = `${txt(f.red)}|${txt(f.cuenta).toLowerCase()}|${txt(f.post_ref)}`; if (!txt(f.red) || !txt(f.post_ref) || !txt(f.texto)) continue; grupos.set(k, [...(grupos.get(k) ?? []), f]) }
  const fichas: FichaDeBrazo[] = []
  for (const [k, cs] of grupos) {
    const [red, cuenta, post] = k.split('|')
    const comp = d.competidores.find((c) => [c.instagram, c.facebook].some((h) => h && h.toLowerCase().replace(/^@/, '') === cuenta.replace(/^@/, '')) || normalizar(c.nombre).includes(normalizar(cuenta)) || (!!normalizar(cuenta) && normalizar(cuenta).includes(c.slug.replace(/-/g, ' '))))
    const nombre = comp?.nombre ?? cuenta
    if (!comp) informe.sin_competidor++
    const orden = [...cs].sort((a, b) => (num(b.me_gusta) ?? -1) - (num(a.me_gusta) ?? -1) || (txt(b.fecha_comentario) < txt(a.fecha_comentario) ? -1 : 1))
    const fechas = cs.map((c) => fechaIso(c.fecha_comentario)).filter((x): x is string => !!x).sort()
    const muestra = orden.slice(0, COMENTARIOS_POR_FICHA).map((c) => `«${corto(sinUsuarios(c.texto, 220), 200)}»${fechaIso(c.fecha_comentario) ? ` (${dia(fechaIso(c.fecha_comentario))}${num(c.me_gusta) ? `, ${num(c.me_gusta)} me gusta` : ''})` : ''}`)
    const url = txt(cs[0].post_url) || null
    informe.publicaciones++
    fichas.push({
      ...base('comentarios', 'competidor', ctx), ref: `brazo:comentarios:${ctx.clientId}:${red}:${slugDe(cuenta)}:${slugDe(post)}`, atributo: `comentarios:${red}:${slugDe(cuenta)}:${slugDe(post)}`, clase: CLASES_NUEVAS.comentarios,
      titulo: `Competidor · ${nombre} · Comentarios en ${NOMBRE_DE_RED[red] ?? red}`,
      contenido: `Lo que comentan en ${NOMBRE_DE_RED[red] ?? red} sobre una publicación de la competencia ${nombre} (${cs.length} comentario(s)${fechas.length ? `, del ${dia(fechas[0])} al ${dia(fechas[fechas.length - 1])}` : ', sin fecha'}${url ? `; publicación ${url}` : ''}): ${muestra.join(' | ')}`,
      fuente_url: url, fecha_fuente: fechas[fechas.length - 1] ?? null, vigente_hasta: new Date(ctx.ahora.getTime() + 120 * DIA_EN_MS).toISOString(), sobre: nombre,
      datos: { competidor: nombre, red, cuenta, publicacion: post, comentarios: cs.length },
    })
  }
  return { fichas, informe }
}

// ───────────────────────────── 6 · foros (Reddit) sobre el rubro y el país ─────────────────────────────

export const pedidoDeForos = (termino: string, pais: string | null): Obj => ({ searchTerms: [`${termino}${pais ? ` ${pais}` : ''}`], searchPosts: true, searchSort: 'new', searchTime: 'year', maxPostsCount: 10, crawlCommentsPerPost: true, maxCommentsPerPost: 4 })

export interface InformeDeForos { recibidos: number; hilos: number; fuera_del_rubro: number; fuera_del_lugar: number; muy_viejos: number; sin_fecha: number }
export function fichasDeForos(items: unknown[], d: DatosDelCliente, ctx: Ctx): { fichas: FichaDeBrazo[]; informe: InformeDeForos } {
  const informe: InformeDeForos = { recibidos: items.length, hilos: 0, fuera_del_rubro: 0, fuera_del_lugar: 0, muy_viejos: 0, sin_fecha: 0 }
  const rubro = contenidoDe(d.termino ?? '')
  const lugares = [d.pais, ...d.ciudades].filter((x): x is string => !!x).map(normalizar)
  const posts = arr(items).filter((x) => txt(x.dataType) !== 'comment' && txt(x.title))
  const comentarios = arr(items).filter((x) => txt(x.dataType) === 'comment')
  const fichas: FichaDeBrazo[] = []
  for (const p of posts) {
    const id = txt(p.parsedId) || txt(p.id).replace(/^t3_/, '')
    const creado = fechaIso(p.createdAt)
    if (!id || !creado) { informe.sin_fecha++; continue }
    if (ctx.ahora.getTime() - Date.parse(creado) > DIAS_ATRAS_DE_FOROS * DIA_EN_MS) { informe.muy_viejos++; continue }
    const comunidad = txt(p.communityName) || txt(p.parsedCommunityName)
    const hilos = comentarios.filter((c) => (txt(c.parsedPostId) || txt(c.postId).replace(/^t3_/, '')) === id)
    const cuerpo = sinUsuarios(txt(p.body), 700)
    const todo = normalizar(`${txt(p.title)} ${cuerpo} ${hilos.map((c) => txt(c.body)).join(' ')} ${comunidad}`)
    // del rubro: al menos una palabra del término; del lugar: el país o una ciudad del cliente (en el hilo o en el nombre del foro)
    if (!rubro.length || !rubro.some((w) => todo.split(' ').some((t) => t.startsWith(w.slice(0, Math.max(5, w.length - 2)))))) { informe.fuera_del_rubro++; continue }
    if (!lugares.some((l) => l && ` ${todo} `.includes(` ${l} `))) { informe.fuera_del_lugar++; continue }
    const respuestas = hilos.slice(0, 4).map((c) => `«${corto(sinUsuarios(txt(c.body), 260), 240)}»${fechaIso(c.commentCreatedAt) ? ` (${dia(fechaIso(c.commentCreatedAt))})` : ''}`)
    const url = txt(p.postUrl) || txt(p.contentUrl) || null
    informe.hilos++
    fichas.push({
      ...base('foros', 'mercado', ctx), ref: `brazo:foro:${ctx.clientId}:${id}`, atributo: `foro:${id}`, clase: CLASES_NUEVAS.foro,
      titulo: `Foro · ${comunidad ? `r/${comunidad.replace(/^r\//, '')} · ` : ''}${corto(txt(p.title), 90)}`,
      contenido: `Hilo de foro (Reddit${comunidad ? `, r/${comunidad.replace(/^r\//, '')}` : ''}) del ${dia(creado)}${num(p.score) !== null ? `, ${num(p.score)} puntos` : ''}${num(p.commentsCount) !== null ? `, ${num(p.commentsCount)} comentarios` : ''}: «${corto(sinUsuarios(txt(p.title), 200), 200)}»${cuerpo ? ` ${corto(cuerpo, 500)}` : ''}${respuestas.length ? ` · respuestas: ${respuestas.join(' | ')}` : ''}`,
      fuente_url: url, fecha_fuente: creado, vigente_hasta: new Date(Date.parse(creado) + DIAS_ATRAS_DE_FOROS * DIA_EN_MS).toISOString(), sobre: comunidad || undefined,
      datos: { comunidad, hilo: id, comentarios_incluidos: respuestas.length },
    })
  }
  return { fichas, informe }
}

// ───────────────────────────── el paso: pedir → filtrar → archivar ─────────────────────────────

export interface EntradaDeFuente {
  db: Db
  fuente: FuenteNueva
  cliente: Obj
  clientId: string
  ciudadesDeSedes: string[]
  ahora: Date
  ejecutar: Ejecutar
  /** para el paso de comentarios: lee y guarda los comentarios nuevos de Instagram y Facebook (la tabla de la competencia) y devuelve su costo */
  leerComentarios?: (cliente: Obj) => Promise<{ costo_usd: number; error?: string; resumen?: Record<string, unknown> }>
  workflowId?: string
  ejecucionId?: string
}
export interface ResultadoDeFuente { resumen: Record<string, unknown>; errores: string[]; gasto_usd: number }

const redondea = (n: number) => Math.round(n * 1e6) / 1e6
const archivo = (a: ResultadoDeArchivo) => ({ nuevas: a.plan.filter((p) => p.accion === 'nueva' || p.accion === 'reemplaza').length, escritas: a.escritas, iguales: a.iguales, retiradas: a.retiradas })

export async function correrFuenteNueva(e: EntradaDeFuente): Promise<ResultadoDeFuente> {
  const errores: string[] = []
  const resumen: Record<string, unknown> = { fuente: e.fuente }
  let gasto = 0
  const ctx: Ctx = { clientId: e.clientId, ahora: e.ahora }
  const d = datosDelCliente(e.cliente, e.clientId, e.ciudadesDeSedes)
  const fichas: FichaDeBrazo[] = []
  const pedir = async (actor: string, input: Obj, tope: number, restante: () => number): Promise<unknown[] | null> => {
    if (restante() < 0.01) { errores.push('se llegó al tope de gasto del paso: queda lo demás para la próxima corrida'); return null }
    try {
      const r = await e.ejecutar(actor, input, Math.min(tope, restante()))
      // los anuncios se cobran por anuncio (US$ 0,002) y el actor no lo reporta al terminar: se toma lo mayor entre lo reportado y lo medido
      const costo = e.fuente === 'anuncios_google' ? Math.max(r.costo_usd, r.items.length * 0.002) : r.costo_usd
      gasto = redondea(gasto + costo)
      // el crudo queda guardado (evidencia y gasto a la vista del vigilante); sus claves no coinciden con ninguna que el portero traduzca a fichas por su cuenta
      const w = await e.db.from('apify_raw').insert({ client_id: e.clientId, apify_function: `fuente_${e.fuente}`, params: input, respuesta: r.items, filas: r.items.length, ensayo: false, metadata: { llamado_por: 'portero-fuentes-nuevas', actor, fuente: e.fuente, costo_usd: r.costo_usd }, created_at: e.ahora.toISOString() })
      if (w.error) errores.push(`crudo de ${actor}: ${String(w.error.message).slice(0, 100)}`)
      return r.items
    } catch (err) { errores.push(`${actor}: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`); return null }
  }
  try {
    if (e.fuente === 'anuncios_google') {
      const restante = () => TOPE_POR_PASO_USD.anuncios_google - gasto
      const conDominio = d.competidores.filter((c) => c.dominio).slice(0, MAX_COMPETIDORES_CON_ANUNCIOS)
      resumen.competidores = d.competidores.length
      resumen.sin_sitio_propio = d.competidores.filter((c) => !c.dominio).map((c) => c.nombre)
      const porCompetidor: Record<string, number> = {}
      for (const c of conDominio) {
        const items = await pedir(ACTORES_DE_FUENTES.anuncios_google, pedidoDeAnuncios(c.dominio!, d.iso), TOPE_POR_LLAMADA_USD.anuncios_google, restante)
        if (!items) continue
        const r = fichasDeAnuncios(items, c, ctx)
        porCompetidor[c.nombre] = r.fichas.length
        fichas.push(...r.fichas)
        if (r.informe.de_otro_dominio) (resumen.descartados_de_otro_dominio as number | undefined) === undefined ? (resumen.descartados_de_otro_dominio = r.informe.de_otro_dominio) : ((resumen.descartados_de_otro_dominio as number) += r.informe.de_otro_dominio)
      }
      resumen.anuncios_por_competidor = porCompetidor
    } else if (e.fuente === 'busquedas_google') {
      if (!d.termino || !d.iso) { resumen.motivo = !d.iso ? 'la ficha no dice el país' : 'la ficha no dice el rubro'; return { resumen, errores, gasto_usd: 0 } }
      let items = await pedir(ACTORES_DE_FUENTES.busquedas_google, pedidoDeBusqueda(d.termino, d.iso), TOPE_POR_LLAMADA_USD.busquedas_google, () => TOPE_POR_PASO_USD.busquedas_google - gasto)
      if (!items) {
        // el actor oficial (trae búsquedas relacionadas) a veces tarda más que el paso: respaldo rápido y barato, sin relacionadas (se declara)
        const r = await pedir(ACTORES_DE_FUENTES.busquedas_respaldo, pedidoDeBusquedaRespaldo(d.termino, d.iso), TOPE_POR_LLAMADA_USD.busquedas_google, () => TOPE_POR_PASO_USD.busquedas_google - gasto)
        if (r) { items = r.map(desdeElRespaldoDeBusquedas); resumen.actor_usado = 'respaldo' }
      }
      if (items) { const r = fichaDeBusqueda(items, d, ctx); if (r.ficha) fichas.push(r.ficha); else resumen.motivo = r.motivo; resumen.termino = d.termino }
    } else if (e.fuente === 'eventos_locales') {
      if (!d.ciudades.length) { resumen.motivo = 'la ficha no dice ciudades'; return { resumen, errores, gasto_usd: 0 } }
      const porCiudad: Record<string, number> = {}
      for (const ciudad of d.ciudades.slice(0, MAX_CIUDADES_DE_EVENTOS)) {
        const items = await pedir(ACTORES_DE_FUENTES.eventos_locales, pedidoDeEventos(ciudad, d.pais), TOPE_POR_LLAMADA_USD.eventos_locales, () => TOPE_POR_PASO_USD.eventos_locales - gasto)
        if (!items) continue
        const r = fichasDeEventos(items, ciudad, d.pais, ctx)
        porCiudad[ciudad] = r.fichas.length
        fichas.push(...r.fichas)
      }
      resumen.eventos_por_ciudad = porCiudad
    } else if (e.fuente === 'foros') {
      if (!d.termino) { resumen.motivo = 'la ficha no dice el rubro'; return { resumen, errores, gasto_usd: 0 } }
      const restante = () => TOPE_POR_PASO_USD.foros - gasto
      const todos: unknown[] = []
      const general = await pedir(ACTORES_DE_FUENTES.foros, pedidoDeForos(d.termino, d.pais), TOPE_POR_LLAMADA_USD.foros, restante)
      if (general) todos.push(...general)
      // y el subforo del propio país (r/ecuador, r/colombia…): ahí el lugar ya está dicho
      const sub = d.pais ? slugDe(d.pais).replace(/-/g, '') : ''
      if (sub) { const dentro = await pedir(ACTORES_DE_FUENTES.foros, { ...pedidoDeForos(d.termino, null), withinCommunity: sub }, TOPE_POR_LLAMADA_USD.foros, restante); if (dentro) todos.push(...dentro) }
      if (general || todos.length) { const r = fichasDeForos(todos, d, ctx); fichas.push(...r.fichas); resumen.hilos = r.informe }
    } else if (e.fuente === 'horas_de_mas_gente') {
      const rr = await e.db.from('apify_raw').select('apify_function, respuesta, ensayo, created_at').eq('client_id', e.clientId).eq('ensayo', false).in('apify_function', ['own_google_maps_profile', 'google_maps_scraper']).order('created_at', { ascending: false }).limit(40)
      if (rr.error) errores.push(`apify_raw: ${String(rr.error.message).slice(0, 120)}`)
      else { const r = fichasDeHoras(Array.isArray(rr.data) ? (rr.data as FilaCruda[]) : [], d, ctx); fichas.push(...r.fichas); resumen.lugares = r.informe }
    } else if (e.fuente === 'comentarios_ig_fb') {
      if (e.leerComentarios) {
        const l = await e.leerComentarios(e.cliente)
        gasto = redondea(gasto + l.costo_usd)
        if (l.error) errores.push(l.error)
        if (l.resumen) resumen.lectura_nueva = l.resumen
      }
      const cm = await leerTodas(() => e.db.from('cerebro_comentarios_competencia').select('red, cuenta, post_ref, post_url, comentario_ref, texto, me_gusta, fecha_comentario').eq('client_id', e.clientId).order('comentario_ref', { ascending: true }))
      if (cm.error) errores.push(`cerebro_comentarios_competencia: ${String(cm.error.message).slice(0, 120)}`)
      else { const r = fichasDeComentarios(Array.isArray(cm.data) ? (cm.data as FilaDeComentario[]) : [], d, ctx); fichas.push(...r.fichas); resumen.comentarios_fichados = r.informe }
    }
    resumen.fichas_armadas = fichas.length
    if (fichas.length) {
      const a = await archivarFichasDeBrazos({ db: e.db as never, fichas, ahora: e.ahora, dry_run: false, workflow_id: e.workflowId, workflow_execution_id: e.ejecucionId })
      a.errores.forEach((x) => errores.push(x))
      resumen.archivo = archivo(a)
    }
  } catch (err) { errores.push(`${e.fuente}: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`) }
  return { resumen, errores, gasto_usd: redondea(gasto) }
}
