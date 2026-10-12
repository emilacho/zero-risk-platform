/**
 * COINCIDENCIA POR PALABRA ENTERA · la ÚNICA función compartida (ronda 76 la escribieron dos; ronda 77 queda una: cadena, oficina y fuentes públicas usan esta).
 * Defecto que corrige: clasificar un texto «si contiene el trozo» (barbería ⊃ «bar» → comida; apicultura ⊃ «api» → software; autoescuela ⊃ «carne» → comida;
 * productora ⊃ «producto» → bienes; modalidad ⊃ «moda» → comercio). Aquí una clave coincide solo con PALABRAS ENTERAS del texto:
 *   · «cafe»            → la palabra «cafe» (y su plural «cafes»/«cafees»), nunca «cafetera» ni «cafetal»
 *   · «cabañ*»          → raíz EXPLÍCITA con asterisco: «cabaña», «cabañas», y también «cabanas» (las fichas suelen escribirlo sin ñ)
 *   · «agencia de viajes» → varias palabras seguidas, enteras (la última admite plural)
 * Sin tildes, sin mayúsculas, sin puntuación. La ñ se acepta como n (fichas sin ñ), SALVO en una clave corta con ñ (menos de 5 letras, p. ej. «uñas»):
 * ahí la ñ cuenta, porque «unas» es un artículo («unas cabañas» no es «uñas»); para esos rubros se suman claves sin ambigüedad («manicur*», «unas acrilicas»).
 * PURO. Nada de este archivo nombra un rubro, un lugar ni un cliente.
 */
const MARCA_ENIE = '§'

/** minúsculas, sin tildes y sin puntuación; la ñ queda como letra propia (`§`) si `estricta`, y como n si no */
function normal(s: unknown, estricta: boolean): string {
  let t = String(s ?? '').toLowerCase().replace(/ñ/g, MARCA_ENIE).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9§]+/g, ' ').trim()
  if (!estricta) t = t.replace(/§/g, 'n')
  return t
}
const palabras = (s: unknown, estricta: boolean): string[] => normal(s, estricta).split(' ').filter(Boolean)

/** ¿la palabra del texto es la última palabra de la clave, o su plural simple? */
const igualOPlural = (palabra: string, clave: string): boolean => palabra === clave || (!clave.endsWith('s') && (palabra === clave + 's' || palabra === clave + 'es'))

/** ¿`clave` aparece en `texto` como palabra(s) entera(s)? Un `*` al final de la clave pide solo que la última palabra EMPIECE así (raíz explícita). */
export function coincidePorPalabra(texto: unknown, clave: string): boolean {
  const cruda = String(clave ?? '')
  const raiz = cruda.trim().endsWith('*')
  const sinAsterisco = cruda.replace(/\*+\s*$/, '')
  const estricta = /ñ/i.test(sinAsterisco) && normal(sinAsterisco, false).replace(/ /g, '').length < 5
  const k = palabras(sinAsterisco, estricta)
  if (!k.length) return false
  const t = palabras(texto, estricta)
  for (let i = 0; i + k.length <= t.length; i++) {
    let ok = true
    for (let j = 0; j < k.length && ok; j++) {
      const p = t[i + j]
      const ultima = j === k.length - 1
      ok = ultima ? (raiz ? p.startsWith(k[j]) : igualOPlural(p, k[j])) : p === k[j]
    }
    if (ok) return true
  }
  return false
}

/** la primera clave de la lista que coincide, o null */
export function primeraClaveQueCoincide(texto: unknown, claves: readonly string[]): string | null {
  for (const c of claves ?? []) if (coincidePorPalabra(texto, c)) return c
  return null
}

export const coincideAlguna = (texto: unknown, claves: readonly string[]): boolean => primeraClaveQueCoincide(texto, claves) !== null

/** todas las claves de la lista que coinciden (para explicar por qué se clasificó así) */
export const clavesQueCoinciden = (texto: unknown, claves: readonly string[]): string[] => (claves ?? []).filter((c) => coincidePorPalabra(texto, c))
