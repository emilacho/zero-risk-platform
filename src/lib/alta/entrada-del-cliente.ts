/**
 * LA ENTRADA DEL CLIENTE (CC#1 · 20-oct · encargo de Lenovo «limpiar y arreglar» · parte 2).
 * Prueba real del 20-oct: el trato traía SOLO su Instagram como «web»; el alta lo leyó como sitio, volvió el muro de login y se lo dio al descubridor como «el texto del negocio».
 * Esto es el MISMO texto que el alta pega en sus nodos (`scripts/worker-staging/LyVoKcrypS5uLyuu/bloque-entrada-del-cliente-2026-10-20.js`), en TypeScript, para que cualquier otra puerta
 * (`/api/clients/upsert`, el panel…) no vuelva a guardar una red social como «sitio web». Una prueba exige que den lo mismo caso por caso.
 * PURO: sin red, sin base. Agnóstico: ninguna empresa, ciudad ni rubro nombrados.
 */
export type Red = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'youtube' | 'x'
export type TipoDeDireccion = 'vacio' | 'sitio' | 'red' | 'no_sitio'
export interface Direccion { tipo: TipoDeDireccion; red: Red | null; usuario: string | null; host: string }
export interface EntradaNormalizada {
  sitio: string | null
  cuentas: Partial<Record<Red, string>>
  origen: Partial<Record<Red, 'dada' | 'sacada_de_la_direccion'>>
  direccion_original: string | null
  direccion_era: Red | 'enlace' | null
  avisos: string[]
}
export type TipoDePared = 'login' | 'bloqueo' | 'error'
export interface Pared { es: boolean; tipo: TipoDePared | null; motivo: string; senales: string[] }

const REDES: Array<{ red: Red; host: RegExp; perfil: boolean }> = [
  { red: 'instagram', host: /(^|\.)(instagram\.com|instagr\.am|ig\.me)$/, perfil: true },
  { red: 'facebook', host: /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|m\.me|messenger\.com)$/, perfil: true },
  { red: 'tiktok', host: /(^|\.)tiktok\.com$/, perfil: true },
  { red: 'linkedin', host: /(^|\.)(linkedin\.com|lnkd\.in)$/, perfil: true },
  { red: 'youtube', host: /(^|\.)(youtube\.com|youtu\.be)$/, perfil: true },
  { red: 'x', host: /(^|\.)(x\.com|twitter\.com|t\.co)$/, perfil: false },
]
const NO_SITIO = /(^|\.)(linktr\.ee|linktree\.com|beacons\.ai|bio\.link|campsite\.bio|wa\.me|api\.whatsapp\.com|whatsapp\.com|t\.me|telegram\.me|maps\.app\.goo\.gl|goo\.gl|taplink\.cc|lnk\.bio|msha\.ke|solo\.to|linkin\.bio|wa\.link|g\.page|maps\.google\.[a-z.]+)$/
const RUTAS_QUE_NO_SON_PERFIL = /^(p|reel|reels|explore|accounts|stories|tv|direct|about|legal|help|share|sharer|sharer\.php|watch|results|hashtag|tag|search|login|groups|pages|public|channel)$/i

