/**
 * COMENTARIOS DE LA INDUSTRIA (encargo 6 · 18-nov · «dale» de Emilio · se publica APAGADO; se enciende solo después del 25-nov).
 * Lo que dice el público en el RUBRO, no solo en la competencia. Es parte del trabajo general del portero, para cualquier cliente:
 *  · TikTok: los 5 videos del rubro que más gustan (de las tendencias que el portero ya juntó), ≤ 50 comentarios c/u, una vez por semana;
 *  · Instagram: las 6 publicaciones top de los hashtags del rubro (de las mismas tendencias), ≤ 50 comentarios c/u, una vez por semana;
 *  · YouTube: los 3 videos top del rubro (búsqueda del rubro y el país), ≤ 50 comentarios c/u, una vez por semana.
 * Se guardan en el MISMO lugar que los comentarios de la competencia (`cerebro_comentarios_competencia`), con `nivel='industria'`, su red, su capa
 * (país, competencia, global, mundo), su vía, su fecha y su vigencia. Personas privadas: el texto va sin nombre ni cuenta de quien comenta.
 * Detrás de la puerta de crédito de Apify, con tope por llamada y por paso. Una publicación ya leída no se vuelve a pedir.
 * Las fichas (una por publicación) son clase `comentarios_de_la_industria`, alcance mercado.
 */
import { DATOS_SIN_ACTUALIZAR, type RespuestaDeCredito } from '../apify/credito'
import { sinDatosPersonales } from './dueno'
import { DIA_EN_MS, slugDe, type FichaDeBrazo } from './brazos/tipos'

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null }
const fechaIso = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v).toISOString()
  const s = txt(v); if (!s) return null
  const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const redondea = (n: number) => Math.round(n * 1e6) / 1e6

// ───────────────────────────── las reglas (se prueban) ─────────────────────────────
export type RedDeLaIndustria = 'tiktok' | 'instagram' | 'youtube'
export const REDES_DE_LA_INDUSTRIA: readonly RedDeLaIndustria[] = ['tiktok', 'instagram', 'youtube']
export const PUBLICACIONES_POR_RED: Readonly<Record<RedDeLaIndustria, number>> = { tiktok: 5, instagram: 6, youtube: 3 }
export const COMENTARIOS_POR_PUBLICACION = 50
export const DIAS_ENTRE_LECTURAS = 7
/** las tendencias más viejas que esto no se usan para elegir publicaciones */
export const DIAS_DE_TENDENCIA_QUE_SIRVEN = 30
/** el orden de las capas: lo más cercano al público del cliente primero */
export const ORDEN_DE_CAPAS = ['pais', 'competencia', 'global', 'mundo'] as const
/** topes en US$: por llamada y por paso (un cliente, una corrida). El costo real esperado se escribe antes de encender (punto 4 del encargo) */
export const TOPE_POR_LLAMADA_USD = 0.1
export const TOPE_POR_PASO_USD = 0.5
export const VIGENCIA_EN_DIAS = 120
export const CLASE_DE_LA_INDUSTRIA = 'comentarios_de_la_industria'
export const VIA_DE_LA_RED: Readonly<Record<RedDeLaIndustria, string>> = { tiktok: 'tendencia_tiktok', instagram: 'hashtag_instagram', youtube: 'busqueda_youtube' }
export const ACTORES_DE_LA_INDUSTRIA = {
  tiktok: { comentarios: 'clockworks~tiktok-comments-scraper' },
  instagram: { comentarios: 'apify~instagram-comment-scraper' },
  youtube: { busqueda: 'streamers~youtube-scraper', comentarios: 'streamers~youtube-comments-scraper' },
} as const
const NOMBRE_DE_RED: Record<RedDeLaIndustria, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

/** el interruptor: APAGADO salvo que diga exactamente `on` (se publica apagado; se enciende después del 25-nov) */
export const comentariosDeLaIndustriaEncendidos = (env: Record<string, string | undefined> = process.env): boolean => String(env.PORTERO_COMENTARIOS_INDUSTRIA ?? 'off').trim().toLowerCase() === 'on'

