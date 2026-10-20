// ═══ LA ENTRADA DEL CLIENTE · CC#1 · 2026-10-20 · V2 (pendientes de la certificación de CC#3: más formas de enlace, más paredes, avisos) ═══
// Texto plano que se PEGA TAL CUAL dentro de los nodos del alta («Validate Deal Data» y «El texto del sitio, o el hueco») y que `src/lib/alta/entrada-del-cliente.ts` repite línea por línea (una prueba exige que den lo mismo).
// Lo que arregla (prueba real del 20-oct):
//  (1) el trato traía SOLO su Instagram y el alta lo trató como «sitio web»: lo leyó, volvió el MURO DE LOGIN de Instagram y se le dijo al descubridor «es la fuente, úsala para decir QUÉ ES el negocio»;
//  (2) la cuenta que dio quien cerró el trato debe MANDAR: el descubridor puede proponer otras, nunca reemplazarla.
// Agnóstico: ninguna empresa, ciudad ni rubro nombrados. Redes = las canónicas de la agencia (Instagram, Facebook, TikTok, LinkedIn, YouTube) + X como «red, no sitio».

// DATO · host → red (se amplía sin tocar la lógica)
var ENT_REDES = [
  { red: 'instagram', host: /(^|\.)(instagram\.com|instagr\.am|ig\.me)$/, perfil: true },
  { red: 'facebook', host: /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch|m\.me|messenger\.com)$/, perfil: true },
  { red: 'tiktok', host: /(^|\.)tiktok\.com$/, perfil: true },
  { red: 'linkedin', host: /(^|\.)(linkedin\.com|lnkd\.in)$/, perfil: true },
  { red: 'youtube', host: /(^|\.)(youtube\.com|youtu\.be)$/, perfil: true },
  { red: 'x', host: /(^|\.)(x\.com|twitter\.com|t\.co)$/, perfil: false },
]
// DATO · enlaces que NO son un sitio con texto del negocio (agregadores de enlaces, mensajería, fichas de mapas)
var ENT_NO_SITIO = /(^|\.)(linktr\.ee|linktree\.com|beacons\.ai|bio\.link|campsite\.bio|wa\.me|api\.whatsapp\.com|whatsapp\.com|t\.me|telegram\.me|maps\.app\.goo\.gl|goo\.gl|taplink\.cc|lnk\.bio|msha\.ke|solo\.to|linkin\.bio|wa\.link|g\.page|maps\.google\.[a-z.]+)$/
var ENT_RUTAS_QUE_NO_SON_PERFIL = /^(p|reel|reels|explore|accounts|stories|tv|direct|about|legal|help|share|sharer|sharer\.php|watch|results|hashtag|tag|search|login|groups|pages|public|channel)$/i

