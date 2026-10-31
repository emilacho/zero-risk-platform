/**
 * TENDENCIAS DEL RUBRO + BODEGA VIRAL DEL MUNDO · 31-oct (encargo «tendencias y redes»)
 * Lo que el cerebro reúne de afuera va en EMBUDO, de lo global a la competencia directa, y dentro de cada nivel de lo más gustado a lo menos:
 *   global (el rubro en el mundo) → pais (el rubro en el país del cliente) → competencia (negocios del rubro en su región) → directa (los competidores nombrados).
 * Origen siempre «referencia» (global, país, competencia) o «competidor» (directa); subcategoría «tendencia»; JAMÁS «propio». Declarado obliga, observado inspira.
 * La BODEGA VIRAL es aparte: no es de un cliente (client_id nulo), nivel «mundo»; el historial no se borra (una fila por pieza y por día observado; lo vigente es lo del último día).
 * Actores elegidos por prueba (31-oct, 5 resultados c/u): TikTok apidojo~tiktok-scraper · Instagram apify~instagram-hashtag-scraper · X apidojo~tweet-scraper · LinkedIn apimaestro~linkedin-company-posts.
 * Pinterest: sin actor confiable (epctex quedó en cola sin resultados y los otros no existen o exigen acceso total): se DECLARA, no se inventa.
 * Nunca tumba la corrida: devuelve lo que no pudo con su motivo.
 */
import { createHash } from 'node:crypto'

export const NIVELES = ['global', 'pais', 'competencia', 'directa'] as const
export type Nivel = (typeof NIVELES)[number] | 'mundo'
export type Red = 'tiktok' | 'instagram' | 'x' | 'linkedin'
export const TOPE_POR_CORRIDA_USD = 0.1
export const TOPE_DEL_DIA_POR_CLIENTE_USD = 0.6
export const TOPE_DEL_DIA_BODEGA_USD = 0.4
export const PIEZAS_POR_CONSULTA = 12

export const ACTORES: Record<Red, { actor: string; por_que: string }> = {
  tiktok: { actor: 'apidojo~tiktok-scraper', por_que: 'devuelve vistas, me gusta, compartidos y comentarios; 5 de 5 en US$ 0 y 11 s (clockworks exige un tope mínimo de US$ 0,50 por corrida)' },
  instagram: { actor: 'apify~instagram-hashtag-scraper', por_que: 'publicaciones por hashtag con me gusta, comentarios, fecha y autor; 5 de 5 en 32 s' },
  x: { actor: 'apidojo~tweet-scraper', por_que: 'orden «Top» y vistas, me gusta, compartidos y respuestas; 5 de 5 en US$ 0 y 4 s (kaito costó US$ 0,0044 por lo mismo)' },
  linkedin: { actor: 'apimaestro~linkedin-company-posts', por_que: 'publicaciones de empresa con reacciones, comentarios y fecha; 5 de 5 (harvestapi devolvió 0)' },
}

export interface Pieza {
  nivel: Nivel
  red: Red
  origen: 'referencia' | 'competidor'
  consulta: string
  post_ref: string
  url: string | null
  autor: string | null
  texto: string | null
  tipo: 'video' | 'imagen' | 'post'
  media_url: string | null
  vistas: number | null
  me_gusta: number | null
  compartidos: number | null
  comentarios: number | null
  publicado_en: string | null
  pais: string | null
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 ? Math.round(n) : null }
const usd = (v: unknown): number => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 ? n : 0 }
const urlHttp = (v: unknown): string | null => { const u = txt(v); return u && /^https?:\/\/[^\s]+$/i.test(u) && u.length < 3000 ? u : null }
const fecha = (v: unknown): string | null => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v)); const d = new Date(n); return Number.isFinite(d.getTime()) ? d.toISOString() : null }

export interface ContextoDeConsulta { nivel: Nivel; origen: 'referencia' | 'competidor'; consulta: string; pais?: string | null }

