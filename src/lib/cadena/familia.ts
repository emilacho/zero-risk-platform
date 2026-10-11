/**
 * r63 · FAMILIA DE LA OFICINA POR FILA (relevo 61). La familia sale de un DATO (`cadena_formatos_por_red.familia`), nunca del rubro del cliente:
 * el código solo busca (red, formato) en la tabla de formatos. Sin fila de formato, o sin familia en ella, devuelve null = «sin sala»: la pieza va a la pieza simple, como hoy.
 * Puro (sin red ni base).
 */
import type { Fila, FormatosPorRed } from './tipos'

const RE_FAMILIA = /^[a-z][a-z0-9_]{0,39}$/

export function familiaDeFila(fila: Pick<Fila, 'red' | 'formato'>, formatos: FormatosPorRed): string | null {
  const f = (formatos[fila.red] ?? []).find((x) => x.formato === fila.formato)
  const familia = typeof f?.familia === 'string' ? f.familia.trim() : ''
  return familia && RE_FAMILIA.test(familia) ? familia : null
}
