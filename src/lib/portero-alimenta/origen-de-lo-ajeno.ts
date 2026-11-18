/**
 * DE DÓNDE VIENE LO AJENO · ENCARGO 3 de Cerebro, fase B (17-nov, firma de Emilio). PURO + lectura/escritura acotada. US$ 0: sin modelo, sin Apify.
 * Cada foto o video guardado (`client_social_images`, `client_videos`) recibe, sin tocar `owner_role`:
 *   · `papel`: propio | competidor | mercado | referencia
 *   · `via`: por dónde entró (cuenta propia, lista de competidores, búsqueda de competencia, Mapas, hashtag, anuncios, tendencia, bodega, sitio, sin registro)
 *   · `nivel` del embudo (propio · mundo · global · país · competencia · directa) y `relevancia_motivo` (por qué sirve a ESTE cliente). Sin motivo → `sin_motivo` (la base lo calcula).
 * Reglas (todas exactas: comparar nombres, cuentas, ciudades y países; JUZGAR si un contenido sirve al rubro es de un agente, no de este código):
 *   1) sin cliente → la bodega del mundo (a propósito): referencia · bodega · mundo, con su motivo.
 *   2) la CUENTA PROPIA nunca es competidor ni referencia: sus cuentas declaradas (`config.apify.own_handles`), su sitio o su página de Instagram → propio
 *      (si la misma publicación ya está como propia, la copia vieja se marca `duplicado_de`, no se borra).
 *   3) competidor si está en la LISTA de competidores del cliente (o en las cuentas que se le hallaron); su anuncio es referencia de nivel directa, con motivo.
 *   4) la BÚSQUEDA DE COMPETENCIA (el brazo que vigila competidores; la ficha de Mapas por rubro y ciudad): competidor solo si queda en una ciudad del cliente o,
 *      si es un vigilado, en su país; Mapas en su país pero fuera de sus ciudades → mercado con motivo; en OTRO país o sin lugar → mercado sin motivo.
 *   5) la tendencia que la trajo (`cerebro_tendencias`) → referencia · tendencia · su nivel, con la búsqueda que la trajo.
 *   6) una cuenta hallada por un HASHTAG (lo más gustado) → mercado · hashtag, con los hashtags. Nunca competidor.
 *   7) un anuncio de una página que no es competidor conocido → sin motivo (lo trajo una búsqueda por palabra).
 *   8) lo demás → sin registro · sin motivo (una referencia sigue siendo referencia; lo de un tercero, mercado).
 */
import type { Db } from './alimentar'