/** una fila cruda de cada actor → una pieza con las mismas columnas; lo que no trae lo deja en null (nunca inventa) */
export function piezaDe(red: Red, it: unknown, c: ContextoDeConsulta): Pieza | null {
  const x = obj(it)
  const base = { nivel: c.nivel, red, origen: c.origen, consulta: c.consulta, pais: c.pais ?? null }
  if (red === 'tiktok') {
    const id = txt(x.id) ?? (typeof x.id === 'number' ? String(x.id) : null)
    if (!id) return null
    const ch = obj(x.channel), v = obj(x.video)
    return { ...base, post_ref: id, url: urlHttp(x.postPage), autor: txt(ch.username) ?? txt(ch.name), texto: txt(x.title), tipo: 'video', media_url: urlHttp(v.cover) ?? urlHttp(v.url), vistas: num(x.views), me_gusta: num(x.likes), compartidos: num(x.shares), comentarios: num(x.comments), publicado_en: fecha(x.uploadedAt) }
  }
  if (red === 'instagram') {
    const id = txt(x.shortCode) ?? txt(x.id)
    if (!id) return null
    const esVideo = /video/i.test(String(x.type ?? '')) || typeof x.videoUrl === 'string'
    return { ...base, post_ref: id, url: urlHttp(x.url), autor: txt(x.ownerUsername), texto: txt(x.caption), tipo: esVideo ? 'video' : 'imagen', media_url: urlHttp(x.displayUrl), vistas: num(x.videoViewCount) ?? num(x.videoPlayCount), me_gusta: num(x.likesCount), compartidos: null, comentarios: num(x.commentsCount), publicado_en: fecha(x.timestamp) }
  }
  if (red === 'x') {
    const id = txt(x.id)
    if (!id) return null
    const au = obj(x.author)
    const media = Array.isArray(x.media) ? x.media : []
    return { ...base, post_ref: id, url: urlHttp(x.url) ?? urlHttp(x.twitterUrl), autor: txt(au.userName), texto: txt(x.fullText) ?? txt(x.text), tipo: 'post', media_url: urlHttp(media[0]), vistas: num(x.viewCount), me_gusta: num(x.likeCount), compartidos: num(x.retweetCount), comentarios: num(x.replyCount), publicado_en: fecha(x.createdAt) }
  }
  const ref = txt(x.activity_urn) ?? txt(x.post_url)
  if (!ref) return null
  const st = obj(x.stats), au = obj(x.author), pa = obj(x.posted_at)
  return { ...base, post_ref: ref.slice(0, 200), url: urlHttp(x.post_url), autor: txt(au.name) ?? txt(au.username), texto: txt(x.text), tipo: 'post', media_url: null, vistas: null, me_gusta: num(st.total_reactions), compartidos: num(st.reposts), comentarios: num(st.comments), publicado_en: fecha(pa.timestamp ?? pa.date) }
}

export interface Consulta1 { red: Red; nivel: Nivel; origen: 'referencia' | 'competidor'; etiqueta: string; input: Obj; pais?: string | null }
const tag = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export interface TerminosDelRubro { global: string[]; pais: string[]; competencia: string[] }
export interface CompetidorDeclarado { name: string; handles: Record<string, string> }

/** los competidores nombrados de la ficha con sus cuentas por red (lo declarado obliga) */
export function competidoresDeLaFicha(config: unknown): CompetidorDeclarado[] {
  const lista = obj(obj(config).apify).competitor_list
  if (!Array.isArray(lista)) return []
  return lista.map((c) => { const o = obj(c); const h: Record<string, string> = {}; for (const [k, v] of Object.entries(obj(o.handles))) { const t = txt(v); if (t) h[k.toLowerCase()] = t }; return { name: txt(o.name) ?? '', handles: h } }).filter((c) => c.name)
}

const manejo = (h: string) => h.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(tiktok|instagram|x|twitter)\.com\//i, '').replace(/\/.*$/, '').replace(/\?.*$/, '')

