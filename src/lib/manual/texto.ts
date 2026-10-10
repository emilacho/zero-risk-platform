/**
 * REVISIÓN DEL MANUAL · texto · lo común a todas las reglas (funciones PURAS, sin red, sin modelo).
 * Diseño: docs/DISENO-2026-10-10-revision-del-manual.md. Agnóstico: nada de rubro, cliente ni lugar.
 */

/** sin tildes, en minúsculas, solo letras, números y @ # $ %; espacios colapsados (un recorte literal sobrevive a esto; una paráfrasis no) */
export function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ$%@#]+/g, ' ')
    .trim()
}

export const palabrasDe = (s: unknown): string[] => normalizar(s).split(' ').filter(Boolean)

/** ¿`frase` aparece TAL CUAL (por palabras completas) dentro de `texto`? Ambos ya normalizados o no: se normalizan. */
export function contieneLiteral(texto: unknown, frase: unknown): boolean {
  const f = normalizar(frase)
  if (!f) return false
  return ` ${normalizar(texto)} `.includes(` ${f} `)
}

/** partir en frases: punto, cierre de interrogación/exclamación, punto y coma y saltos de línea (no corta números como 7.00 ni 1.250) */
export function partirEnFrases(texto: unknown): string[] {
  const t = String(texto ?? '').replace(/\r/g, '')
  const out: string[] = []
  for (const bloque of t.split(/\n+/)) {
    for (const f of bloque.split(/(?<=[.!?…;])\s+(?=[\p{Lu}¿¡«"“(\d])/u)) {
      const s = f.trim()
      if (s) out.push(s)
    }
  }
  return out
}

/** partir una frase en cláusulas (coma, dos puntos, punto y coma, paréntesis, rayas): la unidad que se corrige sin tocar el resto de la frase */
export function partirEnClausulas(frase: string): string[] {
  // no se corta una coma entre dígitos («1,231») ni una raya entre cifras («$7–$9»)
  return frase.split(/(?<!\d),|,(?!\d)|[;:()]|\s[—–]\s|\s-\s/).map((c) => c.trim().replace(/[.!?…]+$/, '')).filter((c) => palabrasDe(c).length >= 1)
}

/** palabras de relleno del español que no cuentan como «contenido» al medir el contexto compartido (dato, no regla de negocio) */
export const RELLENO_ES = new Set(
  ('el la los las un una unos unas de del al a en y o u que se su sus con por para como mas muy no si es son ser fue era hay ha han lo le les me te nos esa ese eso esta este esto ' +
    'tu tus mi mis nuestro nuestra nuestros nuestras sin sobre entre desde hasta tambien pero ya solo cada todo toda todos todas otro otra otros otras').split(' '),
)

/** palabras de contenido (≥ 3 letras, sin relleno) */
export const contenidoDe = (s: unknown): string[] => palabrasDe(s).filter((w) => w.length >= 3 && !RELLENO_ES.has(w))

/** cuántas palabras de contenido comparten dos textos */
export function contenidoCompartido(a: unknown, b: unknown): number {
  const sb = new Set(contenidoDe(b))
  return new Set(contenidoDe(a).filter((w) => sb.has(w))).size
}

/** ¿una palabra empieza con la raíz dada? (las raíces son DATO: ver palabras-de-certeza) */
export const empiezaCon = (palabra: string, raiz: string): boolean => palabra.startsWith(raiz)