type Fila = Record<string, unknown>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Fila => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Fila) : {})
const sinTildes = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** el mismo «slug» con el que el Servicio de Apify nombra la cuenta de una ficha de Mapas o la página de un anuncio */
export const slugDeNombre = (s: string, max = 40): string => sinTildes(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max)
/** una cuenta de red: minúsculas, sin «@», sin espacios */
export const cuentaNormal = (s: unknown): string => sinTildes(txt(s)).replace(/^@+/, '').replace(/\s+/g, '')
const hostDe = (u: unknown): string => { const m = /^https?:\/\/([^/?#]+)/i.exec(txt(u)); return m ? m[1].toLowerCase().replace(/^www\./, '') : '' }
const primerTramo = (u: unknown): string => { const m = /^https?:\/\/[^/]+\/([^/?#]+)/i.exec(txt(u)); return m ? cuentaNormal(m[1]) : '' }
const HOSTS_DE_REDES = new Set(['instagram.com', 'tiktok.com', 'facebook.com', 'x.com', 'twitter.com', 'youtube.com', 'linkedin.com'])
/** país de la ficha (código ISO) → cómo lo escriben las direcciones de Mapas. Dato del idioma, no de un cliente */
export const NOMBRES_DE_PAIS: Record<string, string[]> = {
  EC: ['ecuador'], CO: ['colombia'], PE: ['peru'], MX: ['mexico'], CL: ['chile'], AR: ['argentina'], ES: ['espana', 'spain'], US: ['united states', 'usa', 'estados unidos'],
  BO: ['bolivia'], VE: ['venezuela'], PA: ['panama'], CR: ['costa rica'], GT: ['guatemala'], UY: ['uruguay'], PY: ['paraguay'], DO: ['republica dominicana'], CH: ['suiza', 'switzerland', 'schweiz'],
}
const PAISES_CONOCIDOS = Object.entries(NOMBRES_DE_PAIS)
/** Mapas pone el estado y el código postal en EE. UU. («NJ 07087»): así se reconoce sin el nombre del país */
const ES_DIRECCION_DE_EEUU = /,\s*[A-Z]{2}\s+\d{5}\b/

export type Papel = 'propio' | 'competidor' | 'mercado' | 'referencia'
export type Via = 'cuenta_propia' | 'lista_de_competidores' | 'busqueda_de_competencia' | 'mapas' | 'hashtag' | 'anuncios' | 'tendencia' | 'bodega' | 'sitio' | 'sin_registro'
export type Nivel = 'propio' | 'mundo' | 'global' | 'pais' | 'competencia' | 'directa'
export interface Clasificacion { papel: Papel; via: Via; via_detalle: string | null; nivel: Nivel; relevancia_motivo: string | null; duplicado_de?: string }
export const TABLAS_DE_LO_AJENO = ['client_social_images', 'client_videos'] as const
export type TablaDeLoAjeno = (typeof TABLAS_DE_LO_AJENO)[number]

/** lo que el clasificador sabe del cliente (todo leído de la base; nada de un cliente en el código) */
export interface ContextoDelCliente {
  esBodega: boolean
  propios: Set<string>
  hostPropio: string
  /** cuenta o slug → nombre del competidor de la lista */
  deLaLista: Map<string, string>
  hostsDeLaLista: Map<string, string>
  /** cuenta o slug → competidor que vigiló la búsqueda de competencia */
  vigilados: Map<string, string>
  /** cuenta → hashtags que la trajeron */
  porHashtag: Map<string, string[]>
  ciudades: string[]
  pais: string | null
  /** id de video → la tendencia que lo trajo */
  tendencias: Map<string, { nivel: string; consulta: string }>
  /** post_id → id de la fila PROPIA con esa misma publicación (en la tabla que se clasifica) */
  propiasPorPublicacion: Map<string, string>
  /** cuenta (el slug de Mapas) → dónde queda, por su ficha de Mapas guardada */
  lugarDeCuenta: Map<string, Lugar>
}

const NIVELES = new Set(['mundo', 'global', 'pais', 'competencia', 'directa'])
const corto = (s: string, n = 300): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const TIPOS_DE_MAPAS = new Set(['maps_portada', 'maps_foto'])
const TIPOS_DE_WEB = new Set(['web_imagen', 'web_captura', 'web_portada', 'video_web'])

/** ¿es de una cuenta propia del cliente? por su cuenta, por su sitio o por la página de su red */
function esPropia(f: Fila, c: ContextoDelCliente): string | null {
  const h = cuentaNormal(f.handle)
  if (h && c.propios.has(h)) return `es la cuenta propia del cliente («${txt(f.handle)}»)`
  const host = hostDe(`https://${h}`) || h
  if (c.hostPropio && (host === c.hostPropio || host.endsWith(`.${c.hostPropio}`))) return `es del sitio propio del cliente (${c.hostPropio})`
  // la página de su red rastreada como sitio (el Servicio la nombra por el dominio de la red)
  if (HOSTS_DE_REDES.has(host.replace(/^www\./, '')) && c.propios.has(primerTramo(f.post_url))) return `es de la página propia del cliente en ${host} («${primerTramo(f.post_url)}»)`
  return null
}

export type Lugar = { donde: 'ciudad'; ciudad: string } | { donde: 'pais' } | { donde: 'otro_pais'; pais: string } | { donde: 'sin_lugar' }
const palabra = (x: string): RegExp => new RegExp(`(^|[^a-z])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`)
/** dónde queda una dirección de Mapas respecto del cliente: en una de sus ciudades, en su país, en otro país o sin lugar reconocible. Otro país gana. Pura */
export function lugarDeLaDireccion(direccion: string, c: Pick<ContextoDelCliente, 'ciudades' | 'pais'>): Lugar {
  const dir = sinTildes(direccion)
  const deEeuu = ES_DIRECCION_DE_EEUU.test(direccion)
  const otro = PAISES_CONOCIDOS.find(([cod, ns]) => cod !== c.pais && ns.some((p) => palabra(p).test(dir)))?.[0] ?? (deEeuu && c.pais !== 'US' ? 'US' : null)
  if (otro) return { donde: 'otro_pais', pais: otro }
  const ciudad = c.ciudades.find((x) => x && palabra(x).test(dir))
  if (ciudad) return { donde: 'ciudad', ciudad }
  const nombres = c.pais ? NOMBRES_DE_PAIS[c.pais] ?? [] : []
  if (nombres.some((p) => palabra(p).test(dir)) || (c.pais === 'US' && deEeuu)) return { donde: 'pais' }
  return { donde: 'sin_lugar' }
}

/** la clasificación de UNA fila. Pura */
export function clasificarFila(f: Fila, c: ContextoDelCliente): Clasificacion {
  const rol = txt(f.owner_role)
  const tipo = txt(f.tipo)
  const h = cuentaNormal(f.handle)
  const caption = txt(f.caption)
  if (c.esBodega) return { papel: 'referencia', via: 'bodega', via_detalle: null, nivel: 'mundo', relevancia_motivo: 'bodega viral del mundo: lo más visto, sin importar el rubro (a propósito, sin cliente)' }

  // 2 · la cuenta propia nunca es competidor ni referencia
  const propia = esPropia(f, c)
  if (propia || rol === 'propio') {
    const out: Clasificacion = { papel: 'propio', via: 'cuenta_propia', via_detalle: null, nivel: 'propio', relevancia_motivo: propia ?? 'guardada como propia del cliente' }
    const base = txt(f.post_id)
    const suya = base ? c.propiasPorPublicacion.get(base) : undefined
    if (rol !== 'propio' && suya && suya !== txt(f.id) && !txt(f.duplicado_de)) out.duplicado_de = suya
    return out
  }

  const esAnuncio = tipo === 'anuncio'
  const esMapas = TIPOS_DE_MAPAS.has(tipo)
  // 3 · en la lista de competidores del cliente (por su cuenta, su nombre o su sitio)
  const deLista = c.deLaLista.get(h) ?? (TIPOS_DE_WEB.has(tipo) || tipo === 'logo_hd' ? c.hostsDeLaLista.get(h.replace(/^www\./, '')) : undefined)
  if (deLista) {
    return esAnuncio
      ? { papel: 'referencia', via: 'anuncios', via_detalle: corto(`página «${txt(f.handle)}»`), nivel: 'directa', relevancia_motivo: corto(`anuncio del competidor «${deLista}», de la lista del cliente`) }
      : { papel: 'competidor', via: 'lista_de_competidores', via_detalle: null, nivel: 'directa', relevancia_motivo: corto(`en la lista de competidores del cliente: «${deLista}»`) }
  }

  // 4 · la búsqueda de competencia (el brazo que vigila competidores; la ficha de Mapas por rubro y ciudad): cuenta solo si queda en sus ciudades o en su país
  const vigilado = c.vigilados.get(h)
  if (vigilado || esMapas) {
    const delTexto: Lugar = esMapas ? lugarDeLaDireccion(caption, c) : { donde: 'sin_lugar' }
    const lugar: Lugar = delTexto.donde !== 'sin_lugar' ? delTexto : (c.lugarDeCuenta.get(vigilado ?? h) ?? c.lugarDeCuenta.get(h) ?? delTexto)
    const visto = vigilado ? `competidor que vigila la búsqueda de competencia («${vigilado}»)` : 'Mapas'
    const detalle = esMapas ? corto(`Mapas: ${caption.split(' · ').slice(1).join(' · ') || caption}`) : corto(`vigilado: ${vigilado}`)
    const via: Via = vigilado ? 'busqueda_de_competencia' : 'mapas'
    if (lugar.donde === 'otro_pais') return { papel: esAnuncio ? 'referencia' : 'mercado', via: esAnuncio ? 'anuncios' : via, via_detalle: corto(`${detalle} · en otro país (${lugar.pais})`), nivel: 'competencia', relevancia_motivo: null }
    if (esAnuncio) return { papel: 'referencia', via: 'anuncios', via_detalle: detalle, nivel: 'directa', relevancia_motivo: corto(`anuncio de un ${visto}`) }
    if (lugar.donde === 'ciudad') return { papel: 'competidor', via: 'busqueda_de_competencia', via_detalle: detalle, nivel: vigilado ? 'directa' : 'competencia', relevancia_motivo: corto(`${visto}, en una ciudad del cliente (${lugar.ciudad})`) }
    if (vigilado) return { papel: 'competidor', via: 'busqueda_de_competencia', via_detalle: detalle, nivel: 'directa', relevancia_motivo: corto(lugar.donde === 'pais' ? `${visto}, en el país del cliente` : visto) }
    if (lugar.donde === 'pais') return { papel: 'mercado', via: 'mapas', via_detalle: detalle, nivel: 'competencia', relevancia_motivo: 'Mapas, en el país del cliente pero fuera de sus ciudades' }
    return { papel: 'mercado', via: 'mapas', via_detalle: corto(`${detalle} · sin lugar reconocible`), nivel: 'competencia', relevancia_motivo: null }
  }

  // 5 · la tendencia que la trajo (las capturas de un video apuntan a su video; el video es la fila misma)
  const t = c.tendencias.get(txt(f.video_id) || txt(f.id))
  if (t && NIVELES.has(t.nivel)) {
    return { papel: 'referencia', via: 'tendencia', via_detalle: t.consulta ? corto(`búsqueda «${t.consulta}»`) : null, nivel: t.nivel as Nivel, relevancia_motivo: t.consulta ? corto(`la trajo la búsqueda «${t.consulta}», hecha con el rubro del cliente (nivel ${t.nivel})`) : null }
  }

  // 6 · hallada por un hashtag → mercado (nunca competidor)
  const tags = c.porHashtag.get(h)
  if (tags) return { papel: 'mercado', via: 'hashtag', via_detalle: corto(tags.length ? tags.map((x) => `#${x}`).join(' ') : 'hashtag'), nivel: 'competencia', relevancia_motivo: tags.length ? corto(`apareció en hashtags del rubro y la ciudad del cliente (${tags.map((x) => `#${x}`).join(' ')})`) : null }

  // 7 · anuncio de una página que no es competidor conocido: lo trajo una búsqueda por palabra
  if (esAnuncio) return { papel: 'referencia', via: 'anuncios', via_detalle: corto(`hallado por búsqueda de palabra; su página («${txt(f.handle)}») no es un competidor conocido`), nivel: 'competencia', relevancia_motivo: null }

  // 8 · lo demás: no se sabe por qué está (una referencia sigue siendo referencia; lo de un tercero sin registro, mercado)
  return { papel: rol === 'referencia' ? 'referencia' : 'mercado', via: TIPOS_DE_WEB.has(tipo) ? 'sitio' : 'sin_registro', via_detalle: null, nivel: 'competencia', relevancia_motivo: null }
}

// ── el contexto, leído de la base ─────────────────────────────────────────────────
const LIMITE = 2000
const hashtagsDeUrls = (p: Fila): string[] => (Array.isArray(p.directUrls) ? (p.directUrls as unknown[]) : []).map((u) => /\/explore\/tags\/([^/?#]+)/i.exec(txt(u))?.[1] ?? '').map(cuentaNormal).filter(Boolean)

/** arma el contexto con datos ya leídos. Pura (la lectura está en `leerContexto`) */
export function armarContexto(a: { esBodega: boolean; cliente: Fila | null; sedes: Fila[]; tendencias: Fila[]; llamadas: Fila[]; propias: Fila[]; mapas?: Fila[] }): ContextoDelCliente {
  const cfg = obj(obj(a.cliente?.config).apify)
  const propios = new Set<string>(Object.values(obj(cfg.own_handles)).map(cuentaNormal).filter((x) => x && !/^\d+$/.test(x)))
  const web = txt(a.cliente?.website_url)
  const host = hostDe(web)
  if (HOSTS_DE_REDES.has(host) && primerTramo(web)) propios.add(primerTramo(web))
  const deLaLista = new Map<string, string>(), hostsDeLaLista = new Map<string, string>()
  for (const x of Array.isArray(cfg.competitor_list) ? (cfg.competitor_list as unknown[]) : []) {
    const k = obj(x), nombre = txt(k.name)
    if (!nombre) continue
    deLaLista.set(slugDeNombre(nombre), nombre)
    for (const v of Object.values(obj(k.handles))) { const cu = primerTramo(txt(v).startsWith('http') ? v : '') || cuentaNormal(String(v).replace(/^.*\.com\/(in\/)?/i, '')); if (cu) deLaLista.set(cu, nombre) }
    const hs = hostDe(k.website)
    if (hs && !HOSTS_DE_REDES.has(hs)) hostsDeLaLista.set(hs, nombre)
  }
  // las cuentas que la búsqueda de cuentas HALLÓ para un competidor de la lista (`competidor:<slug>:<red>`)
  for (const [k, v] of Object.entries(obj(cfg.busqueda_de_cuentas))) {
    const [que, slug] = k.split(':'), r = obj(v), cu = cuentaNormal(r.handle)
    if (que === 'competidor' && r.resultado === 'hallada' && cu) deLaLista.set(cu, deLaLista.get(slug ?? '') ?? slug ?? cu)
  }
  const vigilados = new Map<string, string>(), porHashtag = new Map<string, string[]>()
  const tagsDelDia = new Map<string, Set<string>>()
  for (const l of a.llamadas) {
    const p = obj(l.params), marca = txt(p._brazo), dia = txt(l.created_at).slice(0, 10)
    if (marca.startsWith('gustado:hashtag')) { const s = tagsDelDia.get(dia) ?? new Set<string>(); hashtagsDeUrls(p).forEach((t) => s.add(t)); tagsDelDia.set(dia, s) }
  }
  for (const l of a.llamadas) {
    const p = obj(l.params), marca = txt(p._brazo), dia = txt(l.created_at).slice(0, 10)
    const cuentas = (Array.isArray(p.usernames) ? (p.usernames as unknown[]) : []).map(cuentaNormal).filter(Boolean)
    if (marca.startsWith('competencia:')) {
      const slug = marca.split(':')[1] ?? ''
      if (slug) vigilados.set(slug, slug)
      for (const cu of cuentas) vigilados.set(cu, slug || cu)
    } else if (marca === 'gustado:perfiles') {
      for (const cu of cuentas) if (!porHashtag.has(cu)) porHashtag.set(cu, [...(tagsDelDia.get(dia) ?? [])].sort())
    }
  }
  const ciudades = [...new Set([...a.sedes.map((s) => txt(s.ciudad)), ...(Array.isArray(cfg.ciudades_de_gusto) ? (cfg.ciudades_de_gusto as unknown[]).map(txt) : [])].map(sinTildes).filter((x) => x.length >= 3))]
  const tendencias = new Map<string, { nivel: string; consulta: string }>()
  for (const t of a.tendencias) { const id = txt(t.video_id); if (id && !tendencias.has(id)) tendencias.set(id, { nivel: txt(t.nivel), consulta: txt(t.consulta) }) }
  const propiasPorPublicacion = new Map<string, string>()
  for (const p of a.propias) { const k = txt(p.post_id); if (k && !propiasPorPublicacion.has(k)) propiasPorPublicacion.set(k, txt(p.id)) }
  const pais = txt(a.cliente?.country).toUpperCase() || null
  const lugarDeCuenta = new Map<string, Lugar>()
  for (const m of a.mapas ?? []) { const k = cuentaNormal(m.handle), l = lugarDeLaDireccion(txt(m.caption), { ciudades, pais }); if (k && l.donde !== 'sin_lugar' && !lugarDeCuenta.has(k)) lugarDeCuenta.set(k, l) }
  return { esBodega: a.esBodega, propios, hostPropio: HOSTS_DE_REDES.has(host) ? '' : host, deLaLista, hostsDeLaLista, vigilados, porHashtag, ciudades, pais, tendencias, propiasPorPublicacion, lugarDeCuenta }
}

export type LecturaDeContexto = { ok: true; contexto: ContextoDelCliente } | { ok: false; detalle: string }
/** lee lo que el clasificador necesita de UN cliente (o de la bodega, `clientId` null). Una lectura que falla o llega al tope → no se clasifica (nada a medias) */
export async function leerContexto(db: Db, clientId: string | null, tabla: TablaDeLoAjeno): Promise<LecturaDeContexto> {
  if (clientId === null) return { ok: true, contexto: armarContexto({ esBodega: true, cliente: null, sedes: [], tendencias: [], llamadas: [], propias: [], mapas: [] }) }
  const [cl, se, te, ll, pr, ma] = await Promise.all([
    db.from('clients').select('id, config, website_url, country').eq('id', clientId).limit(1),
    db.from('client_sedes').select('ciudad').eq('client_id', clientId).limit(LIMITE),
    db.from('cerebro_tendencias').select('video_id, nivel, consulta').eq('client_id', clientId).limit(LIMITE),
    db.from('apify_raw').select('params, created_at').eq('client_id', clientId).in('apify_function', ['instagram_scraper', 'google_maps_scraper', 'facebook_ads_library_scraper']).limit(LIMITE),
    db.from(tabla).select('id, post_id').eq('client_id', clientId).eq('owner_role', 'propio').limit(LIMITE),
    db.from('client_social_images').select('handle, caption').eq('client_id', clientId).eq('tipo', 'maps_portada').limit(LIMITE),
  ])
  const partes: Array<[string, { data?: unknown; error?: { message?: string } | null }]> = [['clients', cl], ['client_sedes', se], ['cerebro_tendencias', te], ['apify_raw', ll], [tabla, pr], ['client_social_images (Mapas)', ma]]
  for (const [n, r] of partes) {
    if (r.error) return { ok: false, detalle: `${n}: ${String(r.error.message ?? r.error).slice(0, 160)}` }
    if (n !== 'clients' && ((r.data ?? []) as unknown[]).length >= LIMITE) return { ok: false, detalle: `${n}: lectura recortada a ${LIMITE} filas` }
  }
  const cliente = ((cl.data ?? []) as Fila[])[0] ?? null
  if (!cliente) return { ok: false, detalle: 'clients: no existe el cliente' }
  return { ok: true, contexto: armarContexto({ esBodega: false, cliente, sedes: (se.data ?? []) as Fila[], tendencias: (te.data ?? []) as Fila[], llamadas: (ll.data ?? []) as Fila[], propias: (pr.data ?? []) as Fila[], mapas: (ma.data ?? []) as Fila[] }) }
}

export const COLUMNAS_A_CLASIFICAR: Record<TablaDeLoAjeno, string> = {
  client_social_images: 'id, client_id, owner_role, handle, post_id, tipo, caption, post_url, video_id, duplicado_de',
  client_videos: 'id, client_id, owner_role, handle, post_id, tipo, caption, post_url',
}
/** tope de filas por cliente y tabla en cada corrida: lo que no entra se clasifica en la siguiente */
export const TOPE_POR_CORRIDA = 500
export const POR_ESCRITURA = 100

export interface ResultadoDeClasificar { tabla: TablaDeLoAjeno; client_id: string | null; estado: 'ok' | 'no_se_pudo_leer' | 'fallo_al_escribir'; por_clasificar: number; clasificadas: number; sin_motivo: number; por_papel: Record<string, number>; detalle?: string }

/** clasifica las filas de UNA tabla y UN cliente que todavía no tienen clasificación. En seco solo cuenta. Nunca lanza */
export async function clasificarPendientes(db: Db, a: { clientId: string | null; tabla: TablaDeLoAjeno; dry_run: boolean; ahora?: Date }): Promise<ResultadoDeClasificar> {
  const base: ResultadoDeClasificar = { tabla: a.tabla, client_id: a.clientId, estado: 'ok', por_clasificar: 0, clasificadas: 0, sin_motivo: 0, por_papel: {} }
  try {
    let q = db.from(a.tabla).select(COLUMNAS_A_CLASIFICAR[a.tabla]).is('clasificado_en', null)
    q = a.clientId === null ? q.is('client_id', null) : q.eq('client_id', a.clientId)
    const r = await q.limit(TOPE_POR_CORRIDA)
    if (r.error) return { ...base, estado: 'no_se_pudo_leer', detalle: `${a.tabla}: ${String(r.error.message ?? r.error).slice(0, 160)}` }
    const filas = (r.data ?? []) as Fila[]
    base.por_clasificar = filas.length
    if (!filas.length) return base
    const ctx = await leerContexto(db, a.clientId, a.tabla)
    if (!ctx.ok) return { ...base, estado: 'no_se_pudo_leer', detalle: ctx.detalle }
    const cuando = (a.ahora ?? new Date()).toISOString()
    // filas con la MISMA clasificación se escriben juntas (una escritura por grupo)
    const grupos = new Map<string, { c: Clasificacion; ids: string[] }>()
    for (const f of filas) {
      const c = clasificarFila(f, ctx.contexto)
      base.por_papel[c.papel] = (base.por_papel[c.papel] ?? 0) + 1
      if (c.papel !== 'propio' && !c.relevancia_motivo) base.sin_motivo++
      const k = JSON.stringify(c)
      const g = grupos.get(k) ?? { c, ids: [] }
      g.ids.push(txt(f.id)); grupos.set(k, g)
    }
    if (a.dry_run) return base
    for (const { c, ids } of grupos.values()) {
      const { duplicado_de, ...resto } = c
      // de a POR_ESCRITURA ids: la lista viaja en la dirección de la consulta
      for (let i = 0; i < ids.length; i += POR_ESCRITURA) {
        const parte = ids.slice(i, i + POR_ESCRITURA)
        const w = await db.from(a.tabla).update({ ...resto, ...(duplicado_de && a.tabla === 'client_social_images' ? { duplicado_de } : {}), clasificado_en: cuando }).in('id', parte)
        if (w.error) return { ...base, estado: 'fallo_al_escribir', detalle: `${a.tabla}: ${String(w.error.message ?? w.error).slice(0, 160)}` }
        base.clasificadas += parte.length
      }
    }
    return base
  } catch (e) {
    return { ...base, estado: 'no_se_pudo_leer', detalle: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}

/** el paso de cada corrida (al cierre del vigilante): los clientes que revisó y la bodega. Un fallo no frena a los demás; nada de esto cambia lo que decide el vigilante */
export async function clasificarLoAjenoDeLaCorrida(db: Db, a: { clientes: string[]; dry_run: boolean; ahora?: Date }): Promise<ResultadoDeClasificar[]> {
  const out: ResultadoDeClasificar[] = []
  for (const clientId of [...a.clientes, null]) for (const tabla of TABLAS_DE_LO_AJENO) out.push(await clasificarPendientes(db, { clientId, tabla, dry_run: a.dry_run, ahora: a.ahora }))
  return out
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** al cierre de la corrida del vigilante: los clientes que revisó y la bodega. Escribe solo con `dry_run:false` + workflow_id + workflow_execution_id; si no, solo cuenta */
export async function origenDeLaCorridaDelVigilante(db: Db, cuerpo: unknown, body: Record<string, unknown>, ahora?: Date): Promise<ResultadoDeClasificar[] | null> {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const revisados = Array.isArray(body.clientes) ? (body.clientes as Array<Record<string, unknown>>) : []
  const clientes = [...new Set(revisados.map((x) => String(x?.client_id ?? '')).filter((x) => UUID.test(x)))]
  if (!clientes.length) return null
  const wf = typeof c.workflow_id === 'string' ? c.workflow_id.trim() : '', ex = typeof c.workflow_execution_id === 'string' ? c.workflow_execution_id.trim() : ''
  return clasificarLoAjenoDeLaCorrida(db, { clientes, dry_run: c.dry_run !== false || !wf || !ex, ahora })
}
