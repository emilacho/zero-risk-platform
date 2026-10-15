/**
 * LA ZONA DE UN CLIENTE · el país (ISO-2) de su ficha y el id de las fichas «de zona» (`zona:<país>`: feriados, temporada…). Sin país, sin zona: no se adivina.
 * Dato: se amplía una línea por país. Lo usan el lector del cerebro (qué fichas de zona le tocan a un cliente) y los brazos nuevos (dónde las escriben).
 */
export const PREFIJO_DE_ZONA = 'zona:'
const PAISES: Record<string, string> = { ecuador: 'ec', colombia: 'co', peru: 'pe', mexico: 'mx', argentina: 'ar', chile: 'cl', uruguay: 'uy', paraguay: 'py', bolivia: 'bo', espana: 'es' }
const SIN_TILDE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }
// solo para comparar el nombre de un PAÍS contra una lista fija (no es la comparación de textos del pedido): sin tildes, minúsculas, sin signos
const normal = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[áéíóúüñ]/g, (c) => SIN_TILDE[c] ?? c).replace(/[^a-z0-9]+/g, ' ').trim()

/** el código ISO-2 (minúscula) del país: acepta el código o el nombre; `null` si no se sabe */
export function paisIsoDe(pais: unknown, mercado?: unknown): string | null {
  const n = normal(pais)
  if (n.length === 2) return n
  if (PAISES[n]) return PAISES[n]
  const m = normal(mercado).split(' ')
  for (const [nombre, iso] of Object.entries(PAISES)) if (m.includes(nombre)) return iso
  return null
}
export const idDeZona = (iso: string): string => `${PREFIJO_DE_ZONA}${iso.toLowerCase()}`
