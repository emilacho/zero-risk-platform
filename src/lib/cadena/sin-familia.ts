/**
 * FORMATOS SIN FAMILIA (GO Lenovo 2026-11-11 00:08Z · «formatos sin familia», punto b · CC3).
 * Hallazgo de CC7 (W46 de Náufrago): la parte por filas murió entera en «④ Chequeos» (`PARTE_HOJA_SIN_FAMILIA`) porque 4 filas de `anuncio_imagen` no tienen familia en
 * `cadena_formatos_por_red`. Una fila mala paraba el lote completo.
 * Regla exacta (código, no agente · para cualquier cliente):
 *   · una fila «sin familia» = su (red, formato) no tiene familia en `cadena_formatos_por_red`, con la MISMA búsqueda que usa la hoja (`familiaDe`): exactamente las filas
 *     que harían saltar la guarda de la parte;
 *   · esas filas SALEN del lote (no se mandan, no se gasta en ellas); el resto del lote sigue igual que hoy;
 *   · cada fila que sale lleva la razón escrita en sus avisos (una sola vez: si ya la tiene, no se repite) y queda `validada`: si mañana su formato recibe familia, vuelve sola al lote;
 *   · se avisa UNA vez por el buzón (C1), por campaña y versión del calendario: una clave por incidente, las siguientes pasadas no vuelven a avisar si no hay filas nuevas;
 *   · un lote en que TODAS las filas son sin familia no sale (no gasta) y avisa igual, una vez;
 *   · tabla de formatos SIN NINGUNA familia (vacía, ilegible, o anterior a la columna `familia`): no se juzga nada (no hay de dónde sacarla) y todo queda como hoy;
 *     en producción la tabla tiene familias (post_img · carrusel_ig_v1 · kit_historias, migración 202610110100), así que la regla aplica.
 * Puro (sin red ni base).
 */
import { familiaDe } from './hoja'
import type { Fila, FormatosPorRed } from './tipos'

export const PREFIJO_SIN_FAMILIA = 'sin familia: '
export const esNotaSinFamilia = (a: unknown): boolean => typeof a === 'string' && a.startsWith(PREFIJO_SIN_FAMILIA)

/** ¿se puede juzgar? solo con una tabla de formatos en la que AL MENOS UN formato tenga familia */
const hayFamilias = (formatos: FormatosPorRed): boolean => Object.values(formatos ?? {}).some((xs) => Array.isArray(xs) && xs.some((x) => typeof x?.familia === 'string' && x.familia.trim() !== ''))

/** true si la fila no tiene familia en la tabla (la hoja la marcaría «sin familia» y la guarda de la parte pararía el lote) */
export function filaSinFamilia(f: Pick<Fila, 'red' | 'formato'>, formatos: FormatosPorRed): boolean {
  return hayFamilias(formatos) && !familiaDe(formatos, f.red, f.formato)
}

/** la razón que queda escrita en la fila */
export const notaSinFamilia = (f: Pick<Fila, 'red' | 'formato'>): string =>
  `${PREFIJO_SIN_FAMILIA}${f.red} · ${f.formato} no tiene familia en cadena_formatos_por_red (ninguna oficina lo produce): la fila sale del parte y el resto del lote sigue; vuelve sola cuando su formato tenga familia`

/** la clave del incidente en el buzón: una por campaña y versión del calendario */
export const claveDelAvisoSinFamilia = (campanaId: string, version: number): string => `cadena:formato-sin-familia:${campanaId}:${version}`

export interface AvisoSinFamilia { clave: string; client_id: string; titulo: string; detalle: string }
/** el aviso · el buzón manda a Slack SOLO el primero de cada clave: el texto dice la política entera */
export function avisoSinFamilia(c: { id: string; client_id: string }, version: number, filas: ReadonlyArray<Pick<Fila, 'id' | 'red' | 'formato'>>): AvisoSinFamilia {
  const formatos = [...new Set(filas.map((f) => `${f.red} · ${f.formato}`))].sort()
  return {
    clave: claveDelAvisoSinFamilia(c.id, version),
    client_id: c.client_id,
    titulo: `La campaña ${c.id.slice(0, 8)} tiene filas cuyo formato no produce ninguna oficina`,
    detalle: `${filas.length} fila(s) salen del parte porque su formato no tiene familia (${formatos.join(', ')}): ${filas.map((f) => f.id).join(', ')}. El resto del lote sigue. Cada fila lleva la razón escrita y vuelve sola cuando su formato tenga familia en cadena_formatos_por_red.`,
  }
}