/** el plan de consultas de un cliente: embudo global → país → competencia → directa. `b2b`: solo entonces se mira LinkedIn */
export function planDeTendencias(a: { terminos: TerminosDelRubro; pais: string | null; competidores: CompetidorDeclarado[]; b2b: boolean; porNivel?: number }): Consulta1[] {
  const n = a.porNivel ?? PIEZAS_POR_CONSULTA
  const out: Consulta1[] = []
  const hashtagsDe = (nivel: Nivel, terminos: string[], origen: 'referencia' | 'competidor', pais: string | null) => {
    const h = [...new Set(terminos.map(tag).filter((t) => t.length >= 3))].slice(0, 2)
    for (const t of h) {
      out.push({ red: 'tiktok', nivel, origen, etiqueta: `#${t}`, pais, input: { startUrls: [`https://www.tiktok.com/tag/${t}`], maxItems: n } })
      out.push({ red: 'instagram', nivel, origen, etiqueta: `#${t}`, pais, input: { hashtags: [t], resultsType: 'posts', resultsLimit: n } })
    }
    const q = [...new Set(terminos.map((t) => t.trim()).filter(Boolean))].slice(0, 1)
    for (const t of q) out.push({ red: 'x', nivel, origen, etiqueta: t, pais, input: { searchTerms: [t], maxItems: n, sort: 'Top' } })
  }
  hashtagsDe('global', a.terminos.global, 'referencia', null)
  hashtagsDe('pais', a.terminos.pais, 'referencia', a.pais)
  hashtagsDe('competencia', a.terminos.competencia, 'referencia', a.pais)
  for (const c of a.competidores) {
    const tk = c.handles.tiktok ? manejo(c.handles.tiktok) : ''
    if (tk) out.push({ red: 'tiktok', nivel: 'directa', origen: 'competidor', etiqueta: `@${tk}`, pais: a.pais, input: { startUrls: [`https://www.tiktok.com/@${tk}`], maxItems: n } })
    const xx = c.handles.x ?? c.handles.twitter
    if (xx && manejo(xx)) out.push({ red: 'x', nivel: 'directa', origen: 'competidor', etiqueta: `@${manejo(xx)}`, pais: a.pais, input: { searchTerms: [`from:${manejo(xx)}`], maxItems: n, sort: 'Top' } })
    if (a.b2b && c.handles.linkedin) out.push({ red: 'linkedin', nivel: 'directa', origen: 'competidor', etiqueta: c.handles.linkedin, pais: a.pais, input: { company_name: c.handles.linkedin, limit: n } })
  }
  return out
}

/** la bodega viral del mundo: lo más visto del momento, en general y por país, tenga o no que ver con un negocio */
export function planDeLaBodega(a: { paises: string[]; porNivel?: number }): Consulta1[] {
  const n = a.porNivel ?? PIEZAS_POR_CONSULTA
  const out: Consulta1[] = [
    { red: 'tiktok', nivel: 'mundo', origen: 'referencia', etiqueta: '#fyp', pais: null, input: { startUrls: ['https://www.tiktok.com/tag/fyp'], maxItems: n } },
    { red: 'tiktok', nivel: 'mundo', origen: 'referencia', etiqueta: '#viral', pais: null, input: { startUrls: ['https://www.tiktok.com/tag/viral'], maxItems: n } },
    { red: 'instagram', nivel: 'mundo', origen: 'referencia', etiqueta: '#viral', pais: null, input: { hashtags: ['viral'], resultsType: 'posts', resultsLimit: n } },
    { red: 'x', nivel: 'mundo', origen: 'referencia', etiqueta: 'min_faves:20000', pais: null, input: { searchTerms: ['min_faves:20000'], maxItems: n, sort: 'Top' } },
  ]
  for (const p of a.paises) out.push({ red: 'x', nivel: 'mundo', origen: 'referencia', etiqueta: `min_faves:2000 place_country:${p}`, pais: p, input: { searchTerms: [`min_faves:2000 place_country:${p}`], maxItems: n, sort: 'Top' } })
  return out
}

export type Ejecutar = (actor: string, input: Obj, maxUsd: number) => Promise<{ items: unknown[]; costo_usd: number }>