function entHostDe(u) {
  var t = String(u == null ? '' : u).trim()
  if (!t) return ''
  var m = t.match(/^[a-z][a-z0-9+.-]*:\/\/([^\/?#]+)/i) || t.match(/^([^\/?#\s]+\.[^\/?#\s]+)/)
  if (!m) return ''
  return m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').toLowerCase()
}
function entRutaDe(u) {
  var t = String(u == null ? '' : u).trim()
  var m = t.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?[^\/?#]+\/([^?#]*)/i)
  return m ? m[1].split('/').filter(function (x) { return x }) : []
}
/** el «usuario» de una red desde una dirección de perfil, o una cuenta suelta («@usuario», «usuario»); null si no se puede decir con certeza */
function entUsuarioDe(red, valor) {
  var t = String(valor == null ? '' : valor).trim()
  if (!t) return null
  // una dirección (con «http», «www.» o una barra): se lee como dirección
  if (/^(https?:\/\/|www\.)/i.test(t) || t.indexOf('/') !== -1) {
    var info = entClasificar(t)
    if (info.tipo === 'red') return info.red === red ? info.usuario : null
    if (info.tipo !== 'vacio') return null // una dirección de otro tipo no es una cuenta
    // sin dirección reconocible («usuario/»): se lee como cuenta suelta
  }
  var u = t.replace(/^@+/, '').replace(/\/+$/, '')
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(u)) return null
  return u
}
/** qué es una dirección: { tipo: 'vacio'|'sitio'|'red'|'no_sitio', red, usuario, host } */
function entClasificar(u) {
  var host = entHostDe(u)
  if (!host) return { tipo: 'vacio', red: null, usuario: null, host: '' }
  for (var i = 0; i < ENT_REDES.length; i++) {
    if (ENT_REDES[i].host.test(host)) {
      var r = ENT_REDES[i], partes = entRutaDe(u), usuario = null
      var primera = partes[0] || ''
      if (r.red === 'instagram' || r.red === 'tiktok' || r.red === 'x') {
        var p = primera.replace(/^@/, '')
        if (p && !ENT_RUTAS_QUE_NO_SON_PERFIL.test(p) && /^[A-Za-z0-9._]{1,40}$/.test(p)) usuario = p
      } else if (r.red === 'facebook') {
        var f = primera.replace(/^@/, '')
        if (f && !ENT_RUTAS_QUE_NO_SON_PERFIL.test(f) && !/^profile\.php$/i.test(f) && /^[A-Za-z0-9.\-]{1,80}$/.test(f)) usuario = f
      } else if (r.red === 'linkedin') {
        if (/^(company|in|school)$/i.test(primera) && partes[1]) usuario = partes[1]
      } else if (r.red === 'youtube') {
        if (/^@/.test(primera)) usuario = primera.replace(/^@/, '')
        else if (/^(c|user|channel)$/i.test(primera) && partes[1]) usuario = partes[1]
      }
      // acortadores y enlaces de mensaje/video: la primera parte de la ruta NO es una cuenta
      if (/(^|\.)(fb\.watch|t\.co|lnkd\.in|ig\.me|messenger\.com)$/.test(host)) usuario = null
      return { tipo: 'red', red: r.red, usuario: usuario, host: host }
    }
  }
  if (ENT_NO_SITIO.test(host)) return { tipo: 'no_sitio', red: null, usuario: null, host: host }
  // la ficha de Google Maps (google.com/maps/…): un negocio local la da como «su web» con frecuencia
  if (/(^|\.)google\.[a-z.]+$/.test(host) && /^maps$/i.test(entRutaDe(u)[0] || '')) return { tipo: 'no_sitio', red: null, usuario: null, host: host }
  return { tipo: 'sitio', red: null, usuario: null, host: host }
}
/**
 * La entrada del trato → lo que el alta debe usar.
 *  · `sitio` solo si es de verdad un sitio (nunca una red social, un agregador de enlaces ni un chat);
 *  · las cuentas DADAS por quien cerró el trato (campos explícitos) mandan; una cuenta que venía dentro de la dirección «web» solo entra si no se dio otra de esa red;
 *  · devuelve `avisos` para que el alta diga qué hizo, sin inventar nada.
 */
function entNormalizar(b) {
  b = b || {}
  var avisos = [], dadas = {}, origen = {}
  var explicitas = { instagram: b.instagram_handle || b.instagram, facebook: b.facebook_handle || b.facebook, tiktok: b.tiktok_handle || b.tiktok, linkedin: b.linkedin_handle || b.linkedin, youtube: b.youtube_handle || b.youtube }
  Object.keys(explicitas).forEach(function (red) {
    var u = entUsuarioDe(red, explicitas[red])
    if (u) { dadas[red] = u; origen[red] = 'dada' }
  })
  var bruto = b.website || b.domain || null
  var info = entClasificar(bruto)
  // un «@usuario» en el campo web es una cuenta, no un sitio (aunque lleve punto: «@mi.negocio»); NO se adivina de qué red es
  var arroba = bruto && /^\s*@[A-Za-z0-9._]{1,40}\s*$/.test(String(bruto))
  if (arroba) info = { tipo: 'vacio', red: null, usuario: null, host: '' }
  var sitio = null
  if (info.tipo === 'sitio') sitio = String(bruto).trim()
  else if (info.tipo === 'red') {
    if (info.usuario && !dadas[info.red] && ENT_REDES.some(function (r) { return r.red === info.red && r.perfil })) { dadas[info.red] = info.usuario; origen[info.red] = 'sacada_de_la_direccion' }
    avisos.push('la dirección «' + String(bruto).trim() + '» es una cuenta de ' + info.red + ', no un sitio web: no se lee como sitio' + (info.usuario ? ' y se guarda como cuenta propia (' + info.usuario + ')' : ''))
  } else if (arroba) avisos.push('el campo web trae «' + String(bruto).trim() + '» (una cuenta, no un sitio): no se guarda como sitio ni se adivina de qué red es · pásala en el campo de su red')
  else if (info.tipo === 'vacio' && bruto && String(bruto).trim()) avisos.push('«' + String(bruto).trim() + '» no parece una dirección web: no se usa como sitio')
  else if (info.tipo === 'no_sitio') avisos.push('la dirección «' + String(bruto).trim() + '» es un enlace de contacto o de enlaces, no un sitio con el texto del negocio: no se lee como sitio')
  return { sitio: sitio, cuentas: dadas, origen: origen, direccion_original: bruto ? String(bruto).trim() : null, direccion_era: info.tipo === 'red' ? info.red : (info.tipo === 'no_sitio' ? 'enlace' : null), avisos: avisos }
}

// DATO · señales de que lo que volvió NO es el texto del negocio sino una pared (login, bloqueo, error, captcha). Minúsculas y sin tildes.
var ENT_MARCAS_MURO = {
  login: ['log into instagram', 'log in to instagram', 'log in with facebook', 'create new account', 'create an account or log in', 'forgot password', 'mobile number, username or email', 'see everyday moments from your close friends', 'share what you re into', 'sign up to see photos', 'sign up to see photos and videos', 'inicia sesion', 'iniciar sesion', 'crear cuenta nueva', 'registrate para ver', 'you must log in', 'accounts/login', 'se requiere iniciar sesion', 'log in or sign up', 'entrar o registrarte', 'log in to tiktok', 'login to tiktok', 'sign up for tiktok', 'join now to see who you already know', 'join linkedin', 'sign in to linkedin', 'new to linkedin', 'sign in to continue', 'sign in with google', 'before you continue to youtube', 'before you continue to google', 'consent.google', 'inicia sesion en tiktok', 'unete ahora para ver'],
  bloqueo: ['just a moment', 'verifying you are human', 'checking your browser', 'attention required', 'enable javascript and cookies', 'please enable javascript', 'access denied', 'captcha', 'are you a robot', 'request blocked', 'pardon our interruption', 'unusual traffic', 'checking if the site connection is secure', 'you have been blocked', 'cloudflare ray id', 'something went wrong. try again', 'something went wrong, try again', 'verify you are human', 'access to this page has been denied'],
  error: ['502 bad gateway', '503 service unavailable', '504 gateway', '403 forbidden', '404 not found', 'page not found', 'host not found', 'connection failed', 'this site can t be reached', 'err_name_not_resolved', 'sorry this page isn t available', 'forbidden', 'not found'],
}
function entSinTildes(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/.:,]+/g, ' ').replace(/\s+/g, ' ').trim() }
/**
 * ¿esto es una pared y no el texto del negocio? Falla hacia «NO es pared» solo cuando hay mucho texto y pocas señales (una página real que tiene un botón «Iniciar sesión»).
 * → { es: boolean, tipo: 'login'|'bloqueo'|'error'|null, motivo: string, senales: string[] }
 */
function entEsMuro(texto, urlCargada) {
  var t = entSinTildes(texto), largo = String(texto == null ? '' : texto).trim().length
  var senales = [], tipos = {}
  Object.keys(ENT_MARCAS_MURO).forEach(function (tipo) {
    ENT_MARCAS_MURO[tipo].forEach(function (m) { if (t.indexOf(m) !== -1) { senales.push(m); tipos[tipo] = (tipos[tipo] || 0) + 1 } })
  })
  var redirigidoALogin = /\/accounts\/login|\/login\b|\/signin\b|\/checkpoint\b|\/authwall\b/i.test(String(urlCargada == null ? '' : urlCargada))
  if (redirigidoALogin) { senales.push('la dirección cargada es una pantalla de ingreso'); tipos.login = (tipos.login || 0) + 1 }
  var total = senales.length
  var corto = largo < 1500
  var es = total >= 1 && (corto || total >= 3 || redirigidoALogin)
  if (!es) return { es: false, tipo: null, motivo: '', senales: senales }
  var tipo = Object.keys(tipos).sort(function (a, c) { return tipos[c] - tipos[a] })[0]
  var nombre = { login: 'un muro de inicio de sesión', bloqueo: 'un bloqueo antirrobots', error: 'una página de error' }[tipo]
  return { es: true, tipo: tipo, motivo: 'lo que volvió es ' + nombre + ' (' + senales.slice(0, 3).join(' · ') + '), no el texto del negocio', senales: senales }
}
// ═══ fin de la entrada del cliente ═══
