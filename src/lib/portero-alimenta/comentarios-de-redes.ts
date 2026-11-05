/**
 * COMENTARIOS DE TIKTOK, FACEBOOK Y X · 01-nov (encargo «cerrar huecos», punto 3b).
 * De cada cuenta PROPIA y de cada competidor con cuenta conocida: se piden sus publicaciones recientes, se eligen las 2 que más comentarios tienen y se leen sus comentarios, SIEMPRE con la fecha real del comentario.
 *  · lo PROPIO: cada intento se guarda como una fila de `apify_raw` (`comentarios_tiktok` · `comentarios_facebook` · `comentarios_x`) y entra por el portero como cualquier comentario de la cuenta del cliente (opinión de un tercero sobre el cliente, sin vencer);
 *  · lo de la COMPETENCIA va a su tabla aparte (`cerebro_comentarios_competencia`): son de terceros sobre OTRO negocio, nunca opiniones sobre el cliente. Cada intento deja además su fila `comentarios_competencia_<red>` (sin comentarios: así la cuenta no se vuelve a pedir cada día).
 * Sin datos personales: no se guarda quién comentó; del texto se quitan @usuarios, correos y teléfonos.
 * Una cuenta se mira cada 7 días como máximo. Nunca tumba la corrida: devuelve lo que no pudo y por qué.
 */
type Obj = Record<string, unknown>
type Traer = (url: string, init?: RequestInit) => Promise<Response>
export type RedDeComentarios = 'tiktok' | 'x' | 'facebook' | 'instagram'
export type Rol = 'propia' | 'competidor'
export const REDES_DE_COMENTARIOS: RedDeComentarios[] = ['tiktok', 'x', 'facebook']
/** 02-nov: cada paso lee SUS redes (no se lee una cuenta en dos pasos): el de siempre TikTok y X; el de las fuentes nuevas Instagram y Facebook de la competencia */
export const REDES_DEL_PASO_DE_SIEMPRE: RedDeComentarios[] = ['tiktok', 'x']
export const REDES_DE_IG_Y_FB: RedDeComentarios[] = ['instagram', 'facebook']
export const DIAS_ENTRE_LECTURAS_DE_UNA_CUENTA = 7
export const MAX_CUENTAS_POR_CORRIDA = 8
export const PUBLICACIONES_A_PEDIR = 6
export const PUBLICACIONES_CON_COMENTARIOS = 2
export const COMENTARIOS_POR_PUBLICACION = 20
export const TOPE_DE_UNA_LLAMADA_USD = 0.08
export const TOPE_DEL_DIA_POR_CLIENTE_USD = 0.5
export const ACTORES_DE_COMENTARIOS = {
  tiktok: { publicaciones: 'apidojo~tiktok-scraper', comentarios: 'clockworks~tiktok-comments-scraper' },
  x: { publicaciones: 'apidojo~tweet-scraper', comentarios: 'apidojo~tweet-scraper' },
  facebook: { publicaciones: 'apify~facebook-posts-scraper', comentarios: 'apify~facebook-comments-scraper' },
  instagram: { publicaciones: 'apify~instagram-scraper', comentarios: 'apify~instagram-comment-scraper' },
} as const

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Obj[]) : [])
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= 0 ? Math.round(n) : null }
const usd = (v: unknown): number => { const n = typeof v === 'number' ? v : NaN; return Number.isFinite(n) && n >= 0 ? n : 0 }
const manejo = (h: string) => h.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(tiktok|x|twitter|facebook|fb|instagram)\.com\/@?/i, '').replace(/[/?#].*$/, '')
const fechaIso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v))
  const d = new Date(n)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

/** sin datos personales: fuera @usuarios, correos y números largos. El resto queda tal cual llegó, con sus saltos de línea (05-nov); un número no cruza de una línea a otra */
export function limpiarComentario(t: string): string {
  return t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ').replace(/@[\w.]+/g, ' ').replace(/\+?\d[\d \t\u00a0().-]{6,}\d/g, ' ').trim().slice(0, 800)
}

export interface Comentario { red: RedDeComentarios | 'instagram'; cuenta: string; rol: Rol; post_ref: string; post_url: string | null; comentario_ref: string; texto: string; me_gusta: number | null; fecha: string | null }
export interface Publicacion { ref: string; url: string; comentarios: number | null }