export interface ResultadoDeTendencias {
  consultas: number
  piezas: number
  por_red: Record<string, number>
  por_nivel: Record<string, number>
  gasto_usd: number
  fallidas: Array<{ red: string; consulta: string; causa: string }>
  omitidas_por_tope: number
  /** redes que no se pudieron consultar y por qué (declarado, no inventado) */
  declarado: string[]
  filas: Array<Pieza>
}

/** corre el plan (en tandas paralelas) y devuelve las piezas ya ordenadas; el gasto de cada corrida y del día tienen tope */
export async function correrConsultas(a: { plan: Consulta1[]; ejecutar: Ejecutar; topeDelDiaUsd: number; gastoPrevioUsd?: number; paralelo?: number; piezasPorConsulta?: number }): Promise<ResultadoDeTendencias> {
  const res: ResultadoDeTendencias = { consultas: 0, piezas: 0, por_red: {}, por_nivel: {}, gasto_usd: 0, fallidas: [], omitidas_por_tope: 0, declarado: ['pinterest: sin actor confiable (probados epctex~pinterest-scraper sin resultados; igolaizola, apidojo y apify~pinterest-crawler no existen o exigen acceso total)'], filas: [] }
  const paralelo = a.paralelo ?? 4
  const vistos = new Set<string>()
  for (let i = 0; i < a.plan.length; i += paralelo) {
    const tanda = a.plan.slice(i, i + paralelo)
    const margen = a.topeDelDiaUsd - (a.gastoPrevioUsd ?? 0) - res.gasto_usd
    if (margen <= 0.001) { res.omitidas_por_tope += a.plan.length - i; break }
    const tope = Math.min(TOPE_POR_CORRIDA_USD, margen / tanda.length)
    const hechas = await Promise.all(tanda.map(async (q) => {
      try { return { q, r: await a.ejecutar(ACTORES[q.red].actor, q.input, tope) } } catch (e) { return { q, error: (e instanceof Error ? e.message : String(e)).slice(0, 120) } }
    }))
    for (const h of hechas) {
      res.consultas++
      if ('error' in h) { res.fallidas.push({ red: h.q.red, consulta: h.q.etiqueta, causa: h.error ?? 'error' }); continue }
      res.gasto_usd = Math.round((res.gasto_usd + h.r.costo_usd) * 1e6) / 1e6
      const piezas = h.r.items.map((it) => piezaDe(h.q.red, it, { nivel: h.q.nivel, origen: h.q.origen, consulta: h.q.etiqueta, pais: h.q.pais })).filter((p): p is Pieza => !!p)
      if (!piezas.length) res.fallidas.push({ red: h.q.red, consulta: h.q.etiqueta, causa: 'el actor no devolvió publicaciones' })
      for (const p of piezas) {
        const k = `${p.red}|${p.post_ref}`
        if (vistos.has(k)) continue
        vistos.add(k)
        res.filas.push(p); res.piezas++
        res.por_red[p.red] = (res.por_red[p.red] ?? 0) + 1
        res.por_nivel[p.nivel] = (res.por_nivel[p.nivel] ?? 0) + 1
      }
    }
  }
  return res
}

/** el orden del embudo: nivel (global → directa) y dentro de cada uno, de más gustado a menos (me gusta, luego vistas) */
export const ORDEN_DE_NIVEL: Record<string, number> = { global: 0, pais: 1, competencia: 2, directa: 3, mundo: 0 }
export function ordenDelEmbudo<T extends { nivel: string; me_gusta: number | null; vistas: number | null }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => (ORDEN_DE_NIVEL[a.nivel] ?? 9) - (ORDEN_DE_NIVEL[b.nivel] ?? 9) || (b.me_gusta ?? -1) - (a.me_gusta ?? -1) || (b.vistas ?? -1) - (a.vistas ?? -1))
}

const hoy = (ahora: Date) => ahora.toISOString().slice(0, 10)
type Traer = (url: string, init?: RequestInit) => Promise<Response>

