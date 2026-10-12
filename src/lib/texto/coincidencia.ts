/**
 * COINCIDENCIA POR PALABRA ENTERA · la función COMPARTIDA (ronda 76 · CC#1 la escribe, CC#2 la usa en la cadena).
 * Defecto que corrige: clasificar un texto «si contiene el trozo» (barbería ⊃ «bar» → comida; apicultura ⊃ «api» → software; cabañas ⊃ «unas» → belleza; autoescuela ⊃ «carne» → comida;
 * productora ⊃ «producto» → bienes; modalidad ⊃ «moda» → comercio). Aquí una clave coincide solo con PALABRAS ENTERAS del texto:
 *   · «cafe»            → la palabra «cafe» (y su plural «cafes»/«cafees»), nunca «cafetera» ni «cafetal»
 *   · «cabana»          → «cabana», «cabanas» (tildes y ñ se ignoran: «cabañas»)
 *   · «odontolog*»      → raíz EXPLÍCITA con asterisco: «odontología», «odontólogo», «odontologica»
 *   · «agencia de viajes» → varias palabras seguidas, enteras (la última admite plural)
 * Sin tildes, sin mayúsculas, sin puntuación. PURO. Nada de este archivo nombra un rubro, un lugar ni un cliente.
 */
import { normalizar } from '../manual/texto'

const palabras = (s: unknown): string[] => normalizar(s).split(' ').filter(Boolean)

/** ¿la palabra del texto es la última palabra de la clave, o su plural simple? */
const igualOPlural = (palabra: string, clave: string): boolean => palabra === clave || (!clave.endsWith('s') && (palabra === clave + 's' || palabra === clave + 'es'))

/** ¿`clave` aparece en `texto` como palabra(s) entera(s)? Un `*` al final de la clave pide solo que la última palabra EMPIECE así (raíz explícita). */
export function coincidePorPalabra(texto: unknown, clave: string): boolean {
  const raiz = String(clave ?? '').trim().endsWith('*')
  const k = palabras(String(clave ?? '').replace(/\*+\s*$/, ''))
  if (!k.length) return false
  const t = palabras(texto)
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
  for (const c of claves) if (coincidePorPalabra(texto, c)) return c
  return null
}

export const coincideAlguna = (texto: unknown, claves: readonly string[]): boolean => primeraClaveQueCoincide(texto, claves) !== null