// ───────────────────────────── elegir las publicaciones ─────────────────────────────
export interface FilaDeTendencia { red?: unknown; nivel?: unknown; consulta?: unknown; post_ref?: unknown; url?: unknown; autor?: unknown; me_gusta?: unknown; observado_en?: unknown }
export interface PublicacionDeLaIndustria { red: RedDeLaIndustria; ref: string; url: string; capa: string; consulta: string | null; me_gusta: number | null }

const capaDe = (v: unknown): string => { const c = txt(v).toLowerCase(); return (ORDEN_DE_CAPAS as readonly string[]).includes(c) ? c : '' }
const rangoDeCapa = (c: string) => (ORDEN_DE_CAPAS as readonly string[]).indexOf(c)

/** de las tendencias del cliente: las de esa red, del rubro (no de la cuenta propia), recientes, no leídas, sin repetir; primero la capa más cercana y dentro de ella la que más gusta */
export function publicacionesDeLasTendencias(filas: readonly FilaDeTendencia[], red: 'tiktok' | 'instagram', o: { ahora: Date; yaLeidas: ReadonlySet<string>; propias: ReadonlySet<string>; n?: number }): PublicacionDeLaIndustria[] {
  const desde = o.ahora.getTime() - DIAS_DE_TENDENCIA_QUE_SIRVEN * DIA_EN_MS
  const vistas = new Set<string>()
  const candidatas: PublicacionDeLaIndustria[] = []
  for (const f of filas) {
    if (txt(f.red).toLowerCase() !== red) continue
    const capa = capaDe(f.nivel), ref = txt(f.post_ref), url = txt(f.url)
    if (!capa || !ref || !/^https?:\/\//i.test(url)) continue
    const t = Date.parse(txt(f.observado_en))
    if (!Number.isFinite(t) || t < desde) continue
    if (o.propias.has(txt(f.autor).toLowerCase().replace(/^@/, ''))) continue
    // en Instagram, solo lo que llegó por un hashtag del rubro
    if (red === 'instagram' && !txt(f.consulta).startsWith('#')) continue
    if (o.yaLeidas.has(`${red}|${ref}`) || vistas.has(ref)) continue
    vistas.add(ref)
    candidatas.push({ red, ref, url, capa, consulta: txt(f.consulta) || null, me_gusta: num(f.me_gusta) })
  }
  candidatas.sort((a, b) => rangoDeCapa(a.capa) - rangoDeCapa(b.capa) || (b.me_gusta ?? -1) - (a.me_gusta ?? -1))
  return candidatas.slice(0, o.n ?? PUBLICACIONES_POR_RED[red])
}

export const pedidoDeBusquedaEnYoutube = (termino: string, pais: string | null): Obj => ({ searchQueries: [`${termino}${pais ? ` ${pais}` : ''}`], maxResults: PUBLICACIONES_POR_RED.youtube * 2, maxResultsShorts: 0, maxResultStreams: 0, sortingOrder: 'views' })

/** de la búsqueda de YouTube: los videos con id y url, los que más se ven, sin los ya leídos ni los de la cuenta propia */
export function publicacionesDeYoutube(items: readonly unknown[], o: { yaLeidas: ReadonlySet<string>; propias: ReadonlySet<string>; termino: string }): PublicacionDeLaIndustria[] {
  const out: PublicacionDeLaIndustria[] = []
  const vistos = new Set<string>()
  for (const it of items) {
    const x = obj(it)
    const ref = txt(x.id), url = txt(x.url)
    if (!ref || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url) || vistos.has(ref) || o.yaLeidas.has(`youtube|${ref}`)) continue
    if (o.propias.has(txt(x.channelUsername ?? x.channelName).toLowerCase().replace(/^@/, ''))) continue
    vistos.add(ref)
    out.push({ red: 'youtube', ref, url, capa: 'mundo', consulta: o.termino, me_gusta: num(x.likes) ?? num(x.viewCount) })
  }
  return out.sort((a, b) => (b.me_gusta ?? -1) - (a.me_gusta ?? -1)).slice(0, PUBLICACIONES_POR_RED.youtube)
}

// ───────────────────────────── los comentarios ─────────────────────────────
export function pedidoDeComentarios(p: PublicacionDeLaIndustria): Obj {
  if (p.red === 'tiktok') return { postURLs: [p.url], commentsPerPost: COMENTARIOS_POR_PUBLICACION, maxRepliesPerComment: 0 }
  if (p.red === 'instagram') return { directUrls: [p.url], resultsLimit: COMENTARIOS_POR_PUBLICACION }
  return { startUrls: [{ url: p.url }], maxComments: COMENTARIOS_POR_PUBLICACION, commentsSortBy: '0' }
}

