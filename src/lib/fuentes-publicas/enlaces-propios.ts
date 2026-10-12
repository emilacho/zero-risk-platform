/**
 * Fuentes públicas · ¿ESTE enlace del sitio del cliente es SUYO? (ronda 76 · endurecido en la 77 · condición de CC#3 para encender el alta).
 * Un sitio enlaza muchas cosas que NO son del cliente: «qué hacer cerca», otros negocios, «compartir en…», y los CRÉDITOS de quien hizo el sitio («diseñado por…» con el perfil de la agencia, repetido en el pie
 * de todas las páginas). Pedir reseñas de esos enlaces es pagar por raspar a otro y luego citarlo. Tres veredictos, y SOLO «propio» se pide:
 *   · propio        → no es de salida por su forma; la dirección lleva el NOMBRE ENTERO del cliente (la secuencia de sus palabras, no que las contenga) sin palabras de más pegadas al nombre;
 *                     y si el nombre es corto o genérico («Café del Mar», «Casa Azul»), además lleva la ciudad/ubicación de la ficha o el sitio lo marca como «nuestro» (contacto, síguenos…).
 *   · sin_confirmar → hay una pista pero no alcanza: nombre corto sin ciudad ni marca de «nuestro», el nombre del cliente contenido en uno más largo («Demo Costa» ⊂ «Demo Costa Resort»: otro negocio o el mismo
 *                     con apellido de lugar), o un perfil repetido en el sitio sin marca de «nuestro». NO se pide ni se gasta en él: se anota para que lo confirme una persona o la ficha.
 *   · descartado    → de salida por su forma, crédito del diseñador, o nada que ver con el nombre.
 * Lo declarado en la ficha (usuarios de red del cliente) no pasa por aquí: manda. PURO; nada de este archivo nombra un rubro, un lugar ni un cliente.
 */
import { normalizar } from '../manual/texto'

export interface EnlaceDescartado { url: string; motivo: string }
export interface EnlaceSinConfirmar { url: string; motivo: string }
export interface ContextoDeEnlaces {
  /** nombre del negocio (ficha) */
  nombre: string | null | undefined
  /** palabras de ubicación de la ficha (ciudad, zona, país) · sin ellas, un nombre corto nunca se confirma por el nombre solo */
  ubicacion?: string[]
  /** por cada dirección hallada: en cuántas páginas DISTINTAS del sitio propio aparece */
  paginasPorEnlace: Map<string, number>
  /** cuántas páginas del sitio propio se leyeron */
  paginasLeidas: number
  /** por cada dirección: los trozos de texto del sitio que la rodean (para ver si dice «diseñado por…» o «síguenos…») */
  ventanasPorEnlace?: Map<string, string[]>
}
export type Veredicto = { estado: 'propio' } | { estado: 'sin_confirmar'; motivo: string } | { estado: 'descartado'; motivo: string }

/** tipos de local y artículos: no identifican a un negocio por sí solos */
const GENERICAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'the', 'and', 'for', 'por', 'en', 'hotel', 'hostal', 'hostel', 'restaurante', 'restaurant', 'cafe', 'cafeteria', 'bar', 'clinica', 'tienda', 'estudio', 'grupo', 'empresa', 'spa', 'cabanas', 'cabana', 'posada', 'resort', 'agencia', 'consultora', 'centro', 'taller', 'casa'])
/** palabras que acompañan a una dirección sin ser parte del nombre de otro negocio */
const NEUTRAS = new Set(['reviews', 'review', 'html', 'htm', 'php', 'com', 'www', 'oficial', 'official', 'profile', 'perfil', 'page', 'pages', 'id', 'es', 'en', 'province', 'provincia', 'region', 'ciudad', 'city', 'canton', 'state', 'attraction', 'restaurant', 'hotel'])

const SALIDA_POR_FORMA: Array<[RegExp, string]> = [
  [/(sharer|\/share\b|share\.php|\/dialog\/|\/plugins\/|intent\/(tweet|post)|sharearticle|addtoany|api\.whatsapp\.com\/send|wa\.me\/\?|\/tr\?|[?&]u=https?)/i, 'enlace para COMPARTIR (no es una página del negocio)'],
  [/(\/login|\/signup|\/policies|\/help\b|\/legal\b|\/terms\b|\/privacy\b)/i, 'página de la plataforma (no del negocio)'],
  [/tripadvisor\.[a-z.]+\/(Search|Tourism-|Hotels-|Restaurants-|Attractions-|Vacation|Travel_Guide|Flights|Forum|ShowUserReviews|Profile\/|TravelersChoice)/i, 'listado o guía de la plataforma (no es la ficha del negocio)'],
  [/booking\.com\/(searchresults|city|region|country|landmark|district|reviews\.)/i, 'búsqueda o listado de la plataforma (no es la ficha del negocio)'],
  [/(facebook|fb)\.com\/(groups|events|watch|marketplace|hashtag|pages\/category|ads|help|business)\b/i, 'sección de Facebook que no es la página del negocio'],
  [/youtube\.com\/(watch|shorts|embed|playlist|results)/i, 'video suelto, no el canal'],
  [/(google\.[a-z.]+\/(travel|search|url)|goo\.gl\/maps\b.*\/dir|maps\/dir\/)/i, 'búsqueda o ruta (no la ficha del negocio)'],
]