export function publicacionDe(red: RedDeComentarios, it: unknown): Publicacion | null {
  const x = obj(it)
  if (red === 'tiktok') { const ref = txt(x.id); const url = txt(x.postPage) || ''; return ref && url ? { ref, url, comentarios: num(x.comments) } : null }
  if (red === 'x') { const ref = txt(x.id); const url = txt(x.url) || txt(x.twitterUrl); return ref && url ? { ref, url, comentarios: num(x.replyCount) } : null }
  if (red === 'instagram') { const url = txt(x.url); const ref = txt(x.shortCode) || txt(x.id); return ref && url ? { ref, url, comentarios: num(x.commentsCount) } : null }
  const url = txt(x.url) || txt(x.postUrl); const ref = txt(x.postId) || txt(x.id) || url
  return url && ref ? { ref, url, comentarios: num(x.comments) ?? num(x.commentsCount) } : null
}

/** las que más comentarios tienen (y al menos 1): sin comentarios no se gasta en pedirlos */
export function publicacionesParaComentarios(ps: Publicacion[], n = PUBLICACIONES_CON_COMENTARIOS): Publicacion[] {
  return ps.filter((p) => (p.comentarios ?? 0) > 0).map((p, i) => ({ p, i })).sort((a, b) => (b.p.comentarios ?? 0) - (a.p.comentarios ?? 0) || a.i - b.i).slice(0, n).map((x) => x.p)
}

export function comentarioDe(red: RedDeComentarios, it: unknown, c: { cuenta: string; rol: Rol; post: Publicacion }): Comentario | null {
  const x = obj(it)
  let ref = '', texto = '', me_gusta: number | null = null, fecha: string | null = null
  if (red === 'tiktok') { ref = txt(x.cid); texto = txt(x.text); me_gusta = num(x.diggCount); fecha = fechaIso(x.createTimeISO ?? x.createTime) }
  else if (red === 'x') {
    if (x.noResults || obj(x.author).userName === c.cuenta) return null // el hilo del propio dueño no es un comentario de otros
    ref = txt(x.id); texto = txt(x.fullText) || txt(x.text); me_gusta = num(x.likeCount); fecha = fechaIso(x.createdAt)
  } else if (red === 'instagram') { ref = txt(x.id); texto = txt(x.text); me_gusta = num(x.likesCount); fecha = fechaIso(x.timestamp) }
  else { ref = txt(x.id) || txt(x.commentUrl); texto = txt(x.text); me_gusta = num(x.likesCount); fecha = fechaIso(x.date ?? x.createdAt ?? x.timestamp) }
  const limpio = limpiarComentario(texto)
  if (!ref || limpio.length < 9) return null
  return { red, cuenta: c.cuenta, rol: c.rol, post_ref: c.post.ref, post_url: c.post.url, comentario_ref: ref.slice(0, 200), texto: limpio, me_gusta, fecha }
}

export type EjecutarComentarios = (actor: string, input: Obj, maxUsd: number) => Promise<{ items: unknown[]; costo_usd: number }>

export interface CuentaAMirar { red: RedDeComentarios; cuenta: string; rol: Rol; nombre?: string }

/** las cuentas de la ficha: propias (`own_handles`, `own_social_handles`) y de cada competidor (`competitor_list[].handles`) */
export function cuentasDeLaFicha(config: unknown, redes: readonly RedDeComentarios[] = REDES_DE_COMENTARIOS): CuentaAMirar[] {
  const cfg = obj(config), apify = obj(cfg.apify)
  const propias = { ...obj(cfg.own_social_handles), ...obj(apify.own_handles) } as Record<string, unknown>
  const out: CuentaAMirar[] = []
  // el Instagram PROPIO ya entra por su raspado de siempre: aquí solo el de la competencia
  for (const red of redes) { if (red === 'instagram') continue; const h = manejo(txt(propias[red])); if (h) out.push({ red, cuenta: h, rol: 'propia' }) }
  for (const c of arr(apify.competitor_list)) {
    const m = obj(c.handles)
    for (const red of redes) { const h = manejo(txt(m[red] ?? (red === 'x' ? m.twitter : red === 'instagram' ? c.instagram : ''))); if (h) out.push({ red, cuenta: h, rol: 'competidor', nombre: txt(c.name) }) }
  }
  const vistos = new Set<string>()
  return out.filter((c) => { const k = `${c.rol}|${c.red}|${c.cuenta.toLowerCase()}`; if (vistos.has(k)) return false; vistos.add(k); return true })
}

