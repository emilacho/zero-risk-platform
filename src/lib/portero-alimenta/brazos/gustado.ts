/**
 * BRAZO · LO MÁS GUSTADO POR EL PÚBLICO (30-oct · firma de Emilio «DALE») · PURO, sin modelo.
 * «Raspar las publicaciones más likeadas de la industria (p. ej. restaurantes de mariscos en Guayaquil), agruparlas y ponerles nota: "estas son las más gustadas por el público", o una tendencia.»
 *
 *  · BUSCA en Instagram por los hashtags del rubro + la ciudad del cliente (se derivan de su ficha; el dueño puede declarar los suyos en `config.apify.hashtags_de_gusto`), con el Servicio de Apify (`instagram_scraper`
 *    con la dirección del hashtag). Una vez por semana por ciudad. En una segunda pasada pide el perfil de las cuentas que salieron (seguidores) para poder medir con justicia.
 *  · ORDENA por gusto relativo: (likes + comentarios) ÷ seguidores de la cuenta, con un PISO de seguidores contados (`PISO_DE_SEGUIDORES`) para que ni gane solo la cuenta grande ni una cuenta diminuta con 5 likes.
 *    La medida queda escrita en la nota, con las tres cifras de cada publicación.
 *  · AGRUPA las 10 mejores por formato (foto, carrusel, video), gancho del texto y tema (palabras que se repiten) y archiva dos clases de nota (con `alcance = mercado`, dato de terceros):
 *      «lo_mas_gustado»  · las 10, cada una con enlace, cuenta, likes, comentarios y fecha;
 *      «tendencia_del_publico» · cuando un mismo tipo se repite (≥ 3 de las 10).
 *  · Lo mismo con las publicaciones PROPIAS del cliente (`alcance = cliente`): cuáles gustaron más.
 *  · Todo es dato: rubro y ciudad salen de la ficha del cliente; nada de un cliente en el código.
 */
import { normalizar } from '../../manual/texto'
import { DIA_EN_MS, MARCA_DE_BRAZO, slugDe, sinUsuarios, type AccionDeBrazo, type FichaDeBrazo, type ResultadoDeUnBrazo } from './tipos'
import { esFilaDeBrazo, type FilaCrudaDeBrazo } from './demanda'

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const lista = (x: unknown): Array<Record<string, unknown>> => (Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [])
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const miles = (n: number): string => Math.round(n).toLocaleString('es-EC').replace(/ /g, ' ')
const pct = (x: number): string => `${(Math.round(x * 1000) / 10).toString().replace('.', ',')} %`

/** el día de la semana (UTC; 4 = jueves) en que se buscan los hashtags; `forzar` lo salta */
export const DIA_DE_GUSTADO = 4
export const HASHTAGS_POR_CIUDAD = 3
/** el Servicio guarda hasta 200.000 caracteres por llamada (más se corta): una publicación pesa 2–7 mil, un perfil con sus últimos posts ≈ 70 mil, así que una llamada por hashtag y 2 perfiles por llamada */
export const PUBLICACIONES_POR_HASHTAG = 25
export const PERFILES_POR_LLAMADA = 2
/** máximo de publicaciones de una misma cuenta entre las 10: sin tope, una cuenta activa ocupa todo el ranking y su estilo parece «tendencia» */
export const MAX_POR_CUENTA = 2
export const TOP_DE_GUSTADO = 10
/** cuentas de las que se pide el perfil (seguidores) en cada pasada */
export const PERFILES_POR_PASADA = 6
/** seguidores mínimos que se cuentan al medir: sin piso, una cuenta de 12 seguidores con 6 likes ganaría a todas */
export const PISO_DE_SEGUIDORES = 300
/** una publicación con menos interacciones que esto no entra al ranking (es ruido, no gusto) */
export const MINIMO_DE_INTERACCIONES = 10
/** un tema (palabra) es «tendencia» cuando aparece en al menos esto de las 10; un formato o un gancho (pocas categorías, se repiten por azar) pide `MINIMO_PARA_TENDENCIA_DE_FORMA` */
export const MINIMO_PARA_TENDENCIA = 3
export const MINIMO_PARA_TENDENCIA_DE_FORMA = 4
/** de cada dimensión solo se archiva lo que más se repite (no «video» y «foto» a la vez): 1 formato, 1 gancho, 2 temas */
export const MAX_TENDENCIAS = { formato: 1, gancho: 1, tema: 2 } as const
/** lo más gustado habla de lo que se ve hoy: una publicación de hace más de esto no entra al ranking del mercado */
export const EDAD_MAXIMA_DIAS = 180
const VIGENCIA_DIAS = 14
const USD = { hashtags: 0.02, perfiles: 0.025 }
const HASHTAG_RECIENTE_DIAS = 6
const PERFIL_RECIENTE_DIAS = 30
const FILA_RECIENTE_DIAS = 14