const HOSTS_DE_RESENAS = /(tripadvisor|booking\.com|trustpilot|g2\.com|capterra|apps\.apple|itunes\.apple|play\.google|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page|yelp)/i
const HOSTS_DE_RED = /(^|\/\/)(www\.)?(facebook|fb|instagram|tiktok|youtube|linkedin|x|twitter)\.com/i

/** quien hizo el sitio firma el pie: «diseñado por…», «powered by…» */
const CREDITO = /(dise[nñ]ad[oa]s? por|desarrollad[oa]s? por|hech[oa] por|cread[oa] por|realizad[oa] por|sitio por|dise[nñ]o web|powered by|designed by|developed by|built by|made by|web by|website by|ag[eê]ncia|agencia|studio|estudio creativo)/i
/** el propio negocio se presenta: «síguenos», «nuestro Instagram», «contacto» */
const NUESTRO = /(s[ií]guenos|follow us|nuestr[oa]s? (redes|instagram|facebook|perfil|p[aá]gina|ficha|tiktok|canal)|our (instagram|facebook|page)|cont[aá]ctanos|contacto|encu[eé]ntranos|vis[ií]tanos|find us)/i

const palabras = (s: string): string[] => normalizar(s).split(' ').filter(Boolean)

export interface NombreAnalizado { todas: string[]; nucleo: string[]; compacto: string; debil: boolean }

/** el nombre de la ficha: todas sus palabras, el NÚCLEO (sin artículos ni tipo de local en los extremos) y si es corto o genérico (una sola palabra de menos de 8 letras, o menos de 5 letras en total) */
export function analizarNombre(nombre: string | null | undefined): NombreAnalizado {
  const todas = palabras(nombre ?? '')
  let a = 0
  let b = todas.length
  while (a < b && GENERICAS.has(todas[a])) a++
  while (b > a && GENERICAS.has(todas[b - 1])) b--
  const nucleo = a < b ? todas.slice(a, b) : todas
  const compacto = nucleo.join('')
  return { todas, nucleo, compacto, debil: (nucleo.length === 1 && compacto.length < 8) || compacto.length < 5 }
}

const esNeutral = (t: string, propias: Set<string>, ubicacion: Set<string>): boolean => NEUTRAS.has(t) || propias.has(t) || ubicacion.has(t) || /^[0-9]+$/.test(t) || /^[a-z]{1,2}[0-9]*$/.test(t) || /^[gd][0-9]+$/.test(t)

export type CoincidenciaDeNombre = 'entero' | 'con_extras' | 'no'

/**
 * ¿la dirección lleva el nombre ENTERO del cliente? La secuencia de las palabras del núcleo, pegadas, sin palabras de más en los dos lados (lo que sea que sea neutral:
 * «reviews», un número, la ciudad de la ficha o las otras palabras del propio nombre, no cuenta). «Demo Costa» dentro de «Demo Costa Resort» es `con_extras`: otro nombre.
 */
export function coincideElNombreEntero(url: string, nombre: string | null | undefined, ubicacion: string[] = []): CoincidenciaDeNombre {
  const n = analizarNombre(nombre)
  if (!n.nucleo.length) return 'no'
  let ruta = url
  try { const u = new URL(url.includes('://') ? url : `https://${url}`); ruta = decodeURIComponent(u.pathname) } catch { /* se usa la dirección tal cual */ }
  const propias = new Set(n.todas.filter((t) => !n.nucleo.includes(t)))
  const ub = new Set(ubicacion.flatMap(palabras))
  let mejor: CoincidenciaDeNombre = 'no'
  for (const trozo of ruta.split('/').filter(Boolean)) {
    const t = palabras(trozo)
    // 1) las palabras sueltas: la secuencia del núcleo en la dirección
    for (let i = 0; i + n.nucleo.length <= t.length; i++) {
      if (!n.nucleo.every((p, j) => t[i + j] === p)) continue
      const antes = []
      for (let k = i - 1; k >= 0 && !esNeutral(t[k], propias, ub); k--) antes.push(t[k])
      const despues = []
      for (let k = i + n.nucleo.length; k < t.length && !esNeutral(t[k], propias, ub); k++) despues.push(t[k])
      if (!antes.length && !despues.length) return 'entero'
      mejor = 'con_extras'
    }
    // 2) un usuario pegado («nombrecompleto», «nombre.ciudad»): el trozo entero es el nombre pegado, con a lo sumo palabras neutrales
    for (const unidad of t) {
      const pegadoTodo = n.todas.join('')
      if (unidad === n.compacto || unidad === pegadoTodo) return 'entero'
      for (const base of [n.compacto, pegadoTodo]) {
        if (base.length >= 4 && unidad.startsWith(base)) {
          const resto = unidad.slice(base.length)
          if (resto === '' || /^[0-9]+$/.test(resto) || /^[a-z]{1,2}$/.test(resto) || ub.has(resto) || NEUTRAS.has(resto)) return 'entero'
          mejor = 'con_extras'
        } else if (base.length >= 5 && unidad.includes(base)) mejor = 'con_extras'
      }
    }
  }
  return mejor
}

