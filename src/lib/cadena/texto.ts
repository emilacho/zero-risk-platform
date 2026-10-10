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

/** ¿La cita aparece literal (normalizada) en el texto? Una cita vacía nunca aparece. */
export function citaAparece(texto: string, cita: string | null | undefined): boolean {
  const c = normalizar(cita ?? '')
  if (c.length < 4) return false
  return normalizar(texto).includes(c)
}

/** Números enteros que aparecen en un texto (para comprobar que un día/cifra viene de la cita). */
export function numerosEn(s: string): number[] {
  return [...String(s ?? '').matchAll(/\d+/g)].map((m) => Number(m[0]))
}