export const MARCA_HASHTAG = 'gustado:hashtag:'
export const MARCA_PERFILES = 'gustado:perfiles'

const sinTildes = (t: string): string => normalizar(t).replace(/[^a-z0-9]+/g, '')
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'en', 'para', 'con', 'por', 'que', 'un', 'una', 'al', 'su', 'sus', 'mas', 'muy', 'como', 'este', 'esta', 'todo', 'todos', 'hasta', 'desde', 'sobre', 'entre', 'pero', 'tambien', 'solo', 'cada', 'tus', 'nuestro', 'nuestra', 'estamos', 'tenemos', 'aqui', 'hoy', 'ven', 'vive'])
/** palabras corrientes del idioma que no son un tema (dato de idioma, no de un cliente): se suman a las vacías al buscar temas que se repiten */
const PALABRAS_SIN_TEMA = new Set(['siempre', 'nunca', 'gracias', 'comida', 'plato', 'platos', 'local', 'locales', 'restaurante', 'restaurantes', 'experiencia', 'disfruta', 'disfrutar', 'ahora', 'ademas', 'tiene', 'tienen', 'puedes', 'hacer', 'mejor', 'mejores', 'buena', 'bueno', 'buenas', 'tarde', 'noche', 'semana', 'fines'])

/** los hashtags del rubro + ciudad (sin #): los declarados por el dueño, o la palabra más específica del rubro pegada a la ciudad, la otra palabra pegada a la ciudad y la palabra sola */
export function hashtagsDeGusto(e: { terminos: string[]; ciudad: string; declarados?: unknown }): string[] {
  const declarados = (Array.isArray(e.declarados) ? e.declarados : []).map((t) => sinTildes(String(t))).filter((t) => t.length >= 4)
  if (declarados.length) return [...new Set(declarados)].slice(0, HASHTAGS_POR_CIUDAD)
  const significativas = (t: string): string[] => normalizar(t).split(/\s+/).map(sinTildes).filter((p) => p.length >= 4 && !PALABRAS_VACIAS.has(p))
  const todas = [...new Set(e.terminos.flatMap(significativas))]
  if (!todas.length) return []
  // la palabra que cierra el primer término suele ser la más específica («restaurante mariscos» → mariscos)
  const delPrimero = significativas(e.terminos[0] ?? '')
  const clave = delPrimero[delPrimero.length - 1] ?? todas[0]
  const otra = todas.find((p) => p !== clave) ?? clave
  const ciudad = sinTildes(e.ciudad)
  const tags = ciudad ? [`${clave}${ciudad}`, `${otra}${ciudad}`, clave] : [clave, otra]
  return [...new Set(tags)].slice(0, HASHTAGS_POR_CIUDAD)
}

export interface Publicacion {
  id: string
  url: string
  cuenta: string
  likes: number
  comentarios: number
  fecha: string | null
  formato: 'foto' | 'carrusel' | 'video'
  texto: string
}

