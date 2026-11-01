/**
 * LAS CUENTAS DE TIKTOK Y X · 01-nov (encargo «cerrar huecos», punto 4).
 * El sistema busca solo la cuenta PROPIA del cliente y las de cada competidor nombrado, y las deja en la ficha (`config.apify.own_handles` y `competitor_list[].handles`).
 * REGLA ÚNICA (la misma de Mapas: «el nombre exacto o la cuenta, nunca un homónimo»): un perfil se acepta solo si
 *   · «cuenta»: su biografía o su enlace nombran el sitio web del negocio o una cuenta suya ya conocida (la de Instagram, por ejemplo); o
 *   · «nombre y lugar»: su nombre es EXACTAMENTE el del negocio y su biografía o ubicación nombra la ciudad o el país del negocio.
 * Dos perfiles que cumplan = ambigua: no se guarda ninguno. Si no hay uno, se DECLARA «no hallada» con los perfiles que se descartaron y por qué; la búsqueda no se repite hasta 30 días después.
 * Nunca tumba la corrida: devuelve lo que no pudo.
 */
type Obj = Record<string, unknown>
type Traer = (url: string, init?: RequestInit) => Promise<Response>
export type RedDeCuenta = 'tiktok' | 'x'
export const REDES_DE_CUENTAS: RedDeCuenta[] = ['tiktok', 'x']
export const DIAS_ENTRE_BUSQUEDAS_DE_CUENTA = 30
export const MAX_BUSQUEDAS_POR_CORRIDA = 12
export const PERFILES_POR_BUSQUEDA = 5
export const TOPE_DE_UNA_BUSQUEDA_USD = 0.03
export const ACTORES_DE_CUENTAS: Record<RedDeCuenta, string> = { tiktok: 'clockworks~tiktok-user-search-scraper', x: 'apidojo~twitter-user-scraper' }

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const compacto = (t: string) => norm(t).replace(/ /g, '')
const manejoLimpio = (h: string) => h.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(tiktok|x|twitter|instagram)\.com\/@?/i, '').replace(/[/?#].*$/, '')

export interface Perfil { red: RedDeCuenta; handle: string; nombre: string; bio: string; enlaces: string; lugar: string; seguidores: number | null }

/** un perfil crudo de cada actor → la forma común; lo que no trae queda vacío */
export function perfilDe(red: RedDeCuenta, it: unknown): Perfil | null {
  const x = obj(it)
  if (red === 'tiktok') {
    const handle = txt(x.name) || manejoLimpio(txt(x.profileUrl))
    if (!handle) return null
    return { red, handle, nombre: txt(x.nickName), bio: txt(x.signature), enlaces: [typeof x.bioLink === 'string' ? x.bioLink : JSON.stringify(x.bioLink ?? '')].join(' '), lugar: txt(x.region), seguidores: typeof x.fans === 'number' ? x.fans : null }
  }
  const handle = txt(x.userName)
  if (!handle) return null
  return { red, handle, nombre: txt(x.name), bio: txt(x.description), enlaces: `${txt(x.url) === `https://x.com/${handle}` ? '' : txt(x.url)} ${JSON.stringify(obj(x.entities))}`, lugar: txt(x.location), seguidores: typeof x.followers === 'number' ? x.followers : null }
}

export interface QuienBuscamos { nombre: string; dominio: string | null; cuentasConocidas: string[]; lugares: string[] }
export type DecisionDeCuenta =
  | { estado: 'hallada'; perfil: Perfil; razon: 'cuenta' | 'nombre_y_lugar' }
  | { estado: 'ambigua'; candidatos: string[]; rechazados: Array<{ handle: string; motivo: string }> }
  | { estado: 'no_hallada'; rechazados: Array<{ handle: string; motivo: string }> }

const dominioDe = (u: string | null): string | null => {
  if (!u) return null
  try { return new URL(u.includes('://') ? u : `https://${u}`).host.replace(/^www\./, '').toLowerCase() || null } catch { return null }
}
export const dominioDelSitio = dominioDe

/** aplica la regla única a los perfiles que devolvió la búsqueda */
export function decidirCuenta(perfiles: Perfil[], q: QuienBuscamos): DecisionDeCuenta {
  const aceptados: Array<{ perfil: Perfil; razon: 'cuenta' | 'nombre_y_lugar' }> = []
  const rechazados: Array<{ handle: string; motivo: string }> = []
  const conocidas = q.cuentasConocidas.map((c) => compacto(manejoLimpio(c))).filter((c) => c.length >= 4)
  const lugares = q.lugares.map(norm).filter((l) => l.length >= 3)
  const nombre = compacto(q.nombre)
  for (const p of perfiles) {
    const rastro = `${p.bio} ${p.enlaces}`
    const rastroN = norm(rastro), rastroC = compacto(rastro)
    const porCuenta = (q.dominio && rastro.toLowerCase().includes(q.dominio)) || conocidas.some((c) => rastroC.includes(c))
    const nombreExacto = nombre.length >= 3 && (compacto(p.nombre) === nombre || compacto(p.handle) === nombre)
    const conLugar = lugares.some((l) => ` ${rastroN} ${norm(p.lugar)} `.includes(` ${l} `))
    if (porCuenta) aceptados.push({ perfil: p, razon: 'cuenta' })
    else if (nombreExacto && conLugar) aceptados.push({ perfil: p, razon: 'nombre_y_lugar' })
    else rechazados.push({ handle: p.handle, motivo: nombreExacto ? 'mismo nombre pero sin su sitio, sin una cuenta suya y sin su ciudad: puede ser un homónimo' : 'ni su nombre exacto ni un enlace al negocio' })
  }
  if (aceptados.length === 1) return { estado: 'hallada', perfil: aceptados[0].perfil, razon: aceptados[0].razon }
  if (aceptados.length > 1) return { estado: 'ambigua', candidatos: aceptados.map((a) => a.perfil.handle), rechazados }
  return { estado: 'no_hallada', rechazados }
}

export type EjecutarCuentas = (actor: string, input: Obj, maxUsd: number) => Promise<{ items: unknown[]; costo_usd: number }>

export interface ResultadoDeBusquedaDeCuentas {
  quien: string
  red: RedDeCuenta
  decision: DecisionDeCuenta['estado'] | 'error'
  handle?: string
  razon?: string
  rechazados?: Array<{ handle: string; motivo: string }>
  causa?: string
}

/** busca UNA cuenta; nunca lanza */
export async function buscarCuenta(a: { red: RedDeCuenta; quien: QuienBuscamos; ejecutar: EjecutarCuentas }): Promise<{ r: ResultadoDeBusquedaDeCuentas; costo_usd: number }> {
  const entrada: Obj = a.red === 'tiktok' ? { keywords: [a.quien.nombre], maxProfilesPerQuery: PERFILES_POR_BUSQUEDA } : { searchTerms: [a.quien.nombre], maxItems: PERFILES_POR_BUSQUEDA }
  try {
    const x = await a.ejecutar(ACTORES_DE_CUENTAS[a.red], entrada, TOPE_DE_UNA_BUSQUEDA_USD)
    const perfiles = x.items.map((it) => perfilDe(a.red, it)).filter((p): p is Perfil => !!p)
    const d = decidirCuenta(perfiles, a.quien)
    const base = { quien: a.quien.nombre, red: a.red, decision: d.estado }
    if (d.estado === 'hallada') return { r: { ...base, handle: d.perfil.handle, razon: d.razon }, costo_usd: x.costo_usd }
    if (d.estado === 'ambigua') return { r: { ...base, rechazados: d.rechazados, causa: `dos perfiles cumplen la regla (${d.candidatos.join(', ')}): no se guarda ninguno` }, costo_usd: x.costo_usd }
    return { r: { ...base, rechazados: d.rechazados, causa: perfiles.length ? 'ningún perfil cumple la regla' : 'la búsqueda no devolvió perfiles' }, costo_usd: x.costo_usd }
  } catch (e) {
    return { r: { quien: a.quien.nombre, red: a.red, decision: 'error', causa: (e instanceof Error ? e.message : String(e)).slice(0, 120) }, costo_usd: 0 }
  }
}

export interface InformeDeCuentas { estado: 'corrida' | 'nada_que_buscar' | 'sin_token' | 'sin_base' | 'error'; busquedas: number; halladas: number; no_halladas: number; ambiguas: number; errores: number; guardadas: number; costo_usd: number; detalle?: ResultadoDeBusquedaDeCuentas[]; omitidas_por_tope?: number; mensaje?: string }

const clave = (rol: 'propia' | 'competidor', quien: string, red: RedDeCuenta) => `${rol}:${compacto(quien)}:${red}`

/**
 * Busca lo que falta en la ficha (propias y competidores, TikTok y X), guarda lo hallado y anota cada intento en `config.apify.busqueda_de_cuentas` para no repetir antes de 30 días.
 * Lee la ficha de nuevo justo antes de escribir y cambia SOLO estas claves.
 */
export async function descubrirCuentas(a: { cliente: Obj; clientId: string; ciudades: string[]; urlDeLaBase: string; llave: string; token: string; ahora: Date; ejecutar: EjecutarCuentas; fetchImpl?: Traer; soloLeer?: boolean }): Promise<InformeDeCuentas> {
  const vacio: InformeDeCuentas = { estado: 'nada_que_buscar', busquedas: 0, halladas: 0, no_halladas: 0, ambiguas: 0, errores: 0, guardadas: 0, costo_usd: 0 }
  try {
    if (!a.token) return { ...vacio, estado: 'sin_token' }
    if (!a.urlDeLaBase || !a.llave) return { ...vacio, estado: 'sin_base' }
    const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
    const cfg = obj(a.cliente.config)
    const apify = obj(cfg.apify)
    const propias = { ...obj(cfg.own_social_handles), ...obj(apify.own_handles) } as Record<string, unknown>
    const previas = obj(apify.busqueda_de_cuentas)
    const nombre = txt(a.cliente.name)
    const pais = txt(a.cliente.country)
    const conocidas = [...Object.values(propias).map((v) => txt(v)).filter(Boolean)]
    const lugaresPropios = [...a.ciudades, pais].filter(Boolean)
    const competidores = Array.isArray(apify.competitor_list) ? (apify.competitor_list as unknown[]).map(obj).filter((c) => txt(c.name)) : []
    type Tarea = { rol: 'propia' | 'competidor'; red: RedDeCuenta; quien: QuienBuscamos; clave: string; indice?: number }
    const tareas: Tarea[] = []
    const vencida = (k: string) => { const t = Date.parse(txt(obj(previas[k]).buscado_en)); return !Number.isFinite(t) || a.ahora.getTime() - t > DIAS_ENTRE_BUSQUEDAS_DE_CUENTA * 86_400_000 }
    for (const red of REDES_DE_CUENTAS) {
      if (nombre && !txt(propias[red]) && vencida(clave('propia', nombre, red))) tareas.push({ rol: 'propia', red, clave: clave('propia', nombre, red), quien: { nombre, dominio: dominioDe(txt(a.cliente.website_url) || null), cuentasConocidas: conocidas, lugares: lugaresPropios } })
    }
    competidores.forEach((c, i) => {
      const manos = obj(c.handles)
      const suyas = Object.values(manos).map((v) => txt(v)).filter(Boolean)
      for (const red of REDES_DE_CUENTAS) {
        if (txt(manos[red]) || (red === 'x' && txt(manos.twitter))) continue
        const k = clave('competidor', txt(c.name), red)
        if (vencida(k)) tareas.push({ rol: 'competidor', red, clave: k, indice: i, quien: { nombre: txt(c.name), dominio: dominioDe(txt(c.website) || null), cuentasConocidas: suyas, lugares: lugaresPropios } })
      }
    })
    if (!tareas.length) return vacio
    const hoy = tareas.slice(0, MAX_BUSQUEDAS_POR_CORRIDA)
    const informe: InformeDeCuentas = { ...vacio, estado: 'corrida', detalle: [], omitidas_por_tope: tareas.length - hoy.length }
    const hallazgos: Array<Tarea & { handle?: string; resultado: ResultadoDeBusquedaDeCuentas }> = []
    for (let i = 0; i < hoy.length; i += 4) {
      const tanda = await Promise.all(hoy.slice(i, i + 4).map(async (t) => ({ t, x: await buscarCuenta({ red: t.red, quien: t.quien, ejecutar: a.ejecutar }) })))
      for (const { t, x } of tanda) {
        informe.busquedas++; informe.costo_usd = Math.round((informe.costo_usd + x.costo_usd) * 1e6) / 1e6
        informe.detalle!.push(x.r)
        if (x.r.decision === 'hallada') informe.halladas++
        else if (x.r.decision === 'ambigua') informe.ambiguas++
        else if (x.r.decision === 'error') informe.errores++
        else informe.no_halladas++
        hallazgos.push({ ...t, handle: x.r.handle, resultado: x.r })
      }
    }
    if (a.soloLeer) return informe
    // se escribe sobre la ficha RECIÉN leída: solo las claves de cuentas y de búsquedas; un error de la búsqueda no se anota (se reintenta mañana)
    const base = a.urlDeLaBase.replace(/\/$/, '')
    const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
    const lec = await traer(`${base}/rest/v1/clients?id=eq.${encodeURIComponent(a.clientId)}&select=config`, { headers: auth })
    if (!lec.ok) return { ...informe, mensaje: `no se pudo releer la ficha (HTTP ${lec.status}): lo hallado no se guardó` }
    const fresca = obj(((await lec.json()) as Array<{ config?: unknown }>)[0]?.config)
    const apifyF = { ...obj(fresca.apify) }
    const own = { ...obj(apifyF.own_handles) } as Record<string, unknown>
    const busq = { ...obj(apifyF.busqueda_de_cuentas) } as Record<string, unknown>
    const lista = Array.isArray(apifyF.competitor_list) ? (apifyF.competitor_list as unknown[]).map((c) => ({ ...obj(c) })) : []
    for (const h of hallazgos) {
      if (h.resultado.decision === 'error') continue
      busq[h.clave] = { buscado_en: a.ahora.toISOString(), resultado: h.resultado.decision, ...(h.handle ? { handle: h.handle, razon: h.resultado.razon } : {}), ...(h.resultado.rechazados?.length ? { descartados: h.resultado.rechazados.slice(0, 5) } : {}) }
      if (!h.handle) continue
      if (h.rol === 'propia') { if (!txt(own[h.red])) { own[h.red] = h.handle; informe.guardadas++ } }
      else {
        const c = lista.find((x) => compacto(txt(x.name)) === compacto(h.quien.nombre))
        if (c) { const m = { ...obj(c.handles) } as Record<string, unknown>; if (!txt(m[h.red])) { m[h.red] = `@${h.handle}`; c.handles = m; informe.guardadas++ } }
      }
    }
    const nueva = { ...fresca, apify: { ...apifyF, own_handles: own, busqueda_de_cuentas: busq, ...(lista.length ? { competitor_list: lista } : {}) } }
    const w = await traer(`${base}/rest/v1/clients?id=eq.${encodeURIComponent(a.clientId)}`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ config: nueva }) })
    if (!w.ok) return { ...informe, guardadas: 0, mensaje: `la ficha respondió HTTP ${w.status}: lo hallado no se guardó` }
    return informe
  } catch (e) {
    return { ...vacio, estado: 'error', mensaje: (e instanceof Error ? e.message : String(e)).slice(0, 160) }
  }
}
