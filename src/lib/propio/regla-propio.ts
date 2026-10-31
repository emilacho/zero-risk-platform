/**
 * LA REGLA ÚNICA «¿ES DEL CLIENTE ESTA PÁGINA?» (31-oct · CC#3). PURO.
 *
 * Es la copia en TypeScript de las funciones de la base `client_web_pages_es_propia` / `…_cuentas_de` (migración 202610311300). Las dos corren LOS MISMOS casos
 * (`__tests__/fixtures/regla-propio-casos.json`): el archivo se prueba aquí y, por SELECT, contra la base (`scripts/ops/verificar-regla-propio-en-base.mjs`).
 * Si cambias una, cambia la otra y el archivo de casos.
 *
 * Una página es del cliente si (a) su dirección es del dominio del sitio (o un subdominio; si el «sitio» es una red social no sirve) o (b) es la página de SU cuenta
 * EN SU PROPIA RED (el usuario es el primer tramo útil de la ruta, EXACTO). Un espejo ajeno que solo contiene el nombre de la cuenta no cuenta.
 * `sin_base` = no hay con qué comparar (sin sitio utilizable y sin cuentas): el rótulo que traía la fila se conserva en la base; quien necesita PRUEBA (las sedes) lo lee como «no».
 */
export type Veredicto = 'si' | 'no' | 'sin_base'
export type Cuenta = { red: string; usuario: string }
export interface BaseDelCliente { sitio: string | null; cuentas: Cuenta[] }

const RED_DE_ANFITRION: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)threads\.net$/, 'threads'],
  [/(^|\.)(linktr\.ee|wa\.me|api\.whatsapp\.com)$/, 'otra'],
]
const REDES_CON_NOMBRE = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'threads']

export const redDe = (host: string): string | null => RED_DE_ANFITRION.find(([re]) => re.test(host))?.[1] ?? null

/** el anfitrión: minúsculas, sin usuario, sin puerto, sin www; '' si la dirección no trae «//» */
export function hostDe(url: unknown): string {
  const t = String(url ?? '')
  if (!t.includes('//')) return ''
  const h = t.split('//').slice(1).join('//').split('/')[0].split('?')[0]
  return h.toLowerCase().replace(/^[^@]*@/, '').replace(/:[0-9]+$/, '').replace(/^www\./, '')
}

/** el usuario de una página de red social (primer tramo útil de la ruta, sin @, en minúsculas); null si no hay o no es una red */
export function usuarioDe(url: unknown): string | null {
  const h = hostDe(url)
  const red = redDe(h)
  if (!red || !h) return null
  const resto = String(url).split('//').slice(1).join('//')
  const i = resto.indexOf('/')
  const ruta = (i >= 0 ? resto.slice(i + 1) : '').split('#')[0].split('?')[0].toLowerCase()
  const [s1 = '', s2 = ''] = ruta.split('/')
  const u = red === 'linkedin' ? (['company', 'in', 'school'].includes(s1) ? s2 : '') : red === 'youtube' ? (['c', 'user', 'channel'].includes(s1) ? s2 : s1) : s1
  return u.replace(/^@/, '') || null
}

const objeto = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** la base de comparación de una ficha: su sitio y sus cuentas (own_social_handles + apify.own_handles + la página de red que sea su «sitio») */
export function baseDeFicha(c: { website_url?: string | null; config?: unknown }): BaseDelCliente {
  const cfg = objeto(c.config)
  const cuentas: Cuenta[] = []
  for (const par of [...Object.entries(objeto(cfg.own_social_handles)), ...Object.entries(objeto(objeto(cfg.apify).own_handles))]) {
    const [k, val] = par
    if (typeof val !== 'string') continue
    const v = val.trim().toLowerCase()
    const usuario = /^https?:\/\//.test(v) ? usuarioDe(v) : v.split('?')[0].split('/')[0].replace(/^@/, '')
    if (usuario) cuentas.push({ red: k.toLowerCase() === 'twitter' ? 'x' : k.toLowerCase(), usuario })
  }
  const webU = usuarioDe(c.website_url)
  if (webU) cuentas.push({ red: redDe(hostDe(c.website_url)) ?? '', usuario: webU })
  return { sitio: c.website_url ?? null, cuentas }
}

/** LA REGLA */
export function veredictoDePagina(base: BaseDelCliente, url: unknown): Veredicto {
  const host = hostDe(url)
  const redUrl = redDe(host)
  const usuarioUrl = usuarioDe(url)
  const sitio = hostDe(base.sitio)
  let hayBase = false
  if (sitio && redDe(sitio) === null) {
    hayBase = true
    if (host && (host === sitio || host.endsWith('.' + sitio))) return 'si'
  }
  for (const c of base.cuentas) {
    const usuario = c.usuario.toLowerCase().replace(/^@/, '')
    if (usuario.length < 3) continue
    hayBase = true
    if (redUrl && usuarioUrl && usuarioUrl === usuario && (c.red === '' || !REDES_CON_NOMBRE.includes(c.red) || c.red === redUrl)) return 'si'
  }
  return hayBase ? 'no' : 'sin_base'
}

/** lo que hace la base al rotular: se conserva salvo que se pruebe que NO es del cliente */
export const conservaElRotulo = (base: BaseDelCliente, url: unknown): boolean => veredictoDePagina(base, url) !== 'no'
/** lo que necesitan las sedes: PRUEBA de que es del cliente (sin base no se adivina) */
export const esPaginaDelClienteConPrueba = (base: BaseDelCliente, url: unknown): boolean => veredictoDePagina(base, url) === 'si'