const formatoDe = (p: Record<string, unknown>): Publicacion['formato'] => {
  const t = normalizar(txt(p.type) || txt(p.productType))
  if (/video|clips|reel/.test(t) || /clips|reel/.test(normalizar(txt(p.productType)))) return 'video'
  if (/sidecar|carousel|carrusel/.test(t)) return 'carrusel'
  return 'foto'
}

/** los registros de una respuesta guardada. El Servicio corta lo que pasa de 200.000 caracteres y lo guarda como `{ _truncado, muestra }`: de esa muestra se rescatan los registros COMPLETOS (hasta el último `},{`). */
export function registrosDe(respuesta: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(respuesta)) return lista(respuesta)
  const m = obj(respuesta).muestra
  if (typeof m !== 'string') return []
  const corte = m.lastIndexOf('},{')
  if (corte < 0) return []
  try { return lista(JSON.parse(`${m.slice(0, corte + 1)}]`)) } catch { return [] }
}
export const fueCortada = (respuesta: unknown): boolean => !Array.isArray(respuesta) && obj(respuesta)._truncado === true

/** las publicaciones de una fila cruda del Servicio: las de un hashtag (una fila por publicación) o las de un perfil (`latestPosts`). Likes ocultos (-1) → la publicación no se puede medir y se omite. */
export function publicacionesDe(respuesta: unknown): Publicacion[] {
  const out: Publicacion[] = []
  const poner = (p: Record<string, unknown>, cuentaDelPerfil: string) => {
    const likes = num(p.likesCount), com = num(p.commentsCount)
    if (likes === null || likes < 0 || com === null || com < 0) return
    const cuenta = (txt(p.ownerUsername) || cuentaDelPerfil).toLowerCase()
    const codigo = txt(p.shortCode) || txt(p.id)
    const url = txt(p.url) || (codigo ? `https://www.instagram.com/p/${codigo}/` : '')
    if (!cuenta || !url) return
    const t = txt(p.timestamp)
    out.push({ id: codigo || url, url, cuenta, likes, comentarios: com, fecha: t && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString().slice(0, 10) : null, formato: formatoDe(p), texto: sinUsuarios(p.caption, 400) })
  }
  for (const it of registrosDe(respuesta)) {
    if (Array.isArray(it.latestPosts)) for (const p of lista(it.latestPosts)) poner(p, txt(it.username))
    else poner(it, '')
  }
  return out
}

/** seguidores por cuenta: de las filas de perfil (la más reciente manda) */
export function seguidoresPorCuenta(filas: FilaCrudaDeBrazo[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of [...filas].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    for (const it of registrosDe(f.respuesta)) {
      const u = txt(it.username).toLowerCase(), s = num(it.followersCount)
      if (u && s !== null && s >= 0) m.set(u, s)
    }
  }
  return m
}

export interface Puntuada extends Publicacion { interacciones: number; seguidores: number | null; gusto: number | null }
/** las `n` mejores con a lo más `MAX_POR_CUENTA` por cuenta (el orden de entrada se respeta) */
export function mejoresVariadas(ranking: Puntuada[], n = TOP_DE_GUSTADO): Puntuada[] {
  const por = new Map<string, number>()
  const out: Puntuada[] = []
  for (const p of ranking) {
    if ((por.get(p.cuenta) ?? 0) >= MAX_POR_CUENTA) continue
    por.set(p.cuenta, (por.get(p.cuenta) ?? 0) + 1)
    out.push(p)
    if (out.length === n) break
  }
  return out
}
/** (likes + comentarios) ÷ max(seguidores, piso). Sin seguidores conocidos: no se puede medir con justicia → `gusto` null y va después de las que sí. */
export function ordenarPorGusto(pubs: Publicacion[], seguidores: Map<string, number>): Puntuada[] {
  const vistos = new Set<string>()
  const todas: Puntuada[] = []
  for (const p of pubs) {
    if (vistos.has(p.id)) continue
    vistos.add(p.id)
    const interacciones = p.likes + p.comentarios
    if (interacciones < MINIMO_DE_INTERACCIONES) continue
    const s = seguidores.get(p.cuenta) ?? null
    todas.push({ ...p, interacciones, seguidores: s, gusto: s === null ? null : interacciones / Math.max(s, PISO_DE_SEGUIDORES) })
  }
  const conMedida = todas.filter((p) => p.gusto !== null).sort((a, b) => (b.gusto as number) - (a.gusto as number) || b.interacciones - a.interacciones)
  const sinMedida = todas.filter((p) => p.gusto === null).sort((a, b) => b.interacciones - a.interacciones)
  return [...conMedida, ...sinMedida]
}