function hostDe(u: unknown): string {
  const t = String(u ?? '').trim()
  if (!t) return ''
  const m = t.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i) || t.match(/^([^/?#\s]+\.[^/?#\s]+)/)
  if (!m) return ''
  return m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase()
}
function rutaDe(u: unknown): string[] {
  const t = String(u ?? '').trim()
  const m = t.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/?#]+\/([^?#]*)/i)
  return m ? m[1].split('/').filter((x) => x) : []
}

/** qué es una dirección: sitio, red social, enlace que no es sitio, o vacío */
export function clasificarDireccion(u: unknown): Direccion {
  const host = hostDe(u)
  if (!host) return { tipo: 'vacio', red: null, usuario: null, host: '' }
  for (const r of REDES) {
    if (!r.host.test(host)) continue
    const partes = rutaDe(u)
    const primera = partes[0] || ''
    let usuario: string | null = null
    if (r.red === 'instagram' || r.red === 'tiktok' || r.red === 'x') {
      const p = primera.replace(/^@/, '')
      if (p && !RUTAS_QUE_NO_SON_PERFIL.test(p) && /^[A-Za-z0-9._]{1,40}$/.test(p)) usuario = p
    } else if (r.red === 'facebook') {
      const f = primera.replace(/^@/, '')
      if (f && !RUTAS_QUE_NO_SON_PERFIL.test(f) && !/^profile\.php$/i.test(f) && /^[A-Za-z0-9.-]{1,80}$/.test(f)) usuario = f
    } else if (r.red === 'linkedin') {
      if (/^(company|in|school)$/i.test(primera) && partes[1]) usuario = partes[1]
    } else if (r.red === 'youtube') {
      if (/^@/.test(primera)) usuario = primera.replace(/^@/, '')
      else if (/^(c|user|channel)$/i.test(primera) && partes[1]) usuario = partes[1]
    }
    // acortadores y enlaces de mensaje/video: la primera parte de la ruta NO es una cuenta
    if (/(^|\.)(fb\.watch|t\.co|lnkd\.in|ig\.me|messenger\.com)$/.test(host)) usuario = null
    return { tipo: 'red', red: r.red, usuario, host }
  }
  if (NO_SITIO.test(host)) return { tipo: 'no_sitio', red: null, usuario: null, host }
  // la ficha de Google Maps (google.com/maps/…): un negocio local la da como «su web» con frecuencia
  if (/(^|\.)google\.[a-z.]+$/.test(host) && /^maps$/i.test(rutaDe(u)[0] || '')) return { tipo: 'no_sitio', red: null, usuario: null, host }
  return { tipo: 'sitio', red: null, usuario: null, host }
}

/** el «usuario» de una red desde una dirección de perfil o una cuenta suelta («@usuario», «usuario/»); null si no se puede decir con certeza */
export function usuarioDeRed(red: Red, valor: unknown): string | null {
  const t = String(valor ?? '').trim()
  if (!t) return null
  if (/^(https?:\/\/|www\.)/i.test(t) || t.includes('/')) {
    const info = clasificarDireccion(t)
    if (info.tipo === 'red') return info.red === red ? info.usuario : null
    if (info.tipo !== 'vacio') return null
  }
  const u = t.replace(/^@+/, '').replace(/\/+$/, '')
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(u)) return null
  return u
}

/** el sitio solo es sitio si lo es; las cuentas DADAS mandan; una cuenta que venía dentro de la «web» solo entra si no se dio otra de esa red */
export function normalizarEntrada(b: Record<string, unknown> = {}): EntradaNormalizada {
  const avisos: string[] = []
  const cuentas: EntradaNormalizada['cuentas'] = {}
  const origen: EntradaNormalizada['origen'] = {}
  const explicitas: Partial<Record<Red, unknown>> = {
    instagram: b.instagram_handle || b.instagram, facebook: b.facebook_handle || b.facebook, tiktok: b.tiktok_handle || b.tiktok,
    linkedin: b.linkedin_handle || b.linkedin, youtube: b.youtube_handle || b.youtube,
  }
  for (const red of Object.keys(explicitas) as Red[]) {
    const u = usuarioDeRed(red, explicitas[red])
    if (u) { cuentas[red] = u; origen[red] = 'dada' }
  }
  const bruto = (b.website || b.domain || null) as string | null
  let info = clasificarDireccion(bruto)
  // un «@usuario» en el campo web es una cuenta, no un sitio (aunque lleve punto: «@mi.negocio»); NO se adivina de qué red es
  const arroba = !!bruto && /^\s*@[A-Za-z0-9._]{1,40}\s*$/.test(String(bruto))
  if (arroba) info = { tipo: 'vacio', red: null, usuario: null, host: '' }
  let sitio: string | null = null
  if (info.tipo === 'sitio') sitio = String(bruto).trim()
  else if (info.tipo === 'red') {
    if (info.usuario && !cuentas[info.red as Red] && REDES.some((r) => r.red === info.red && r.perfil)) { cuentas[info.red as Red] = info.usuario; origen[info.red as Red] = 'sacada_de_la_direccion' }
    avisos.push(`la dirección «${String(bruto).trim()}» es una cuenta de ${info.red}, no un sitio web: no se lee como sitio${info.usuario ? ` y se guarda como cuenta propia (${info.usuario})` : ''}`)
  } else if (arroba) avisos.push(`el campo web trae «${String(bruto).trim()}» (una cuenta, no un sitio): no se guarda como sitio ni se adivina de qué red es · pásala en el campo de su red`)
  else if (info.tipo === 'vacio' && bruto && String(bruto).trim()) avisos.push(`«${String(bruto).trim()}» no parece una dirección web: no se usa como sitio`)
  else if (info.tipo === 'no_sitio') avisos.push(`la dirección «${String(bruto).trim()}» es un enlace de contacto o de enlaces, no un sitio con el texto del negocio: no se lee como sitio`)
  return {
    sitio, cuentas, origen, direccion_original: bruto ? String(bruto).trim() : null,
    direccion_era: info.tipo === 'red' ? info.red : info.tipo === 'no_sitio' ? 'enlace' : null, avisos,
  }
}

const MARCAS_MURO: Record<TipoDePared, string[]> = {
  login: ['log into instagram', 'log in to instagram', 'log in with facebook', 'create new account', 'create an account or log in', 'forgot password', 'mobile number, username or email', 'see everyday moments from your close friends', 'share what you re into', 'sign up to see photos', 'sign up to see photos and videos', 'inicia sesion', 'iniciar sesion', 'crear cuenta nueva', 'registrate para ver', 'you must log in', 'accounts/login', 'se requiere iniciar sesion', 'log in or sign up', 'entrar o registrarte', 'log in to tiktok', 'login to tiktok', 'sign up for tiktok', 'join now to see who you already know', 'join linkedin', 'sign in to linkedin', 'new to linkedin', 'sign in to continue', 'sign in with google', 'before you continue to youtube', 'before you continue to google', 'consent.google', 'inicia sesion en tiktok', 'unete ahora para ver'],
  bloqueo: ['just a moment', 'verifying you are human', 'checking your browser', 'attention required', 'enable javascript and cookies', 'please enable javascript', 'access denied', 'captcha', 'are you a robot', 'request blocked', 'pardon our interruption', 'unusual traffic', 'checking if the site connection is secure', 'you have been blocked', 'cloudflare ray id', 'something went wrong. try again', 'something went wrong, try again', 'verify you are human', 'access to this page has been denied'],
  error: ['502 bad gateway', '503 service unavailable', '504 gateway', '403 forbidden', '404 not found', 'page not found', 'host not found', 'connection failed', 'this site can t be reached', 'err_name_not_resolved', 'sorry this page isn t available', 'forbidden', 'not found'],
}
const sinTildes = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9/.:,]+/g, ' ').replace(/\s+/g, ' ').trim()

