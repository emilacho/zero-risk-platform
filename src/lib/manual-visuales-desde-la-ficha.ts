/**
 * CABLE ② · COLORES Y TIPOGRAFÍA DEL SITIO · lado del manual · CC#1 · 2026-09-25 · §144 Emilio.
 *
 * El Servicio de Apify deja los colores y tipografías declarados por el sitio en la ficha
 * (`clients.brand_colors` / `brand_fonts`, sólo si estaban vacíos). Cuando el cimiento promueve un
 * manual (`POST /api/brand-book/[clientId]`), esta función completa `primary_colors` y `typography`
 * del manual DESDE LA FICHA si el manual no los trae. Puro y aditivo: si la ficha no tiene nada, la
 * fila queda exactamente como hoy (sin esas claves ⇒ el valor por defecto de la base, `[]`).
 * Nunca pisa lo que el manual ya traía.
 */
export type FichaVisual = { brand_colors?: unknown; brand_fonts?: unknown } | null | undefined

function listaNoVacia(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0
}

export function completarVisualesDesdeLaFicha(
  row: Record<string, unknown>,
  bb: Record<string, unknown>,
  ficha: FichaVisual,
): { row: Record<string, unknown>; origen: { primary_colors: 'manual' | 'ficha' | null; typography: 'manual' | 'ficha' | null } } {
  const out = { ...row }
  const origen: { primary_colors: 'manual' | 'ficha' | null; typography: 'manual' | 'ficha' | null } = { primary_colors: null, typography: null }
  if (listaNoVacia(bb.primary_colors)) {
    out.primary_colors = bb.primary_colors
    origen.primary_colors = 'manual'
  } else if (listaNoVacia(ficha?.brand_colors)) {
    out.primary_colors = ficha!.brand_colors
    origen.primary_colors = 'ficha'
  }
  if (listaNoVacia(bb.typography)) {
    out.typography = bb.typography
    origen.typography = 'manual'
  } else if (listaNoVacia(ficha?.brand_fonts)) {
    out.typography = ficha!.brand_fonts
    origen.typography = 'ficha'
  }
  return { row: out, origen }
}