const funcionDe = (rol: Rol, red: RedDeComentarios) => (rol === 'propia' ? `comentarios_${red}` : `comentarios_competencia_${red}`)

const urlDeCuenta = (red: RedDeComentarios, h: string) => (red === 'tiktok' ? `https://www.tiktok.com/@${h}` : red === 'x' ? `https://x.com/${h}` : red === 'instagram' ? `https://www.instagram.com/${h}/` : /^https?:/i.test(h) ? h : `https://www.facebook.com/${h}`)

/** lo que se pide de las publicaciones de una cuenta, por red */
function pedidoDePublicaciones(red: RedDeComentarios, cuenta: string): Obj {
  if (red === 'tiktok') return { startUrls: [urlDeCuenta('tiktok', cuenta)], maxItems: PUBLICACIONES_A_PEDIR }
  if (red === 'x') return { searchTerms: [`from:${cuenta}`], maxItems: PUBLICACIONES_A_PEDIR, sort: 'Top' }
  if (red === 'instagram') return { directUrls: [urlDeCuenta('instagram', cuenta)], resultsType: 'posts', resultsLimit: PUBLICACIONES_A_PEDIR }
  return { startUrls: [{ url: urlDeCuenta('facebook', cuenta) }], resultsLimit: PUBLICACIONES_A_PEDIR }
}
function pedidosDeComentarios(red: RedDeComentarios, ps: Publicacion[]): Obj[] {
  if (red === 'tiktok') return [{ postURLs: ps.map((p) => p.url), commentsPerPost: COMENTARIOS_POR_PUBLICACION, maxRepliesPerComment: 0 }]
  if (red === 'x') return ps.map((p) => ({ searchTerms: [`conversation_id:${p.ref}`], maxItems: COMENTARIOS_POR_PUBLICACION, sort: 'Top' }))
  if (red === 'instagram') return ps.map((p) => ({ directUrls: [p.url], resultsLimit: COMENTARIOS_POR_PUBLICACION }))
  return ps.map((p) => ({ startUrls: [{ url: p.url }], resultsLimit: COMENTARIOS_POR_PUBLICACION }))
}

export interface ResultadoDeCuenta { red: RedDeComentarios; cuenta: string; rol: Rol; publicaciones: number; con_comentarios: number; comentarios: number; costo_usd: number; causa?: string }

