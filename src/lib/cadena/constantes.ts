/**
 * Constantes de la cadena. Nada de esto sabe de un cliente. Lo que se puede ajustar sin publicar vive en `cadena_config` / `cadena_plazos`.
 */
import { modeloPorCorridaValido } from '@/lib/modelo-por-corrida'
import type { Almacen } from './almacen'

export type Paso = 'estrategia' | 'calendario' | 'fechas' | 'brief'
export const PASOS: readonly Paso[] = ['estrategia', 'calendario', 'fechas', 'brief']

/** costo esperado por llamada (US$, estimación del diseño §12, no medida) · el tope de la corrida = 2 × esperado, mínimo 1,00 */
const ESPERADO_USD: Record<Paso, number> = { estrategia: 0.45, calendario: 0.4, fechas: 0.3, brief: 0.25 }
export const topeDelPaso = (p: Paso): number => Math.max(1, Math.round(2 * ESPERADO_USD[p] * 100) / 100)

export const AGENTE_POR_PASO: Record<Paso, string> = {
  estrategia: 'social-media-strategist',
  calendario: 'social-media-strategist',
  fechas: 'social-media-strategist',
  brief: 'campaign-brief-agent',
}

export const MODELO_POR_DEFECTO = 'claude-opus-5-5'
export const RAZONAMIENTO_POR_DEFECTO = 'low'
export const DIAS_DE_CAMPANA = 90
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
  const totalSemanas = Math.ceil(dias / 7)
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
export const PASOS_SIN_REVISION: readonly Paso[] = ['estrategia', 'calendario', 'fechas']

export async function modeloDeLaCadena(al: Almacen): Promise<string> {
  const v = await al.leerConfig('modelo_cadena')
  return modeloPorCorridaValido(v) ? v : MODELO_POR_DEFECTO
}
export async function plazoDeLlamadaMinutos(al: Almacen): Promise<number> {
  const v = await al.leerConfig('plazo_llamada_agente_minutos')
  return typeof v === 'number' && v > 0 ? v : PLAZO_DE_LLAMADA_POR_DEFECTO_MIN
}
