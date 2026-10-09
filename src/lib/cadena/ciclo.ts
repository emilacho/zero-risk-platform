/**
 * El ciclo de UNA corrección (diseño v2 §10.4 + correcciones de Emilio del 09-oct).
 *
 *  1. falla un chequeo `bloquea` → el código arma fichas y pide UNA corrección al agente;
 *  2. el código re-valida TODO;
 *  3. si aún hay bloqueos:
 *       · los de DATO FALTANTE (V06, V07, V14, V16, V22, C02) NO detienen la campaña ni se le preguntan al cliente:
 *         esa FILA sale (`descartada_sin_fuente`) y el slot se anota como omitido;
 *       · cualquier otro bloqueo → la campaña pasa a `necesita_humano` (la bandeja de Emilio) y nada avanza.
 *  Los `aviso` no detienen: viajan al brief como advertencia.
 */
import { CHEQUEOS_DE_DATO_FALTANTE } from './validador-calendario'
import type { Ajuste, Ficha, Hallazgo } from './tipos'

export interface PlanDeCorreccion {
  necesita: boolean
  /** `tanda`: hay un bloqueo de conjunto (frecuencia, reparto, dependencias…) → se regenera la tanda; `filas`: se parchean solo las que fallaron. */
  modo: 'ninguna' | 'filas' | 'tanda'
  filaIds: string[]
  fichas: Ficha[]
}

export function planDeCorreccion(hs: Hallazgo[]): PlanDeCorreccion {
  const bloqueos = hs.filter((x) => x.severidad === 'bloquea')
  if (!bloqueos.length) return { necesita: false, modo: 'ninguna', filaIds: [], fichas: [] }
  const hayTanda = bloqueos.some((x) => x.alcance === 'tanda')
  const filaIds = [...new Set(bloqueos.filter((x) => x.fila_id).map((x) => x.fila_id as string))]
  return { necesita: true, modo: hayTanda ? 'tanda' : 'filas', filaIds, fichas: bloqueos.map((x) => x.ficha) }
}

export interface Resolucion {
  estado: 'ok' | 'filas_salen' | 'necesita_humano'
  filasQueSalen: string[]
  /** se pasan a la re-validación para que la frecuencia no castigue a la fila que salió */
  ajustes: Ajuste[]
  fichasPendientes: Ficha[]
}

function slotDe(id: string): string {
  return id.replace(/^s\d+-d\d+-/, '')
}

/** Tras la única corrección y la re-validación completa (`hs` es el resultado de la SEGUNDA pasada). */
export function resolverTrasCorreccion(hs: Hallazgo[], semanaDe: (filaId: string) => number): Resolucion {
  const bloqueos = hs.filter((x) => x.severidad === 'bloquea')
  if (!bloqueos.length) return { estado: 'ok', filasQueSalen: [], ajustes: [], fichasPendientes: [] }
  const esFaltante = (x: Hallazgo) => !!x.fila_id && CHEQUEOS_DE_DATO_FALTANTE.has(x.chequeo)
  const faltantes = bloqueos.filter(esFaltante)
  const otros = bloqueos.filter((x) => !esFaltante(x))
  if (otros.length) return { estado: 'necesita_humano', filasQueSalen: [], ajustes: [], fichasPendientes: otros.map((x) => x.ficha) }
  const ids = [...new Set(faltantes.map((x) => x.fila_id as string))]
  return {
    estado: 'filas_salen',
    filasQueSalen: ids,
    ajustes: ids.map((id) => ({ semana: semanaDe(id), slot: slotDe(id), accion: 'omitir' as const, motivo: 'la fila salió: dato sin fuente tras la corrección' })),
    fichasPendientes: faltantes.map((x) => x.ficha),
  }
}
