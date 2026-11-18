/**
 * Constantes de la cadena. Nada de esto sabe de un cliente. Lo que se puede ajustar sin publicar vive en `cadena_config` / `cadena_plazos`.
 */
import { modeloPorCorridaValido } from '@/lib/modelo-por-corrida'
import type { Almacen } from './almacen'
import { diasEntre, esFechaIso, lunesDe } from './fechas'

// 17-nov · Sprint 4 · A entrega 2: `fichas` · el lector de las fichas de hechos por oferta (una vez por campaña · no es reja)
export type Paso = 'estrategia' | 'calendario' | 'fechas' | 'brief' | 'fichas'
export const PASOS: readonly Paso[] = ['estrategia', 'calendario', 'fechas', 'brief', 'fichas']

/** costo esperado por llamada (US$, estimación del diseño §12, no medida) · el tope de la corrida = 2 × esperado, mínimo 1,00 */
const ESPERADO_USD: Record<Paso, number> = { estrategia: 0.45, calendario: 0.4, fechas: 0.3, brief: 0.25, fichas: 0.5 }
export const topeDelPaso = (p: Paso): number => Math.max(1, Math.round(2 * ESPERADO_USD[p] * 100) / 100)

export const AGENTE_POR_PASO: Record<Paso, string> = {
  estrategia: 'social-media-strategist',
  calendario: 'social-media-strategist',
  fechas: 'social-media-strategist',
  brief: 'campaign-brief-agent',
  // el lector de la ficha (el ejecutivo de cuentas de *Launch!*): el mismo agente de la planificación; lo que cambia es su tarea
  fichas: 'social-media-strategist',
}

export const MODELO_POR_DEFECTO = 'claude-opus-5-5'
export const RAZONAMIENTO_POR_DEFECTO = 'low'
export const DIAS_DE_CAMPANA = 90
/** techo de cordura de la duración que se pida: un año. No es un límite creativo: ataja un entero enorme */
export const DIAS_MAXIMOS_DE_CAMPANA = 366
export const SEMANAS_DE_TANDA = 4
export const TOTAL_SEMANAS = Math.ceil(DIAS_DE_CAMPANA / 7)
export const TOTAL_DE_TANDAS = Math.ceil(TOTAL_SEMANAS / SEMANAS_DE_TANDA)
export interface MedidaDeCampana { dias: number; semanasPorTanda: number; totalSemanas: number; totalTandas: number }
/**
 * 01-nov · firma de Emilio: la duración y el tamaño de la tanda son de cada campaña; 90 días y 4 semanas son solo el valor por omisión.
 * Los días salen de sus propias fechas y la tanda de su columna. Lo que falte o no se pueda leer vale lo de siempre.
 */
export function medidaDeCampana(c?: { fecha_inicio?: string | null; fecha_fin?: string | null; semanas_de_tanda?: number | null }): MedidaDeCampana {
  const desde = Date.parse(`${c?.fecha_inicio ?? ''}T00:00:00Z`), hasta = Date.parse(`${c?.fecha_fin ?? ''}T00:00:00Z`)
  const leidos = Math.round((hasta - desde) / 86400000) + 1
  const dias = Number.isInteger(leidos) && leidos > 0 ? leidos : DIAS_DE_CAMPANA
  const semanasPorTanda = Number.isInteger(c?.semanas_de_tanda) && (c?.semanas_de_tanda as number) > 0 ? (c?.semanas_de_tanda as number) : SEMANAS_DE_TANDA
  // 09-nov · corrección 2 de CC7 a #949: las semanas se cuentan como `fechaDeFila`, desde el LUNES de la semana del día 1 hasta el último día.
  // Con inicio en lunes da lo mismo que ceil(dias/7). Con la ventana de un plan que empieza otro día (viernes → jueves, 84 días) son 13, no 12: la última semana no se pierde.
  const conFechas = Number.isInteger(leidos) && leidos > 0 && esFechaIso(c?.fecha_inicio) && esFechaIso(c?.fecha_fin)
  const totalSemanas = conFechas ? Math.floor(diasEntre(lunesDe(c!.fecha_inicio as string), c!.fecha_fin as string) / 7) + 1 : Math.ceil(dias / 7)
  return { dias, semanasPorTanda, totalSemanas, totalTandas: Math.ceil(totalSemanas / semanasPorTanda) }
}
/** semanas con fecha desde el día 1 (el panorama): se arma por código, sin modelo */
export const SEMANAS_DE_PANORAMA = 12
export const MAXIMO_DE_INTENTOS = 3
/**
 * Plazo de una llamada a un agente. 🔴 #464 C4 (CC#3): el nodo HTTP de los flujos espera 290 s; con un plazo de 15 min una llamada perdida dejaba la corrida «en curso» 15 min
 * (y el resultado se perdía). El plazo alcanza al nodo + margen: 6 min. Los flujos además cierran la corrida como fallida AL INSTANTE si el nodo falla (ver el flujo de #466).
 */
