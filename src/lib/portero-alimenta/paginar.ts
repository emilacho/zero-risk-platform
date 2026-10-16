/**
 * LEER TODAS LAS FILAS · la base entrega como máximo 1.000 filas por consulta aunque se pida `.limit(5000)` (medido el 16-oct: `agent_invocations` devolvía 1.000 de 1.066).
 * Una lectura recortada en silencio es peor que una falla: el portero creería que una ficha o una unidad vista no existe (y la escribiría de nuevo) o que un trozo del índice
 * sobra (y lo sacaría). Aquí se lee por páginas con orden estable; si pasa del tope se DICE como error. PURO salvo la consulta que recibe.
 */
type Fila = Record<string, unknown>
export const TAMANO_DE_PAGINA = 1000
/** tope de seguridad: 50 páginas = 50.000 filas por cliente y tabla */
export const MAX_PAGINAS = 50

/** `construir` arma la consulta COMPLETA (select + filtros + orden estable) cada vez; aquí se le agrega el rango */
export async function leerTodas(construir: () => { range: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<{ data: Fila[]; error: { message: string } | null }> {
  const out: Fila[] = []
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await construir().range(p * TAMANO_DE_PAGINA, (p + 1) * TAMANO_DE_PAGINA - 1)
    if (r.error) return { data: out, error: r.error }
    const filas = Array.isArray(r.data) ? (r.data as Fila[]) : []
    out.push(...filas)
    if (filas.length < TAMANO_DE_PAGINA) return { data: out, error: null }
  }
  return { data: out, error: { message: `más de ${MAX_PAGINAS * TAMANO_DE_PAGINA} filas: la lectura se corta y no se sigue a ciegas` } }
}
