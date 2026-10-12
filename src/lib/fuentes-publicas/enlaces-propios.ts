/**
 * Fuentes públicas · ¿ESTE enlace del sitio del cliente es SUYO? (ronda 76 · condición dura de CC#3 para encender el alta).
 * Un sitio enlaza muchas cosas que NO son del cliente: «qué hacer cerca» (una playa, otro hotel), «compartir en…», créditos, aliados. Pedir reseñas de esos enlaces es pagar por raspar a otro
 * y luego citarlo. Solo cuenta como del cliente un enlace que:
 *   · NO es de salida por su forma (compartir, intención de tuit, ventanas de diálogo, listados y búsquedas de las plataformas, un video suelto), y además
 *   · lleva EL NOMBRE del cliente (todas sus palabras propias, enteras, en la dirección de la ficha o del perfil), o
 *   · es un perfil de RED SOCIAL que se repite en varias páginas del sitio (cabecera o pie: «nuestro»); las plataformas de reseñas (que listan negocios ajenos) piden el nombre sí o sí.
 * Lo declarado en la ficha del cliente (sus usuarios de red) no pasa por aquí: manda. Todo lo descartado queda dicho con su motivo. PURO; nada de este archivo nombra un rubro, un lugar ni un cliente.
 */
import { normalizar } from '../manual/texto'

export interface EnlaceDescartado { url: string; motivo: string }
export interface ContextoDeEnlaces {
  /** nombre del negocio (ficha) */
  nombre: string | null | undefined
  /** por cada dirección hallada: en cuántas páginas DISTINTAS del sitio propio aparece */
  paginasPorEnlace: Map<string, number>
  /** cuántas páginas del sitio propio se leyeron */
  paginasLeidas: number
}

/** palabras que no identifican a un negocio (tipo de local, artículos): no cuentan como «el nombre» */
const GENERICAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'the', 'and', 'for', 'por', 'en', 'hotel', 'hostal', 'hostel', 'restaurante', 'restaurant', 'cafe', 'cafeteria', 'bar', 'clinica', 'tienda', 'estudio', 'grupo', 'empresa', 'spa', 'cabanas', 'cabana', 'posada', 'resort', 'agencia', 'consultora', 'centro', 'taller', 'casa'])

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

/** las palabras PROPIAS del nombre (sin tipo de local ni artículos); si no queda ninguna, todas las de ≥ 3 letras */
export function palabrasDelNombre(nombre: string | null | undefined): string[] {
  const todas = normalizar(nombre ?? '').split(' ').filter((p) => p.length >= 3)
  const propias = todas.filter((p) => !GENERICAS.has(p))
  return propias.length ? propias : todas
}

/** ¿la dirección lleva el nombre? Cada palabra propia como palabra entera de la dirección, o el nombre pegado (como en un usuario de red: «nombreapellido») */
export function direccionLlevaElNombre(url: string, nombre: string | null | undefined): boolean {
  const ps = palabrasDelNombre(nombre)
  if (!ps.length) return false
  let ruta = url
  try { const u = new URL(url.includes('://') ? url : `https://${url}`); ruta = decodeURIComponent(u.pathname) } catch { /* se usa la dirección tal cual */ }
  const segmentos = normalizar(ruta).split(' ').filter(Boolean)
  if (ps.every((p) => segmentos.includes(p))) return true
  const pegado = ps.join('')
  const compacto = (s: string) => normalizar(s).replace(/ /g, '')
  return pegado.length >= 5 && ruta.split('/').filter(Boolean).some((tramo) => compacto(tramo).includes(pegado))
}

export function clasificarEnlace(url: string, ctx: ContextoDeEnlaces): { propio: true } | { propio: false; motivo: string } {
  for (const [re, motivo] of SALIDA_POR_FORMA) if (re.test(url)) return { propio: false, motivo }
  if (direccionLlevaElNombre(url, ctx.nombre)) return { propio: true }
  if (HOSTS_DE_RED.test(url) && !HOSTS_DE_RESENAS.test(url)) {
    const veces = ctx.paginasPorEnlace.get(url) ?? 0
    if (ctx.paginasLeidas >= 3 && veces >= 2) return { propio: true }
    return { propio: false, motivo: 'perfil de red que no lleva el nombre del negocio ni se repite en el sitio (podría ser de otro)' }
  }
  if (HOSTS_DE_RESENAS.test(url)) return { propio: false, motivo: 'ficha de una plataforma de reseñas cuya dirección no lleva el nombre del negocio (podría ser de otro)' }
  return { propio: false, motivo: 'enlace de salida del sitio: no se demuestra que sea del negocio' }
}

/** separa los enlaces del sitio propio en los del cliente y los descartados (con motivo) */
export function enlacesDelCliente(urls: string[], ctx: ContextoDeEnlaces): { propios: string[]; descartados: EnlaceDescartado[] } {
  const propios: string[] = []
  const descartados: EnlaceDescartado[] = []
  for (const u of urls) {
    // solo importan los enlaces a plataformas que el planificador sabe pedir; el resto (páginas del propio sitio, música, mapas de ruta…) ni es candidato ni se reporta
    if (!HOSTS_DE_RESENAS.test(u) && !HOSTS_DE_RED.test(u)) continue
    const c = clasificarEnlace(u, ctx)
    if (c.propio) propios.push(u)
    else descartados.push({ url: u, motivo: c.motivo })
  }
  return { propios, descartados }
}
