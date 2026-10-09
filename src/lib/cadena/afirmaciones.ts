/**
 * Qué cuenta como «dato con fuente» (V14) y qué cuenta como «afirmación sin respaldo» (CC#3 condición 3).
 *
 * El chequeo original validaba lo que el agente DECLARA en `datos[]`. Las invenciones que se midieron en la prueba real no eran cifras:
 * «el marisco llega el mismo día», «camarón y pescado de <lugar>», «dos mixtos alcanzan para cuatro», «él es quien pesca lo que comes».
 * Un agente que no las declara las colaba. Este módulo mira el TEXTO, no solo lo declarado: toda cifra y toda afirmación de
 * origen / frescura / porción / trazabilidad / garantía que aparezca en un `tema` sin respaldo bloquea igual.
 *
 * Las listas son datos del propio idioma (español), no de un rubro ni de un cliente.
 */
import { normalizar } from './texto'
import type { Clase } from './tipos'

export interface Hallado { tipo: 'cifra' | 'afirmacion'; subtipo: string; texto: string; clase: Clase }

/** Cifras que son DATOS (no «3 posts» ni «4 pasos»): dinero, medida, porcentaje, hora, reseñas, puntaje. Orden irrelevante. */
const CIFRAS: { subtipo: string; re: RegExp; clase: Clase }[] = [
  { subtipo: 'dinero', re: /(?:US\$|\$)\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:dolares|dólares|usd)\b/gi, clase: 'alto' },
  { subtipo: 'medida', re: /\b\d+(?:[.,]\d+)?\s?(?:g|gr|kg|mg|ml|l|lt|litros?|gramos?|onzas?|oz|cm|mm)\b/gi, clase: 'alto' },
  { subtipo: 'porcentaje', re: /\b\d+(?:[.,]\d+)?\s?%/g, clase: 'alto' },
  { subtipo: 'hora', re: /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, clase: 'alto' },
  { subtipo: 'resenas', re: /\b\d+(?:[.,]\d+)?\s?(?:rese[ñn]as?|opiniones|calificaciones|estrellas?)\b/gi, clase: 'alto' },
  { subtipo: 'puntaje', re: /\b[0-5][.,]\d\b(?!\s?(?:g|gr|kg|ml|l|%))/g, clase: 'alto' },
  { subtipo: 'duracion', re: /\b\d+\s?(?:min|minutos|horas?|hrs?)\b/gi, clase: 'medio' },
]

/**
 * Afirmaciones de origen / frescura / porción / trazabilidad / garantía (español). Se miden contra el texto normalizado
 * (minúsculas, sin acentos). Cada una declara la clase de riesgo: todas son «alto» salvo las de ambiente.
 * Esta lista es un dato: se amplía con fixtures reales (E4), no se reescribe la lógica.
 */
export const PATRONES_AFIRMACION: { subtipo: string; re: RegExp }[] = [
  { subtipo: 'frescura', re: /\b(?:mismo dia|del dia|de hoy|hoy mismo|recien (?:pescad|cosechad|hecho|horneado|sacad|llegad)\w*|fresc[oa]s?|frescura)\b/g },
  { subtipo: 'origen', re: /\b(?:de la zona|de la costa|del campo|de origen|traid[oa]s? (?:de|desde)|llega(?:n)? (?:de|desde)|importad[oa]s?)\b/g },
  { subtipo: 'porcion', re: /\b(?:alcanza(?:n)? para|rinde(?:n)? para|para \d+ personas?|porcion(?:es)? (?:generosa|abundante|grande)s?)\b/g },
  { subtipo: 'trazabilidad', re: /\b(?:el mismo (?:que|quien)|el es quien|ella es quien|es quien (?:pesca|cultiva|prepara|hace|cocina)|directo (?:del|de la) (?:productor|pescador|campo|agricultor)|sin intermediarios|de nuestros? (?:propios? )?(?:pescadores|productores|agricultores))\b/g },
  { subtipo: 'garantia', re: /(?:\bgarantizad[oa]s?\b|\b100 ?%|\bcien por ciento\b|\bnunca falla\b|\bsin falta\b)/g },
]

/** Lugar propio tras «de/desde» con inicial mayúscula en el texto ORIGINAL (p. ej. «camarón y pescado de Olón»). */
const LUGAR = /\b(?:de|desde)\s+(?:la\s+|el\s+|los\s+|las\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g
/** Palabras con mayúscula después de «de» que NO son un lugar de origen (días, meses, redes, etc.). */
const NO_LUGAR = new Set(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'google', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre', 'dia', 'semana', 'fase'])

/**
 * Todo lo que un `tema` afirma y necesita respaldo. `conocidos` = nombres/claves de las sedes del cliente y el nombre del negocio: «de <sede>» o «de <negocio>» no es un origen de producto.
 */
export function hallarAfirmaciones(tema: string, conocidos: readonly string[] = []): Hallado[] {
  const out: Hallado[] = []
  const t = String(tema ?? '')
  for (const c of CIFRAS) for (const m of t.matchAll(new RegExp(c.re.source, c.re.flags))) out.push({ tipo: 'cifra', subtipo: c.subtipo, texto: m[0].trim(), clase: c.clase })
  const n = normalizar(t)
  for (const p of PATRONES_AFIRMACION) for (const m of n.matchAll(new RegExp(p.re.source, p.re.flags))) out.push({ tipo: 'afirmacion', subtipo: p.subtipo, texto: m[0].trim(), clase: 'alto' })
  const sedesN = conocidos.map(normalizar)
  for (const m of t.matchAll(new RegExp(LUGAR.source, LUGAR.flags))) {
    const lugar = normalizar(m[1])
    if (NO_LUGAR.has(lugar) || sedesN.some((s) => lugar.startsWith(s) || s.startsWith(lugar))) continue
    out.push({ tipo: 'afirmacion', subtipo: 'origen_lugar', texto: m[0].trim(), clase: 'alto' })
  }
  return out
}

/** Voseo (el tuteo de Ecuador no lo admite). Lista de formas verbales y pronombres del voseo rioplatense/centroamericano. */
const VOSEO = /\b(?:vos|tenes|queres|podes|sabes que|miras?|proba(?:lo|la|los|las)?|veni|decime|hace(?:lo|la)?|pedi(?:lo|la)?|elegi|anda(?:te)?|fijate|date cuenta|mira(?:lo|la)?|sentate|pasate|vas a poder)\b/g
export function hallarVoseo(tema: string): string[] {
  // el voseo se detecta sobre el texto SIN acentos; se excluyen formas que en tuteo existen igual («hace» 3.ª persona, «mira» 3.ª, «sabes» tú)
  const n = normalizar(tema)
  const out: string[] = []
  for (const m of n.matchAll(new RegExp(VOSEO.source, VOSEO.flags))) {
    const w = m[0]
    if (/^(?:hace|mira|miras|pedi|anda|elegi)$/.test(w)) continue // ambiguas con tuteo/3.ª persona: solo se cuentan con enclítico (lo, la, te)
    out.push(w)
  }
  return out
}

/** Una fecha absoluta o «día N» escrita en un tema (V13). */
export function hallarFechasEnTema(tema: string): { texto: string; diaN: number | null }[] {
  const out: { texto: string; diaN: number | null }[] = []
  const t = normalizar(tema)
  for (const m of t.matchAll(/\b(\d{1,2})\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g)) out.push({ texto: m[0], diaN: null })
  for (const m of t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) out.push({ texto: m[0], diaN: null })
  for (const m of t.matchAll(/\bdia\s+(\d{1,3})\b/g)) out.push({ texto: m[0], diaN: Number(m[1]) })
  return out
}