const ventanasDe = (url: string, ctx: ContextoDeEnlaces): string[] => ctx.ventanasPorEnlace?.get(url) ?? []

export function clasificarEnlace(url: string, ctx: ContextoDeEnlaces): Veredicto {
  for (const [re, motivo] of SALIDA_POR_FORMA) if (re.test(url)) return { estado: 'descartado', motivo }
  const ub = ctx.ubicacion ?? []
  const nombre = coincideElNombreEntero(url, ctx.nombre, ub)
  const ventanas = ventanasDe(url, ctx)
  const credito = ventanas.some((v) => CREDITO.test(v))
  const nuestro = ventanas.some((v) => NUESTRO.test(v)) && !credito
  const esRed = HOSTS_DE_RED.test(url) && !HOSTS_DE_RESENAS.test(url)

  if (nombre === 'entero') {
    if (credito && esRed) return { estado: 'descartado', motivo: 'perfil que firma un crédito del sitio («diseñado por…»): es de quien hizo el sitio' }
    const n = analizarNombre(ctx.nombre)
    if (!n.debil) return { estado: 'propio' }
    // nombre corto o genérico: el nombre solo no basta → la ciudad de la ficha en la dirección, o que el sitio lo marque como «nuestro»
    const tokensUrl = new Set(palabras(url))
    const conCiudad = ub.flatMap(palabras).some((p) => p.length >= 3 && tokensUrl.has(p))
    if (conCiudad || nuestro) return { estado: 'propio' }
    return { estado: 'sin_confirmar', motivo: 'el nombre es corto o genérico y la dirección no lleva la ciudad del negocio ni el sitio la marca como «nuestro» (podría ser un homónimo)' }
  }
  if (nombre === 'con_extras') return { estado: 'sin_confirmar', motivo: 'la dirección lleva el nombre del cliente pero con palabras de más (podría ser OTRO negocio, o el mismo con su ubicación)' }

  // sin el nombre: solo un perfil de red repetido en el sitio con marca de «nuestro» y sin crédito del diseñador puede ser suyo
  if (esRed) {
    if (credito) return { estado: 'descartado', motivo: 'perfil junto a un crédito del sitio («diseñado por…», «powered by…»): es de quien hizo el sitio, no del negocio' }
    const veces = ctx.paginasPorEnlace.get(url) ?? 0
    if (ctx.paginasLeidas >= 3 && veces >= 3 && nuestro) return { estado: 'propio' }
    if (veces >= 2) return { estado: 'sin_confirmar', motivo: 'perfil repetido en el sitio pero sin marca de «nuestro» y sin el nombre del negocio (podría ser de otro)' }
    return { estado: 'descartado', motivo: 'perfil de red que no lleva el nombre del negocio ni se repite en el sitio (podría ser de otro)' }
  }
  if (HOSTS_DE_RESENAS.test(url)) return { estado: 'descartado', motivo: 'ficha de una plataforma de reseñas cuya dirección no lleva el nombre del negocio (es de otro)' }
  return { estado: 'descartado', motivo: 'enlace de salida del sitio: no se demuestra que sea del negocio' }
}

/** separa los enlaces del sitio propio en propios, sin confirmar y descartados (con motivo) */
export function enlacesDelCliente(urls: string[], ctx: ContextoDeEnlaces): { propios: string[]; sin_confirmar: EnlaceSinConfirmar[]; descartados: EnlaceDescartado[] } {
  const propios: string[] = []
  const sin_confirmar: EnlaceSinConfirmar[] = []
  const descartados: EnlaceDescartado[] = []
  for (const u of urls) {
    // solo importan los enlaces a plataformas que el planificador sabe pedir; el resto (páginas del propio sitio, música, mapas de ruta…) ni es candidato ni se reporta
    if (!HOSTS_DE_RESENAS.test(u) && !HOSTS_DE_RED.test(u)) continue
    const v = clasificarEnlace(u, ctx)
    if (v.estado === 'propio') propios.push(u)
    else if (v.estado === 'sin_confirmar') sin_confirmar.push({ url: u, motivo: v.motivo })
    else descartados.push({ url: u, motivo: v.motivo })
  }
  return { propios, sin_confirmar, descartados }
}