/** lee UNA cuenta: publicaciones → las más comentadas → comentarios; nunca lanza */
export async function leerComentariosDeUnaCuenta(c: CuentaAMirar, ejecutar: EjecutarComentarios, margenUsd: number, yaLeidas: ReadonlySet<string> = new Set()): Promise<{ r: ResultadoDeCuenta; comentarios: Comentario[]; intento_valido: boolean }> {
  const r: ResultadoDeCuenta = { red: c.red, cuenta: c.cuenta, rol: c.rol, publicaciones: 0, con_comentarios: 0, comentarios: 0, costo_usd: 0 }
  const comentarios: Comentario[] = []
  const gastar = (x: number) => { r.costo_usd = Math.round((r.costo_usd + x) * 1e6) / 1e6 }
  try {
    const a = ACTORES_DE_COMENTARIOS[c.red]
    const tope = Math.min(TOPE_DE_UNA_LLAMADA_USD, Math.max(0.01, margenUsd))
    const lp = await ejecutar(a.publicaciones, pedidoDePublicaciones(c.red, c.cuenta), tope)
    gastar(lp.costo_usd)
    // en X las publicaciones de la cuenta son ella misma; una respuesta de otro no cuenta como publicación suya
    const todas = lp.items.map((it) => publicacionDe(c.red, it)).filter((p): p is Publicacion => !!p)
    // UNA vez por publicación (02-nov): la que ya se leyó no se vuelve a pedir
    const posts = todas.filter((p) => !yaLeidas.has(p.ref))
    r.publicaciones = posts.length
    if (!posts.length) { r.causa = todas.length ? 'todas sus publicaciones recientes ya se leyeron antes' : 'la cuenta no devolvió publicaciones (no existe, es privada o el actor no la leyó)'; return { r, comentarios, intento_valido: true } }
    const elegidas = publicacionesParaComentarios(posts)
    r.con_comentarios = elegidas.length
    if (!elegidas.length) { r.causa = 'ninguna de sus publicaciones recientes tiene comentarios'; return { r, comentarios, intento_valido: true } }
    const pedidos = pedidosDeComentarios(c.red, elegidas)
    for (let i = 0; i < pedidos.length; i++) {
      const post = c.red === 'tiktok' ? null : elegidas[i]
      const lc = await ejecutar(a.comentarios, pedidos[i], Math.min(tope, Math.max(0.01, margenUsd - r.costo_usd)))
      gastar(lc.costo_usd)
      for (const it of lc.items) {
        // TikTok devuelve todos los comentarios juntos: cada uno trae la dirección de su video
        const origen = post ?? elegidas.find((p) => p.url === txt(obj(it).submittedVideoUrl) || p.url === txt(obj(it).videoWebUrl)) ?? elegidas[0]
        const k = comentarioDe(c.red, it, { cuenta: c.cuenta, rol: c.rol, post: origen })
        if (k) comentarios.push(k)
      }
    }
    const vistos = new Set<string>()
    const unicos = comentarios.filter((k) => (vistos.has(k.comentario_ref) ? false : (vistos.add(k.comentario_ref), true)))
    r.comentarios = unicos.length
    if (!unicos.length) r.causa = 'las publicaciones elegidas no devolvieron comentarios legibles'
    return { r, comentarios: unicos, intento_valido: true }
  } catch (e) {
    r.causa = (e instanceof Error ? e.message : String(e)).slice(0, 120)
    return { r, comentarios, intento_valido: false }
  }
}

export interface InformeDeComentarios { estado: 'corrida' | 'sin_cuentas' | 'todo_al_dia' | 'sin_token' | 'sin_base' | 'error'; cuentas_conocidas: number; leidas: number; omitidas_por_tope: number; comentarios: number; propios: number; competencia: number; por_red: Record<string, number>; costo_usd: number; cuentas: ResultadoDeCuenta[]; mensaje?: string }