/** el texto de un comentario sin datos de quien comenta: sin @usuarios, correos ni teléfonos; nunca se guarda su nombre ni su cuenta */
export const textoSinQuienComenta = (t: unknown): string => sinDatosPersonales(txt(t).replace(/\s+/g, ' ')).texto.slice(0, 600).trim()

export interface ComentarioDeLaIndustria { red: RedDeLaIndustria; post_ref: string; post_url: string; comentario_ref: string; texto: string; me_gusta: number | null; fecha: string | null }

export function comentarioDeLaIndustria(p: PublicacionDeLaIndustria, it: unknown): ComentarioDeLaIndustria | null {
  const x = obj(it)
  let ref = '', texto = '', me_gusta: number | null = null, fecha: string | null = null
  if (p.red === 'tiktok') { ref = txt(x.cid); texto = txt(x.text); me_gusta = num(x.diggCount); fecha = fechaIso(x.createTimeISO ?? x.createTime) }
  else if (p.red === 'instagram') { ref = txt(x.id); texto = txt(x.text); me_gusta = num(x.likesCount); fecha = fechaIso(x.timestamp) }
  else { ref = txt(x.cid ?? x.commentId); texto = txt(x.comment ?? x.text); me_gusta = num(x.voteCount ?? x.likes); fecha = fechaIso(x.publishedAt ?? x.date) }
  const limpio = textoSinQuienComenta(texto)
  if (!ref || !limpio) return null
  return { red: p.red, post_ref: p.ref, post_url: p.url, comentario_ref: `${p.red}:${ref}`, texto: limpio, me_gusta, fecha }
}

// ───────────────────────────── el paso ─────────────────────────────
export type EjecutarEnApify = (actor: string, input: Obj, maxUsd: number) => Promise<{ items: unknown[]; costo_usd: number }>
export interface FilaGuardada { client_id: string; red: RedDeLaIndustria; cuenta: string; post_ref: string; post_url: string; comentario_ref: string; texto: string; me_gusta: number | null; fecha_comentario: string | null; observado_en: string; nivel: 'industria'; capa: string; via: string; vigente_hasta: string }
export interface DependenciasDeLaIndustria {
  clientId: string
  ahora: Date
  env?: Record<string, string | undefined>
  /** el rubro del cliente (como lo lee el portero) y su país */
  termino: string | null
  pais: string | null
  /** las cuentas propias del cliente, para no leer sus publicaciones como «industria» */
  propias: ReadonlySet<string>
  leerTendencias(): Promise<FilaDeTendencia[]>
  /** lo ya leído de la industria: `red|post_ref` y la última lectura por red */
  leerLoYaLeido(): Promise<{ publicaciones: ReadonlySet<string>; ultima_por_red: Partial<Record<RedDeLaIndustria, string>> }>
  guardar(filas: FilaGuardada[]): Promise<{ guardados: number; error?: string }>
  ejecutar: EjecutarEnApify
  /** la puerta de crédito de Apify: sin ella no se raspa */
  credito?: () => Promise<RespuestaDeCredito>
}
export interface InformeDeRed { red: RedDeLaIndustria; estado: 'leida' | 'al_dia' | 'sin_publicaciones' | 'sin_rubro' | 'tope' | 'con_errores'; publicaciones: number; comentarios: number; costo_usd: number; causa?: string }
export interface InformeDeLaIndustria { estado: 'apagado' | 'sin_credito' | 'corrida'; redes: InformeDeRed[]; guardados: number; costo_usd: number; errores: string[]; mensaje?: string; credito?: { leido: boolean; restante_usd: number | null } }

