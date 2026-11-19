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
  /** 19-nov · grupo C · de `filasQueSalen`, las que salen por un bloqueo que NO es «dato sin fuente» (`descartada_por_bloqueo`) */
  porBloqueo?: string[]
}

/** 19-nov · grupo C · el motivo del slot que queda omitido cuando una fila SALE en la cadena (por cada uno de los estados de `SALIERON_EN_LA_CADENA`) */
export const MOTIVO_DE_SALIDA = {
  descartada_sin_fuente: 'la fila salió: dato sin fuente tras la corrección',
  descartada_por_bloqueo: 'la fila salió: siguió bloqueada tras la última ronda de corrección',
} as const

export function slotDe(id: string): string {
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
    ajustes: ids.map((id) => ({ semana: semanaDe(id), slot: slotDe(id), accion: 'omitir' as const, motivo: MOTIVO_DE_SALIDA.descartada_sin_fuente })),
    fichasPendientes: faltantes.map((x) => x.ficha),
  }
}

/**
 * 19-nov · grupo C (firma de Emilio, ADENDA 17:22Z) · tras la ÚLTIMA ronda de corrección: toda fila que sigue bloqueada SALE. La de dato sin fuente como siempre
 * (`descartada_sin_fuente`); la de cualquier otro bloqueo, `descartada_por_bloqueo`. Cada una deja su slot omitido con su motivo. Los bloqueos de CONJUNTO (sin fila)
 * no tienen fila que sacar: los baja a aviso `bajarBloqueosDeConjuntoAAvisos` después de re-validar.
 */
export function resolverTrasLaUltimaRonda(hs: Hallazgo[], semanaDe: (filaId: string) => number): Resolucion {
  const bloqueos = hs.filter((x) => x.severidad === 'bloquea' && !!x.fila_id)
  const faltante = (x: Hallazgo) => CHEQUEOS_DE_DATO_FALTANTE.has(x.chequeo)
  const porBloqueo = [...new Set(bloqueos.filter((x) => !faltante(x)).map((x) => x.fila_id as string))]
  const sinFuente = [...new Set(bloqueos.filter(faltante).map((x) => x.fila_id as string))].filter((id) => !porBloqueo.includes(id))
  const ids = [...sinFuente, ...porBloqueo]
  return {
    estado: ids.length ? 'filas_salen' : 'ok',
    filasQueSalen: ids,
    porBloqueo,
    ajustes: ids.map((id) => ({ semana: semanaDe(id), slot: slotDe(id), accion: 'omitir' as const, motivo: porBloqueo.includes(id) ? MOTIVO_DE_SALIDA.descartada_por_bloqueo : MOTIVO_DE_SALIDA.descartada_sin_fuente })),
    fichasPendientes: bloqueos.map((x) => x.ficha),
  }
}

/** 19-nov · grupo C · un bloqueo de CONJUNTO que quedó tras sacar las filas: pasa a AVISO con el hueco anotado (la tanda se cierra; la campaña no se detiene) */
export const NOTA_DEL_HUECO = 'quedó anotado tras la última ronda de corrección; la tanda se cierra igual'
export function bajarBloqueosDeConjuntoAAvisos(hs: Hallazgo[]): Hallazgo[] {
  return hs.map((x) => (x.severidad === 'bloquea' && !x.fila_id ? { ...x, severidad: 'aviso' as const, ficha: { ...x.ficha, gravedad: 'aviso' as const, que: `${x.ficha.que} (${NOTA_DEL_HUECO})` } } : x))
}