/** la corrida de un cliente: elige las cuentas que toca mirar (≥7 días desde la última), las lee y guarda según su rol */
export async function comentariosDeRedes(a: { cliente: Obj; clientId: string; urlDeLaBase: string; llave: string; token: string; ahora: Date; ejecutar: EjecutarComentarios; fetchImpl?: Traer; soloLeer?: boolean; maxCuentas?: number; /** las redes de ESTE paso (por omisión todas) */ redes?: readonly RedDeComentarios[] }): Promise<InformeDeComentarios> {
  const informe: InformeDeComentarios = { estado: 'corrida', cuentas_conocidas: 0, leidas: 0, omitidas_por_tope: 0, comentarios: 0, propios: 0, competencia: 0, por_red: {}, costo_usd: 0, cuentas: [] }
  try {
    if (!a.token) return { ...informe, estado: 'sin_token' }
    if (!a.urlDeLaBase || !a.llave) return { ...informe, estado: 'sin_base' }
    const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
    const base = a.urlDeLaBase.replace(/\/$/, '')
    const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
    const todas = cuentasDeLaFicha(a.cliente.config, a.redes ?? REDES_DE_COMENTARIOS)
    informe.cuentas_conocidas = todas.length
    if (!todas.length) return { ...informe, estado: 'sin_cuentas' }
    // cuándo se miró cada cuenta: la última fila de intento de este cliente en los últimos 7 días
    const desde = new Date(a.ahora.getTime() - DIAS_ENTRE_LECTURAS_DE_UNA_CUENTA * 86_400_000).toISOString()
    const funciones = (a.redes ?? REDES_DE_COMENTARIOS).flatMap((red) => [funcionDe('propia', red), funcionDe('competidor', red)])
    const previas = await traer(`${base}/rest/v1/apify_raw?client_id=eq.${encodeURIComponent(a.clientId)}&ensayo=eq.false&apify_function=in.(${funciones.join(',')})&created_at=gte.${encodeURIComponent(desde)}&select=apify_function,metadata&limit=500`, { headers: auth })
    if (!previas.ok) return { ...informe, estado: 'sin_base', mensaje: `no se pudo leer lo ya mirado (HTTP ${previas.status})` }
    const yaMiradas = new Set(((await previas.json()) as Array<{ apify_function: string; metadata?: Obj }>).map((f) => `${f.apify_function}|${txt(obj(f.metadata).cuenta).toLowerCase()}`))
    const pendientes = todas.filter((c) => !yaMiradas.has(`${funcionDe(c.rol, c.red)}|${c.cuenta.toLowerCase()}`)).sort((x, y) => (x.rol === y.rol ? 0 : x.rol === 'propia' ? -1 : 1))
    if (!pendientes.length) return { ...informe, estado: 'todo_al_dia' }
    const hoy = pendientes.slice(0, a.maxCuentas ?? MAX_CUENTAS_POR_CORRIDA)
    informe.omitidas_por_tope = pendientes.length - hoy.length
    // las publicaciones de la competencia que ya tienen sus comentarios guardados: no se piden otra vez
    const leidas = new Map<string, Set<string>>()
    // solo el paso de Instagram y Facebook de la competencia lee lo ya guardado (el paso de siempre queda idéntico)
    if (a.redes?.includes('instagram')) {
      try {
        const pl = await traer(`${base}/rest/v1/cerebro_comentarios_competencia?client_id=eq.${encodeURIComponent(a.clientId)}&select=red,cuenta,post_ref&limit=5000`, { headers: auth })
        const filas = pl.ok ? ((await pl.json()) as Array<{ red: string; cuenta: string; post_ref: string }>) : []
        for (const f of Array.isArray(filas) ? filas : []) { const k = `${f.red}|${String(f.cuenta).toLowerCase()}`; leidas.set(k, (leidas.get(k) ?? new Set()).add(String(f.post_ref))) }
      } catch { /* sin lo ya leído: se pide como antes */ }
    }
    for (let i = 0; i < hoy.length; i += 3) {
      const margen = TOPE_DEL_DIA_POR_CLIENTE_USD - informe.costo_usd
      if (margen <= 0.01) { informe.omitidas_por_tope += hoy.length - i; break }
      const tanda = await Promise.all(hoy.slice(i, i + 3).map((c) => leerComentariosDeUnaCuenta(c, a.ejecutar, margen / 3, leidas.get(`${c.red}|${c.cuenta.toLowerCase()}`))))
      for (const t of tanda) {
        informe.leidas++; informe.costo_usd = Math.round((informe.costo_usd + t.r.costo_usd) * 1e6) / 1e6
        informe.cuentas.push(t.r)
        if (a.soloLeer || !t.intento_valido) continue
        // el intento queda en `apify_raw` (con o sin comentarios) para no repetirlo cada día
        const comentarios = t.comentarios
        const fila = { client_id: a.clientId, apify_function: funcionDe(t.r.rol, t.r.red), params: { cuenta: t.r.cuenta, red: t.r.red }, respuesta: t.r.rol === 'propia' ? comentarios.map((k) => ({ id: k.comentario_ref, text: k.texto, timestamp: k.fecha, likes: k.me_gusta, postUrl: k.post_url })) : [], filas: t.r.rol === 'propia' ? comentarios.length : 0, ensayo: false, metadata: { llamado_por: 'comentarios-de-redes', cuenta: t.r.cuenta, rol: t.r.rol, red: t.r.red, publicaciones: t.r.publicaciones, con_comentarios: t.r.con_comentarios, comentarios: t.r.comentarios, ...(t.r.causa ? { causa: t.r.causa } : {}) }, created_at: a.ahora.toISOString() }
        const w = await traer(`${base}/rest/v1/apify_raw`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(fila) })
        if (!w.ok) { t.r.causa = `${t.r.causa ? `${t.r.causa} · ` : ''}no se pudo guardar el intento (HTTP ${w.status})`; continue }
        informe.comentarios += comentarios.length
        informe.por_red[t.r.red] = (informe.por_red[t.r.red] ?? 0) + comentarios.length
        if (t.r.rol === 'propia') informe.propios += comentarios.length
        else if (comentarios.length) {
          const e = await guardarComentariosDeLaCompetencia({ clientId: a.clientId, comentarios, urlDeLaBase: a.urlDeLaBase, llave: a.llave, ahora: a.ahora, fetchImpl: traer })
          if (!e.error) informe.competencia += comentarios.length
          else t.r.causa = `${t.r.causa ? `${t.r.causa} · ` : ''}${e.error}`
        }
      }
    }
    return informe
  } catch (e) {
    return { ...informe, estado: 'error', mensaje: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}

/** guarda los comentarios de la competencia (sin repetir: una fila por comentario) con su fecha real */
export async function guardarComentariosDeLaCompetencia(a: { clientId: string; comentarios: Comentario[]; urlDeLaBase: string; llave: string; ahora: Date; fetchImpl?: Traer }): Promise<{ guardados: number; error?: string }> {
  if (!a.comentarios.length) return { guardados: 0 }
  if (!a.urlDeLaBase || !a.llave) return { guardados: 0, error: 'la base no está configurada en el servidor' }
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const filas = a.comentarios.map((k) => ({ client_id: a.clientId, red: k.red, cuenta: k.cuenta, post_ref: k.post_ref, post_url: k.post_url, comentario_ref: k.comentario_ref, texto: k.texto, me_gusta: k.me_gusta, fecha_comentario: k.fecha, observado_en: a.ahora.toISOString() }))
  const e = await traer(`${a.urlDeLaBase.replace(/\/$/, '')}/rest/v1/cerebro_comentarios_competencia?on_conflict=client_id,red,comentario_ref`, { method: 'POST', headers: { apikey: a.llave, Authorization: `Bearer ${a.llave}`, 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(filas) })
  return e.ok ? { guardados: filas.length } : { guardados: 0, error: `la tabla de comentarios de la competencia respondió HTTP ${e.status}` }
}

/** los comentarios que YA traen los videos de Instagram de la competencia (`latestComments`): van a la misma tabla, con su fecha real */
export function comentariosDeVideosDeLaCompetencia(filas: Array<{ apify_function?: unknown; respuesta?: unknown; ensayo?: unknown }>, propios: ReadonlySet<string>): Comentario[] {
  const out: Comentario[] = []
  const vistos = new Set<string>()
  for (const f of filas) {
    if (f.ensayo === true || f.apify_function !== 'videos_instagram') continue
    for (const v of arr(f.respuesta)) {
      const dueno = txt(v.ownerUsername).replace(/^@/, '').toLowerCase()
      if (!dueno || propios.has(dueno)) continue
      const post = txt(v.shortCode) || txt(v.id)
      for (const c of arr(v.latestComments)) {
        const texto = limpiarComentario(txt(c.text))
        const ref = txt(c.id)
        if (!ref || texto.length < 9 || vistos.has(ref)) continue
        vistos.add(ref)
        out.push({ red: 'instagram', cuenta: dueno, rol: 'competidor', post_ref: post, post_url: txt(v.url) || null, comentario_ref: ref, texto, me_gusta: num(c.likesCount), fecha: fechaIso(c.timestamp) })
      }
    }
  }
  return out
}

/** una pasada de apify real con tope de gasto (misma forma que la de tendencias) */
export function ejecutarComentarios(o: { token: string; fetchImpl?: Traer; esperaMs?: number }): EjecutarComentarios {
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
    if (run.status !== 'SUCCEEDED' && !run.defaultDatasetId) throw new Error(`la corrida terminó ${String(run.status)}`)
    const d = await traer(`https://api.apify.com/v2/datasets/${String(run.defaultDatasetId)}/items?token=${encodeURIComponent(o.token)}&limit=80&clean=1`)
    const items = d.ok ? ((await d.json()) as unknown[]) : []
    return { items: Array.isArray(items) ? items : [], costo_usd: usd(run.usageTotalUsd) }
  }
}