export const PLAZO_DE_LLAMADA_POR_DEFECTO_MIN = 6
export const CABECERA_SALTAR_EDITOR = 'x-skip-editor-middleware'

/** pasos que saltan la revisión del editor por diseño (§8): estructura interna, no texto que se publica */
export const PASOS_SIN_REVISION: readonly Paso[] = ['estrategia', 'calendario', 'fechas', 'fichas']
/** RESPUESTA-LENOVO a CC3 (17-nov, opción b) · los pasos que gastan de su PROPIA bolsa (no de la de planificación) */
export const PASOS_CON_PRESUPUESTO_PROPIO: ReadonlySet<Paso> = new Set<Paso>(['fichas'])
/** el presupuesto del lector cuando la campaña no trae el suyo (US$ 2: hasta 3 intentos de ~0,5, o 2 si fallan sin costo registrado) */
export const PRESUPUESTO_LECTOR_POR_OMISION = 2
/** el presupuesto de planificación con el que nace una campaña (`campanas.ts` · abrir, y el DEFAULT de la columna) */
export const PRESUPUESTO_PLANIFICACION_POR_OMISION = 6
/** 18-nov · firma de Emilio (DECISION-EMILIO-topes-con-margen-triple): todo tope de gasto = el triple de lo medido */
export const MULTIPLO_DE_LA_BOLSA = 3
/**
 * 18-nov · lo MEDIDO (SELECT de `cadena_corridas`, 18-nov ~14:50Z, solo lectura): la campaña de Náufrago `36e66179` gastó US$ 5,14 en planificar la estrategia
 * (0,77 + su corrección 0,65) y 3 tandas de calendario con su corrección cada una (0,73 + 0,63 · 0,55 + 0,59 · 0,54 + 0,68), que cubren 12 semanas (3 × 4):
 * 5,14 / 12 = 0,43 por semana de campaña (la corrección de cada paso va adentro).
 */
export const COSTO_DE_PLANIFICACION_POR_SEMANA_USD = 0.43
/**
 * La bolsa de planificación de una campaña: lo medido por semana × sus semanas × 3, nunca menos que la de siempre. 12 semanas → US$ 15,48; 13 → 16,77.
 * (Una campaña corta no baja de 6: la estrategia es un costo fijo que la cuenta por semana no ve.)
 */
export function bolsaDePlanificacion(totalSemanas: number): number {
  const n = Number.isFinite(totalSemanas) && totalSemanas > 0 ? totalSemanas : 0
  return Math.max(PRESUPUESTO_PLANIFICACION_POR_OMISION, Math.round(COSTO_DE_PLANIFICACION_POR_SEMANA_USD * n * MULTIPLO_DE_LA_BOLSA * 100) / 100)
}

export async function modeloDeLaCadena(al: Almacen): Promise<string> {
  const v = await al.leerConfig('modelo_cadena')
  return modeloPorCorridaValido(v) ? v : MODELO_POR_DEFECTO
}
export async function plazoDeLlamadaMinutos(al: Almacen): Promise<number> {
  const v = await al.leerConfig('plazo_llamada_agente_minutos')
  return typeof v === 'number' && v > 0 ? v : PLAZO_DE_LLAMADA_POR_DEFECTO_MIN
}