/** ¿esto es una pared (login, bloqueo, error) y no el texto del negocio? No marca una página real larga que solo tiene un botón «Iniciar sesión». */
export function esMuro(texto: unknown, urlCargada?: unknown): Pared {
  const t = sinTildes(texto)
  const largo = String(texto ?? '').trim().length
  const senales: string[] = []
  const tipos: Partial<Record<TipoDePared, number>> = {}
  for (const tipo of Object.keys(MARCAS_MURO) as TipoDePared[]) {
    for (const m of MARCAS_MURO[tipo]) if (t.includes(m)) { senales.push(m); tipos[tipo] = (tipos[tipo] || 0) + 1 }
  }
  const redirigidoALogin = /\/accounts\/login|\/login\b|\/signin\b|\/checkpoint\b|\/authwall\b/i.test(String(urlCargada ?? ''))
  if (redirigidoALogin) { senales.push('la dirección cargada es una pantalla de ingreso'); tipos.login = (tipos.login || 0) + 1 }
  const total = senales.length
  const es = total >= 1 && (largo < 1500 || total >= 3 || redirigidoALogin)
  if (!es) return { es: false, tipo: null, motivo: '', senales }
  const tipo = (Object.keys(tipos) as TipoDePared[]).sort((a, c) => (tipos[c] || 0) - (tipos[a] || 0))[0]
  const nombre = { login: 'un muro de inicio de sesión', bloqueo: 'un bloqueo antirrobots', error: 'una página de error' }[tipo]
  return { es: true, tipo, motivo: `lo que volvió es ${nombre} (${senales.slice(0, 3).join(' · ')}), no el texto del negocio`, senales }
}
