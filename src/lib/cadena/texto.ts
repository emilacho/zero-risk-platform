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

/**
 * EL TEXTO CONTRA EL QUE SE COMPRUEBA UNA CITA (10-nov · GO Lenovo 18:01Z tras la prueba de segundo cliente #1003).
 * Hay clientes cuyo plan o manual está guardado como JSON: ahí las comillas van como `\"` y los saltos de párrafo como `\n` escritos,
 * así que una cita bien copiada con comillas dentro, o que cruza dos párrafos, no aparecía. Si el documento ES JSON, se compara contra
 * TODOS sus valores como texto, uno por línea (sin elegir ni juzgar ninguno). Si no lo es, se usa tal cual.
 * 10-nov 18:48Z (GO Lenovo): es el LECTOR COMÚN de todas las comprobaciones exactas de citas (brief, estrategia S02, temporadas del negocio). Cambia cómo se
 * lee el documento, nunca qué se juzga.
 */
export function textoDelDocumento(documento: string): string {
  const t = String(documento ?? '').trim()
  if (!/^[[{]/.test(t)) return String(documento ?? '')
  let dato: unknown
  try { dato = JSON.parse(t) } catch { return String(documento ?? '') }
  const valores: string[] = []
  const recorrer = (v: unknown): void => {
    if (typeof v === 'string') valores.push(v)
    else if (typeof v === 'number' || typeof v === 'boolean') valores.push(String(v))
    else if (Array.isArray(v)) v.forEach(recorrer)
    else if (v && typeof v === 'object') Object.values(v).forEach(recorrer)
  }
  recorrer(dato)
  return valores.join('\n')
}

/** ¿la cita aparece literal en el DOCUMENTO (plan o manual, en texto o en JSON)? Lo mismo que `citaAparece`, leyendo el documento con el lector común. */
export function citaEnDocumento(documento: string, cita: string | null | undefined): boolean {
  return citaAparece(textoDelDocumento(documento), cita)
}

/** Números enteros que aparecen en un texto (para comprobar que un día/cifra viene de la cita). */
export function numerosEn(s: string): number[] {
  return [...String(s ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]))
}