export async function leerComentariosDeLaIndustria(d: DependenciasDeLaIndustria): Promise<InformeDeLaIndustria> {
  const out: InformeDeLaIndustria = { estado: 'corrida', redes: [], guardados: 0, costo_usd: 0, errores: [] }
  if (!comentariosDeLaIndustriaEncendidos(d.env)) return { ...out, estado: 'apagado', mensaje: 'los comentarios de la industria están apagados (PORTERO_COMENTARIOS_INDUSTRIA): no se llamó a Apify' }
  // la puerta de crédito: sin puerta o sin crédito, no se llama a Apify
  if (!d.credito) return { ...out, estado: 'sin_credito', mensaje: 'sin puerta de crédito de Apify: no se raspa' }
  const c = await d.credito()
  const restante = c.leido && c.credito_usd !== null && c.usado_usd !== null ? redondea(c.credito_usd - c.usado_usd) : null
  out.credito = { leido: c.leido, restante_usd: restante }
  if (!c.hay_credito) return { ...out, estado: 'sin_credito', mensaje: c.mensaje ?? DATOS_SIN_ACTUALIZAR }
  if (restante !== null && restante < TOPE_POR_PASO_USD) return { ...out, estado: 'sin_credito', mensaje: `quedan US$ ${restante.toFixed(2)} de crédito de Apify en el ciclo y el paso reserva US$ ${TOPE_POR_PASO_USD.toFixed(2)}: no se raspa` }
  if (!c.leido) out.errores.push(`el crédito de Apify no se pudo leer (${c.detalle ?? 'sin detalle'}): se corre con el tope del paso`)

  const ya = await d.leerLoYaLeido()
  const tope = () => redondea(TOPE_POR_PASO_USD - out.costo_usd)
  const pedir = async (actor: string, input: Obj): Promise<unknown[] | null> => {
    const max = Math.min(TOPE_POR_LLAMADA_USD, tope())
    if (max < 0.01) return null
    try {
      const r = await d.ejecutar(actor, input, max)
      out.costo_usd = redondea(out.costo_usd + Math.max(0, Number(r.costo_usd) || 0))
      return Array.isArray(r.items) ? r.items : []
    } catch (e) { out.errores.push(`${actor}: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`); return null }
  }
  let tendencias: FilaDeTendencia[] | null = null
  const filas: FilaGuardada[] = []
  for (const red of REDES_DE_LA_INDUSTRIA) {
    const inf: InformeDeRed = { red, estado: 'leida', publicaciones: 0, comentarios: 0, costo_usd: 0 }
    out.redes.push(inf)
    const ultima = Date.parse(ya.ultima_por_red[red] ?? '')
    if (Number.isFinite(ultima) && d.ahora.getTime() - ultima < DIAS_ENTRE_LECTURAS * DIA_EN_MS) { inf.estado = 'al_dia'; continue }
    if (tope() < 0.01) { inf.estado = 'tope'; inf.causa = 'se llegó al tope de gasto del paso'; continue }
    const antes = out.costo_usd
    let pubs: PublicacionDeLaIndustria[] = []
    if (red === 'youtube') {
      if (!d.termino) { inf.estado = 'sin_rubro'; inf.causa = 'la ficha no dice el rubro'; continue }
      const items = await pedir(ACTORES_DE_LA_INDUSTRIA.youtube.busqueda, pedidoDeBusquedaEnYoutube(d.termino, d.pais))
      if (items === null) { inf.estado = out.errores.length ? 'con_errores' : 'tope'; inf.costo_usd = redondea(out.costo_usd - antes); continue }
      pubs = publicacionesDeYoutube(items, { yaLeidas: ya.publicaciones, propias: d.propias, termino: d.termino })
    } else {
      tendencias ??= await d.leerTendencias()
      pubs = publicacionesDeLasTendencias(tendencias, red, { ahora: d.ahora, yaLeidas: ya.publicaciones, propias: d.propias })
    }
    if (!pubs.length) { inf.estado = 'sin_publicaciones'; inf.causa = red === 'youtube' ? 'la búsqueda no trajo videos nuevos' : 'no hay tendencias recientes y nuevas de esta red'; inf.costo_usd = redondea(out.costo_usd - antes); continue }
    for (const p of pubs) {
      const items = await pedir(ACTORES_DE_LA_INDUSTRIA[red].comentarios, pedidoDeComentarios(p))
      if (items === null) { if (tope() < 0.01) { inf.estado = 'tope'; inf.causa = 'se llegó al tope de gasto del paso' } else inf.estado = 'con_errores'; break }
      const vistos = new Set<string>()
      const cs = items.map((it) => comentarioDeLaIndustria(p, it)).filter((k): k is ComentarioDeLaIndustria => !!k && !vistos.has(k.comentario_ref) && !!vistos.add(k.comentario_ref)).slice(0, COMENTARIOS_POR_PUBLICACION)
      inf.publicaciones++
      inf.comentarios += cs.length
      const vence = new Date(d.ahora.getTime() + VIGENCIA_EN_DIAS * DIA_EN_MS).toISOString()
      // la `cuenta` de la fila es la de la publicación (para agrupar), nunca la de quien comenta
      for (const k of cs) filas.push({ client_id: d.clientId, red, cuenta: `industria:${p.capa}`, post_ref: p.ref, post_url: p.url, comentario_ref: k.comentario_ref, texto: k.texto, me_gusta: k.me_gusta, fecha_comentario: k.fecha, observado_en: d.ahora.toISOString(), nivel: 'industria', capa: p.capa, via: VIA_DE_LA_RED[red], vigente_hasta: vence })
    }
    inf.costo_usd = redondea(out.costo_usd - antes)
  }
  if (filas.length) {
    const g = await d.guardar(filas)
    out.guardados = g.guardados
    if (g.error) out.errores.push(g.error)
  }
  return out
}

