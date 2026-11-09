/**
 * Texto · utilidades puras de la cadena (sin red, sin base).
 * `normalizar` es la MISMA normalización que usa la comprobación de citas literales:
 * minúsculas, sin acentos, espacios colapsados.
 */
export function normalizar(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”«»"']/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Las marcas de formato de Markdown (negrita, cursiva, código: `*` `_` `` ` ``) no son parte de lo que se cita: un plan con «**Primero, …**» se lee «Primero, …». */
const sinFormato = (s: string): string => String(s ?? '').replace(/[*_`]/g, '')

/**
 * ¿La cita aparece literal (normalizada) en el texto? Una cita vacía nunca aparece.
 * 09-nov (falso rojo de la v2 del brief de Náufrago): las marcas de formato se quitan en LOS DOS lados antes de comparar, así una cita bien copiada
 * que cruza una negrita del texto aparece, y una cita inventada sigue sin aparecer. `normalizar` no cambia (la usan otros 9 archivos).
 */
export function citaAparece(texto: string, cita: string | null | undefined): boolean {
  const c = normalizar(sinFormato(cita ?? ''))
  if (c.length < 4) return false
  return normalizar(sinFormato(texto)).includes(c)
}

/** Números enteros que aparecen en un texto (para comprobar que un día/cifra viene de la cita). */
export function numerosEn(s: string): number[] {
  return [...String(s ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]))
}