/** guarda las piezas (una por pieza y por día: no se borra el historial); `clientId` nulo = bodega del mundo */
export async function guardarTendencias(a: { clientId: string | null; piezas: Pieza[]; urlDeLaBase: string; llave: string; ahora: Date; fetchImpl?: Traer }): Promise<{ guardadas: number; error?: string }> {
  if (!a.piezas.length) return { guardadas: 0 }
  if (!a.llave || !a.urlDeLaBase) return { guardadas: 0, error: 'la base no está configurada en el servidor' }
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const filas = a.piezas.map((p) => ({ client_id: a.clientId, nivel: p.nivel, red: p.red, origen: p.origen, subcategoria: 'tendencia', consulta: p.consulta.slice(0, 200), post_ref: p.post_ref, url: p.url, autor: p.autor, texto: p.texto ? p.texto.slice(0, 2000) : null, tipo: p.tipo, media_url: p.media_url, vistas: p.vistas, me_gusta: p.me_gusta, compartidos: p.compartidos, comentarios: p.comentarios, pais: p.pais, publicado_en: p.publicado_en, observado_en: a.ahora.toISOString(), observado_dia: hoy(a.ahora) }))
  const w = await traer(`${a.urlDeLaBase.replace(/\/$/, '')}/rest/v1/cerebro_tendencias?on_conflict=client_id,red,post_ref,observado_dia`, { method: 'POST', headers: { apikey: a.llave, Authorization: `Bearer ${a.llave}`, 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(filas) })
  return w.ok ? { guardadas: filas.length } : { guardadas: 0, error: `la tabla de tendencias respondió HTTP ${w.status}` }
}

/** ¿ya se miraron hoy las tendencias de este cliente (o la bodega)? una vez por día */
export async function yaSeMiroHoy(a: { clientId: string | null; urlDeLaBase: string; llave: string; ahora: Date; fetchImpl?: Traer }): Promise<boolean | null> {
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const filtro = a.clientId ? `client_id=eq.${encodeURIComponent(a.clientId)}` : 'client_id=is.null'
  const r = await traer(`${a.urlDeLaBase.replace(/\/$/, '')}/rest/v1/cerebro_tendencias?${filtro}&observado_dia=eq.${hoy(a.ahora)}&select=id&limit=1`, { headers: { apikey: a.llave, Authorization: `Bearer ${a.llave}` } })
  if (!r.ok) return null
  return ((await r.json()) as unknown[]).length > 0
}

/** la llamada real a Apify: una corrida con tope de gasto y espera acotada; devuelve las filas y el gasto medido */
export function ejecutarEnApify(o: { token: string; fetchImpl?: Traer; esperaMs?: number }): Ejecutar {
  const traer: Traer = o.fetchImpl ?? ((u, i) => fetch(u, i))
  return async (actor, input, maxUsd) => {
    const t0 = Date.now()
    const espera = o.esperaMs ?? 80_000
    const r = await traer(`https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(o.token)}&maxTotalChargeUsd=${Math.max(0.01, Math.round(maxUsd * 1e4) / 1e4)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(20_000) })
    const j = (await r.json().catch(() => null)) as { data?: Obj; error?: { message?: string } } | null
    if (!r.ok || !j?.data) throw new Error(`HTTP ${r.status} ${j?.error?.message ?? ''}`.trim())
    let run = j.data
    while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(String(run.status))) {
      if (Date.now() - t0 > espera) { await traer(`https://api.apify.com/v2/actor-runs/${run.id}/abort?token=${encodeURIComponent(o.token)}`, { method: 'POST' }).catch(() => undefined); throw new Error('se pasó del tiempo de espera') }
      const s = await traer(`https://api.apify.com/v2/actor-runs/${run.id}?token=${encodeURIComponent(o.token)}&waitForFinish=15`, { signal: AbortSignal.timeout(25_000) })
      run = ((await s.json()) as { data: Obj }).data
    }
    if (run.status !== 'SUCCEEDED' && !run.defaultDatasetId) throw new Error(`la corrida terminó ${run.status}`)
    const d = await traer(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(o.token)}&limit=60&clean=1`)
    const items = d.ok ? ((await d.json()) as unknown[]) : []
    return { items: Array.isArray(items) ? items : [], costo_usd: usd(run.usageTotalUsd) }
  }
}

export const huella = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 12)