/** el rubro como se muestra: sin conectores colgando al final («seguridad industrial protección contra» → «seguridad industrial protección») */
export function rubroLegible(t: string): string {
  const p = t.trim().split(/\s+/)
  while (p.length > 1 && /^(contra|de|del|para|con|y|e|en|la|el|los|las)$/i.test(p[p.length - 1])) p.pop()
  return p.join(' ')
}
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

export function ganchoDe(texto: string): string {
  const t = texto.trim()
  if (t.length < 15) return 'sin texto (solo imagen)'
  const n = normalizar(t)
  if (/[?¿]/.test(t.slice(0, 140))) return 'pregunta'
  if (/(\$|%|\b\d+\s?x\s?\d+\b|promo|oferta|descuento|gratis|combo|precio)/.test(n)) return 'oferta o precio'
  if (/\b(reserva|reservas|pide|pidelo|escribe|escribenos|ordena|compra|llama|llamanos|link|enlace|whatsapp|visitanos|ven a)\b/.test(n)) return 'invitación a actuar'
  if (t.length > 300) return 'historia (texto largo)'
  return 'descripción simple'
}

/** palabras (≥ 5 letras, sin vacías, sin hashtags ni la marca de la búsqueda) que aparecen en el texto de al menos `minimo` publicaciones */
export function temasQueSeRepiten(pubs: Publicacion[], excluir: string[], minimo = MINIMO_PARA_TENDENCIA): Array<{ tema: string; veces: number }> {
  const fuera = new Set(excluir.map(sinTildes))
  const cuenta = new Map<string, number>()
  for (const p of pubs) {
    const ps = new Set(normalizar(p.texto).replace(/#\w+/g, ' ').split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 5 && !PALABRAS_VACIAS.has(w) && !PALABRAS_SIN_TEMA.has(w) && !fuera.has(w) && !/^\d+$/.test(w)))
    for (const w of ps) cuenta.set(w, (cuenta.get(w) ?? 0) + 1)
  }
  return [...cuenta.entries()].filter(([, v]) => v >= minimo).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([tema, veces]) => ({ tema, veces })).slice(0, 5)
}

export interface Grupo { dimension: 'formato' | 'gancho' | 'tema'; valor: string; veces: number }
export function agruparTop(top: Puntuada[], excluir: string[]): Grupo[] {
  const porDim = (dim: Grupo['dimension'], f: (p: Puntuada) => string): Grupo[] => {
    const m = new Map<string, number>()
    for (const p of top) m.set(f(p), (m.get(f(p)) ?? 0) + 1)
    return [...m.entries()].map(([valor, veces]) => ({ dimension: dim, valor, veces })).sort((a, b) => b.veces - a.veces || (a.valor < b.valor ? -1 : 1))
  }
  const temas = temasQueSeRepiten(top, excluir).map((t): Grupo => ({ dimension: 'tema', valor: t.tema, veces: t.veces }))
  return [...porDim('formato', (p) => p.formato), ...porDim('gancho', (p) => ganchoDe(p.texto)), ...temas]
}

const ROTULO_FORMATO: Record<Publicacion['formato'], string> = { foto: 'foto', carrusel: 'carrusel de fotos', video: 'video o reel' }
function lineaDe(i: number, p: Puntuada): string {
  const seg = p.seguidores === null ? 'seguidores sin dato' : `${miles(p.seguidores)} seguidores`
  const g = p.gusto === null ? 'sin medida relativa' : `gusto ${pct(p.gusto)}`
  return `${i + 1}. @${p.cuenta} · ${ROTULO_FORMATO[p.formato]} · ${miles(p.likes)} likes + ${miles(p.comentarios)} comentarios · ${seg} · ${g} · ${p.fecha ?? 'sin fecha'} · gancho: ${ganchoDe(p.texto)} · ${p.url}`
}
const MEDIDA = `Medida: gusto = (likes + comentarios) ÷ seguidores de la cuenta (se cuentan al menos ${PISO_DE_SEGUIDORES} seguidores y no entran las de menos de ${MINIMO_DE_INTERACCIONES} interacciones), para que no gane solo la cuenta grande; las tres cifras van a la vista.`

// ───────────────────────── acciones (lo que se pide a Apify) ─────────────────────────

export interface EntradaDeAccionesDeGustado {
  terminos: string[]
  ciudades: string[]
  config?: unknown
  ahora: Date
  forzar?: boolean
  /** filas crudas ya guardadas (sin ensayo): de ahí salen los hashtags ya pedidos y las cuentas por mirar */
  filas: FilaCrudaDeBrazo[]
  handlesPropios?: string[]
}
const marcaDe = (f: FilaCrudaDeBrazo): string => String(obj(f.params)[MARCA_DE_BRAZO] ?? '')

export function accionesDeGustado(e: EntradaDeAccionesDeGustado): { acciones: AccionDeBrazo[]; no_cubiertas: Array<{ fuente: string; por_que: string }> } {
  const acciones: AccionDeBrazo[] = []
  const no_cubiertas: Array<{ fuente: string; por_que: string }> = []
  const meta = { target_kind: 'third_party' as const, llamado_por: 'portero-alimentar' }
  const ahora = e.ahora.getTime()
  const declarados = obj(obj(e.config).apify).hashtags_de_gusto
  if (!e.ciudades.length) no_cubiertas.push({ fuente: 'gustado', por_que: 'gustado: la ficha del cliente no dice la ciudad: sin ciudad no se busca lo más gustado del rubro' })
  const hoyToca = e.forzar === true || e.ahora.getUTCDay() === DIA_DE_GUSTADO
  for (const ciudad of e.ciudades) {
    const slug = slugDe(ciudad)
    const recientes = e.filas.some((f) => esFilaDeBrazo(f, MARCA_HASHTAG + slug) && marcaDe(f) === MARCA_HASHTAG + slug && ahora - Date.parse(f.created_at) < HASHTAG_RECIENTE_DIAS * DIA_EN_MS)
    if (!hoyToca || (recientes && !e.forzar)) continue
    const tags = hashtagsDeGusto({ terminos: e.terminos, ciudad, declarados })
    if (!tags.length) { no_cubiertas.push({ fuente: 'gustado', por_que: 'gustado: el rubro no da palabras para armar hashtags (declara `config.apify.hashtags_de_gusto`)' }); continue }
    for (const t of tags) acciones.push({ fuente: 'gustado', funcion: 'instagram_scraper', params: { directUrls: [`https://www.instagram.com/explore/tags/${t}/`], resultsType: 'posts', resultsLimit: PUBLICACIONES_POR_HASHTAG, [MARCA_DE_BRAZO]: MARCA_HASHTAG + slug }, metadata: meta, usd_max: USD.hashtags, medido: false, objetivo: `lo más gustado · #${t}` })
  }
  // segunda pasada: los perfiles (seguidores) de las cuentas que salieron en los hashtags y de las que aún no se sabe cuántos seguidores tienen
  const hace7 = ahora - 7 * DIA_EN_MS
  const hashtags = e.filas.filter((f) => marcaDe(f).startsWith(MARCA_HASHTAG) && Date.parse(f.created_at) >= hace7)
  if (hashtags.length) {
    const conocidos = new Set<string>()
    for (const f of e.filas) {
      if (f.ensayo === true) continue
      const reciente = ahora - Date.parse(f.created_at) < PERFIL_RECIENTE_DIAS * DIA_EN_MS
      if (reciente) for (const it of registrosDe(f.respuesta)) if (num(it.followersCount) !== null && txt(it.username)) conocidos.add(txt(it.username).toLowerCase())
      // una cuenta ya pedida (aunque no haya devuelto seguidores: privada, borrada) no se vuelve a pedir en 30 días
      if (reciente && marcaDe(f) === MARCA_PERFILES) for (const u of Array.isArray(obj(f.params).usernames) ? (obj(f.params).usernames as unknown[]) : []) conocidos.add(txt(u).toLowerCase())
    }
    const propios = new Set((e.handlesPropios ?? []).map((h) => h.toLowerCase()))
    const pendientes = new Map<string, number>()
    for (const f of hashtags) for (const p of publicacionesDe(f.respuesta)) if (!conocidos.has(p.cuenta) && !propios.has(p.cuenta)) pendientes.set(p.cuenta, Math.max(pendientes.get(p.cuenta) ?? 0, p.likes + p.comentarios))
    const cuentas = [...pendientes.entries()].filter(([, v]) => v >= MINIMO_DE_INTERACCIONES).sort((a, b) => b[1] - a[1]).slice(0, PERFILES_POR_PASADA).map(([c]) => c)
    for (let i = 0; i < cuentas.length; i += PERFILES_POR_LLAMADA) {
      const lote = cuentas.slice(i, i + PERFILES_POR_LLAMADA)
      acciones.push({ fuente: 'gustado', funcion: 'instagram_scraper', params: { usernames: lote, resultsType: 'details', resultsLimit: 1, [MARCA_DE_BRAZO]: MARCA_PERFILES }, metadata: meta, usd_max: USD.perfiles, medido: false, objetivo: `lo más gustado · seguidores de ${lote.map((c) => `@${c}`).join(' ')}` })
    }
  }
  return { acciones, no_cubiertas }
}

// ───────────────────────── fichas (lo que se archiva) ─────────────────────────

export interface EntradaDeFichasDeGustado {
  client_id: string
  nombre: string
  terminos: string[]
  ciudades: string[]
  config?: unknown
  ahora: Date
  filas: FilaCrudaDeBrazo[]
  handlesPropios: string[]
}
export function fichasDeGustado(e: EntradaDeFichasDeGustado): ResultadoDeUnBrazo {
  const fichas: FichaDeBrazo[] = []
  const declarado: string[] = []
  const reales = e.filas.filter((f) => f.ensayo !== true && Date.parse(f.created_at) >= e.ahora.getTime() - 60 * DIA_EN_MS)
  const seguidores = seguidoresPorCuenta(reales)
  const dia = e.ahora.toISOString().slice(0, 10)
  const vigente_hasta = new Date(e.ahora.getTime() + VIGENCIA_DIAS * DIA_EN_MS).toISOString()
  const rubro = rubroLegible(e.terminos[0] ?? 'el rubro')
  const rubroSlug = slugDe(rubro)

  for (const ciudad of e.ciudades) {
    const slug = slugDe(ciudad)
    const recientes = reales.filter((f) => Date.parse(f.created_at) >= e.ahora.getTime() - FILA_RECIENTE_DIAS * DIA_EN_MS)
    const delHashtag = recientes.filter((f) => marcaDe(f) === MARCA_HASHTAG + slug)
    // los competidores vigilados (sus publicaciones ya raspadas) son del mismo mercado: entran al mismo ranking
    const delMercado = recientes.filter((f) => /^competencia:[a-z0-9-]+:instagram$/.test(marcaDe(f)))
    if (!delHashtag.length) { declarado.push(`lo más gustado · ${ciudad}: todavía no hay una corrida de hashtags reciente (se pide los jueves, una vez por semana)`); continue }
    const propios = new Set(e.handlesPropios.map((h) => h.toLowerCase()))
    const limite = e.ahora.getTime() - EDAD_MAXIMA_DIAS * DIA_EN_MS
    const pubs = [...delHashtag, ...delMercado].flatMap((f) => publicacionesDe(f.respuesta)).filter((p) => !propios.has(p.cuenta) && (!p.fecha || Date.parse(p.fecha) >= limite))
    const ranking = ordenarPorGusto(pubs, seguidores)
    if (!ranking.length) { declarado.push(`lo más gustado · ${ciudad}: ninguna publicación de los últimos ${EDAD_MAXIMA_DIAS} días llegó al mínimo de ${MINIMO_DE_INTERACCIONES} interacciones`); continue }
    const top = mejoresVariadas(ranking)
    const tags = [...new Set(delHashtag.flatMap((f) => (Array.isArray(obj(f.params).directUrls) ? (obj(f.params).directUrls as unknown[]) : []).map((u) => /\/tags\/([^/]+)/.exec(String(u))?.[1] ?? '')).filter(Boolean))]
    const fecha = delHashtag.map((f) => f.created_at).sort().pop() as string
    const sinMedida = top.filter((p) => p.gusto === null).length
    const cuentasDistintas = new Set(top.map((p) => p.cuenta)).size
    const grupos = agruparTop(top, [...tags, ...e.terminos.flatMap((t) => t.split(/\s+/)), ciudad])
    const comun = { brazo: 'gustado' as const, alcance: 'mercado' as const, client_id: e.client_id, origen: 'tercero' as const, decision: 'reemplaza' as const, fuente_url: null, fecha_fuente: fecha.slice(0, 10), observado_en: fecha, vigente_hasta, sobre: `${rubro} · ${ciudad}` }
    fichas.push({
      ...comun, ref: `brazo:gustado:mercado:${rubroSlug}:${slug}:${dia}`, atributo: `gustado:mercado:${rubroSlug}:${slug}`, clase: 'lo_mas_gustado', titulo: `Lo más gustado por el público · ${rubro} · ${ciudad}`,
      contenido: `Estas son las ${plural(top.length, 'publicación', 'publicaciones')} de Instagram más gustadas por el público en «${rubro}» en ${ciudad}, de ${ranking.length} revisadas de ${plural(cuentasDistintas, 'cuenta', 'cuentas')} (de los últimos ${EDAD_MAXIMA_DIAS} días, hasta ${MAX_POR_CUENTA} por cuenta; hashtags ${tags.map((t) => `#${t}`).join(' ')}, vistas el ${fecha.slice(0, 10)}). ${MEDIDA}${sinMedida ? ` ${sinMedida} de las ${top.length} aún sin seguidores conocidos (van al final, por interacciones).` : ''} Dato de terceros, no del cliente.\n${top.map((p, i) => lineaDe(i, p)).join('\n')}`,
      datos: { ciudad, rubro, hashtags: tags, revisadas: ranking.length, medida: 'gusto = (likes + comentarios) / max(seguidores, 300)', piso_de_seguidores: PISO_DE_SEGUIDORES, publicaciones: top.map((p) => ({ url: p.url, cuenta: p.cuenta, likes: p.likes, comentarios: p.comentarios, seguidores: p.seguidores, gusto: p.gusto === null ? null : Math.round(p.gusto * 10000) / 10000, fecha: p.fecha, formato: p.formato })) },
    })
    const elegidas: Grupo[] = []
    for (const dim of ['formato', 'gancho', 'tema'] as const) {
      const minimo = dim === 'tema' ? MINIMO_PARA_TENDENCIA : MINIMO_PARA_TENDENCIA_DE_FORMA
      elegidas.push(...grupos.filter((x) => x.dimension === dim && x.veces >= minimo).slice(0, MAX_TENDENCIAS[dim]))
    }
    for (const g of elegidas) {
      const frase = g.dimension === 'formato' ? `${g.veces} de las ${top.length} más gustadas son ${ROTULO_FORMATO[g.valor as Publicacion['formato']] ?? g.valor}` : g.dimension === 'gancho' ? `${g.veces} de las ${top.length} más gustadas abren con ${g.valor === 'sin texto (solo imagen)' ? 'casi ningún texto (solo imagen)' : `un gancho de tipo «${g.valor}»`}` : `${g.veces} de las ${top.length} más gustadas hablan de «${g.valor}»`
      const ejemplos = top.filter((p) => (g.dimension === 'formato' ? p.formato === g.valor : g.dimension === 'gancho' ? ganchoDe(p.texto) === g.valor : normalizar(p.texto).includes(g.valor))).slice(0, 3)
      fichas.push({
        ...comun, ref: `brazo:gustado:tendencia:${rubroSlug}:${slug}:${g.dimension}-${slugDe(g.valor)}:${dia}`, atributo: `gustado:tendencia:${rubroSlug}:${slug}:${g.dimension}-${slugDe(g.valor)}`, clase: 'tendencia_del_publico', titulo: `Tendencia · ${rubro} · ${ciudad} · ${g.dimension}: ${g.valor}`,
        contenido: `Tendencia en «${rubro}» en ${ciudad}: ${frase}. Se repite un mismo tipo de pieza entre lo que más gusta al público (no es una receta: es lo que hoy se ve). Ejemplos: ${ejemplos.map((p) => `@${p.cuenta} ${p.url}`).join(' · ')}. ${MEDIDA} Dato de terceros, no del cliente.`,
        datos: { ciudad, rubro, dimension: g.dimension, valor: g.valor, veces: g.veces, de: top.length },
      })
    }
  }

  // las publicaciones PROPIAS: cuáles gustaron más
  const propiasPubs = reales.filter((f) => registrosDe(f.respuesta).some((it) => e.handlesPropios.map((h) => h.toLowerCase()).includes(txt(it.username).toLowerCase()))).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const filaPropia = propiasPubs[0]
  if (filaPropia) {
    const mias = new Set(e.handlesPropios.map((h) => h.toLowerCase()))
    const pubs = publicacionesDe(filaPropia.respuesta).filter((p) => mias.has(p.cuenta))
    const ranking = ordenarPorGusto(pubs, seguidoresPorCuenta([filaPropia])).slice(0, 5)
    // entre sus propias publicaciones todas comparten cuenta: manda lo que más interacción tuvo
    ranking.sort((a, b) => b.interacciones - a.interacciones)
    if (ranking.length) {
      fichas.push({
        brazo: 'gustado', alcance: 'cliente', client_id: e.client_id, origen: 'plataforma', decision: 'reemplaza', fuente_url: `https://www.instagram.com/${[...mias][0]}/`, fecha_fuente: filaPropia.created_at.slice(0, 10), observado_en: filaPropia.created_at, vigente_hasta,
        ref: `brazo:gustado:propias:${dia}`, atributo: 'gustado:propias', clase: 'lo_mas_gustado_propio', titulo: `Lo más gustado de tus publicaciones · ${e.nombre}`,
        contenido: `${plural(ranking.length, 'publicación propia', 'publicaciones propias')} de Instagram que más gustaron, de ${pubs.length} revisadas (vistas el ${filaPropia.created_at.slice(0, 10)}). Entre publicaciones de la misma cuenta manda lo que más interacción tuvo (likes + comentarios).\n${ranking.map((p, i) => lineaDe(i, p)).join('\n')}`,
        datos: { publicaciones: ranking.map((p) => ({ url: p.url, likes: p.likes, comentarios: p.comentarios, fecha: p.fecha, formato: p.formato })), revisadas: pubs.length },
      })
    } else declarado.push('lo más gustado propio: las publicaciones propias ya raspadas no llegan al mínimo de interacciones o no muestran sus likes')
  } else declarado.push('lo más gustado propio: no hay una lectura reciente de las publicaciones de la cuenta propia de Instagram')

  return { brazo: 'gustado', estado: fichas.length ? 'listo' : 'sin_material', fichas, declarado }
}
