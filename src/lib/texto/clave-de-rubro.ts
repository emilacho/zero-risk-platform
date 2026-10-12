/**
 * COINCIDENCIA POR PALABRA ENTERA · r76 · UNA sola función para todo lo que clasifica un rubro (o cualquier texto libre) contra una lista de claves:
 * paquetes de léxico por rubro (cadena), familias de rubro del planificador de fuentes (manual), y lo que venga.
 *
 * El defecto que corrige: «contiene» acierta mal. «barbería» contiene «bar», «carnet» contiene «carne», «productora» contiene «producto»,
 * «modalidad» contiene «moda», «barrio» contiene «bar», «apicultura» contiene «api», «cabañas» contiene «aña»…
 *
 * Reglas (sin tildes, minúsculas; la ñ NO se confunde con la n):
 *   · una clave coincide si aparece como PALABRA ENTERA (o frase entera) del texto; el plural simple (+s / +es) de la última palabra cuenta;
 *   · una RAÍZ se escribe con asterisco explícito (`peluquer*` ⇒ peluquería, peluquero…) y vale solo al comienzo de una palabra;
 *   · nada más: sin «contiene» escondido. Quien quiera una raíz la pide con `*`.
 * Puro (sin red ni base). Agnóstico: no nombra rubros ni clientes.
 */

const MARCA_ENIE = '§'

/** minúsculas, sin tildes, ñ conservada como letra propia, todo lo demás separador */
export function claveNormal(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ñ/g, MARCA_ENIE)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9§]+/g, ' ')
    .trim()
}

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** ¿la clave (palabra o frase; raíz con `*` al final) aparece entera en el texto? */
export function coincideClave(texto: unknown, clave: string): boolean {
  const t = ' ' + claveNormal(texto) + ' '
  const raiz = typeof clave === 'string' && clave.trim().endsWith('*')
  const c = claveNormal(String(clave ?? '').replace(/\*+\s*$/, ''))
  if (!c) return false
  if (raiz) return t.includes(' ' + c)
  return new RegExp(' ' + escapar(c) + '(?:s|es)? ').test(t)
}

/** ¿alguna de las claves coincide? */
export const coincideAlguna = (texto: unknown, claves: readonly string[]): boolean => (claves ?? []).some((c) => coincideClave(texto, c))

/** las claves de la lista que coinciden (para explicar por qué se clasificó así) */
export const clavesQueCoinciden = (texto: unknown, claves: readonly string[]): string[] => (claves ?? []).filter((c) => coincideClave(texto, c))