// ───────────────────────────── las fichas (una por publicación) ─────────────────────────────
export interface FilaLeida { red?: unknown; post_ref?: unknown; post_url?: unknown; texto?: unknown; me_gusta?: unknown; fecha_comentario?: unknown; capa?: unknown; via?: unknown; vigente_hasta?: unknown; observado_en?: unknown }
export const MUESTRA_POR_FICHA = 15

export function fichasDeLaIndustria(filas: readonly FilaLeida[], clientId: string, ahora: Date): FichaDeBrazo[] {
  const grupos = new Map<string, FilaLeida[]>()
  for (const f of filas) { const red = txt(f.red), post = txt(f.post_ref); if (!red || !post || !txt(f.texto)) continue; const k = `${red}|${post}`; grupos.set(k, [...(grupos.get(k) ?? []), f]) }
  const fichas: FichaDeBrazo[] = []
  for (const [k, cs] of grupos) {
    const [red, post] = k.split('|') as [RedDeLaIndustria, string]
    const nombre = NOMBRE_DE_RED[red] ?? red
    const capa = txt(cs[0].capa) || null
    const url = txt(cs[0].post_url) || null
    const fechas = cs.map((c) => fechaIso(c.fecha_comentario)).filter((x): x is string => !!x).sort()
    const orden = [...cs].sort((a, b) => (num(b.me_gusta) ?? -1) - (num(a.me_gusta) ?? -1))
    const muestra = orden.slice(0, MUESTRA_POR_FICHA).map((c) => `«${textoSinQuienComenta(c.texto).slice(0, 200)}»${fechaIso(c.fecha_comentario) ? ` (${fechaIso(c.fecha_comentario)!.slice(0, 10)})` : ''}`)
    const vence = cs.map((c) => fechaIso(c.vigente_hasta)).filter((x): x is string => !!x).sort().pop() ?? new Date(ahora.getTime() + VIGENCIA_EN_DIAS * DIA_EN_MS).toISOString()
    fichas.push({
      brazo: 'comentarios', alcance: 'mercado', client_id: clientId, observado_en: ahora.toISOString(), decision: 'suma', origen: 'tercero',
      ref: `brazo:comentarios_industria:${clientId}:${red}:${slugDe(post)}`, atributo: `comentarios_industria:${red}:${slugDe(post)}`, clase: CLASE_DE_LA_INDUSTRIA,
      titulo: `Industria · Comentarios en ${nombre}${capa ? ` · capa ${capa}` : ''}`,
      contenido: `Lo que comenta el público del rubro en ${nombre} sobre una publicación que gusta mucho (${cs.length} comentario(s)${fechas.length ? `, del ${fechas[0].slice(0, 10)} al ${fechas[fechas.length - 1].slice(0, 10)}` : ', sin fecha'}${url ? `; publicación ${url}` : ''}): ${muestra.join(' | ')}`,
      fuente_url: url, fecha_fuente: fechas[fechas.length - 1] ?? null, vigente_hasta: vence, sobre: `industria (${nombre})`,
      datos: { red, nivel: 'industria', capa, via: txt(cs[0].via) || null, publicacion: post, comentarios: cs.length },
    } as FichaDeBrazo)
  }
  return fichas
}
