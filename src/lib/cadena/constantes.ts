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
/**
 * 21-nov · ⚠️ MEDIDA TEMPORAL (decisión de Lenovo 02:16Z, modo jefe · regla firmada: el tope cubre el peor caso; un tope no es gasto) · el tope por llamada de los
 * 4 pasos que esperan en la misma llamada y bajan a `high` (ver RAZONAMIENTO_TEMPORAL_POR_PASO). Con el techo de salida de 128K (`9463abb`), el peor caso de una
 * llamada es ~US$ 2,7 (cota de CC3, 21-nov 01:5xZ): US$ 3 lo cubre. Estrategia US$ 3 lo fijó Lenovo; calendario y fechas, el mismo peor caso.
 * Las fichas NO entran aquí (siguen con US$ 1, 1,5 × lo medido 0,664 en `maximo`; en `high` gastan menos): gastan de su bolsa PROPIA (`presupuesto_lector_usd`, US$ 2 por
 * omisión) y un intento caído cuenta el tope entero (`costoEfectivo`). Con US$ 1 caben 2 intentos; con US$ 2 cabría UNO solo y un fallo las dejaría sin fichas.
 * Subirlo a 2-3 × lo medido pide subir antes esa bolsa (escritura certificada + el valor por omisión): avisado a Lenovo.
 * Sube el piso de la bolsa de planificación (12 × 3 = US$ 36): aceptado por Lenovo. Se QUITA con el arreglo de fondo, igual que el razonamiento temporal.
 */
export const TOPE_TEMPORAL_POR_PASO_USD: Readonly<Partial<Record<Paso, number>>> = { estrategia: 3, calendario: 3, fechas: 3 }
export const topeDelPaso = (p: Paso): number => TOPE_TEMPORAL_POR_PASO_USD[p] ?? Math.max(1, Math.round(2 * ESPERADO_USD[p] * 100) / 100)

export const AGENTE_POR_PASO: Record<Paso, string> = {
  estrategia: 'social-media-strategist',
  calendario: 'social-media-strategist',
  fechas: 'social-media-strategist',
  brief: 'campaign-brief-agent',
  // el lector de la ficha (el ejecutivo de cuentas de *Launch!*): el mismo agente de la planificación; lo que cambia es su tarea
  fichas: 'social-media-strategist',
}

export const MODELO_POR_DEFECTO = 'claude-opus-5-5'
/** 18-nov · firma de Emilio «nada se recorta» + respuesta 5 de Lenovo (G1 del barrido de topes · CC5): el razonamiento de la cadena va al MÁXIMO del modelo
 *  (`maximo` ⇒ el corredor manda `max` en Opus 5.5). Antes era `low` (experimento del 30-sep por el techo de 32.000 tokens, que G1 sube a 128.000). */
export const RAZONAMIENTO_POR_DEFECTO = 'maximo'
/**
 * 21-nov · ⚠️ MEDIDA TEMPORAL (decisión de Lenovo 01:58Z, modo jefe mientras Emilio duerme · frente a su firma «nada se recorta»):
 * los pasos de la cadena que con `maximo` NO caben en la ventana de la llamada bajan al nivel más alto que sí cabe.
 * Por qué: la estrategia al máximo pasó de 13:20 (504 en el tope de Vercel, campaña `2fd5f619`, 21-nov 01:32Z) y n8n corta a los ~5:46 sin bytes.
 * Se mide paso por paso con una llamada real; el que no figura aquí sigue en `maximo`.
 * Se QUITA cuando exista el arreglo de fondo (los pasos largos sin el techo de 800 s · mapa de CC4, GO aparte): entonces todo vuelve a `maximo`.
 * 21-nov 02:16Z · Lenovo: los 4 pasos que esperan al agente en la MISMA llamada (estrategia, calendario, fechas especiales y fichas) van a `high`; el brief no
 * (su vuelta la entrega el corredor, sin techo de 800 s), así que sigue en `maximo`.
 */
export const RAZONAMIENTO_TEMPORAL_POR_PASO: Readonly<Partial<Record<Paso, 'high' | 'medium' | 'low'>>> = { estrategia: 'high', calendario: 'high', fechas: 'high', fichas: 'high' }
/** el razonamiento que pide cada paso: el temporal si lo tiene; si no, el de siempre (`maximo`) */
export const razonamientoDelPaso = (paso: Paso): string => RAZONAMIENTO_TEMPORAL_POR_PASO[paso] ?? RAZONAMIENTO_POR_DEFECTO
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
/** 19-nov · grupo C: rondas de corrección por paso (hoy era UNA; el triple, firma de Emilio). Tras la última: la tanda saca la fila bloqueada; la estrategia deja vigente su mejor versión. */
export const RONDAS_DE_CORRECCION = 3
/**
 * El tope de vueltas de los sub-flujos de n8n (`cadena-estrategia` y `cadena-calendario`, nodo «④ ¿Y ahora?»): el peor caso legítimo es (1 pasada + las rondas) × los intentos de cada una.
 * Una prueba lo ata al `vuelta >= N` de los dos JSON: si alguien sube las rondas sin subir el tope, vuelve el error en vez de la salida (CC1, 19-nov).
 */
export const TOPE_DE_VUELTAS_DEL_SUBFLUJO = (1 + RONDAS_DE_CORRECCION) * MAXIMO_DE_INTENTOS

/**
 * 19-nov · LO MEDIDO por llamada de planificación (US$): el máximo real de `cadena_corridas` (estado ok, no seco), leído el 19-nov 05:05Z.
 * Estrategia 0,7712 (3 llamadas) · calendario 0,7261 (8 llamadas). Las caídas no tienen medida propia: el libro no distingue un costo 0 real de un corte, y cuentan su tope.
 */
export const MEDIDO_POR_LLAMADA_USD = { estrategia: 0.7712, calendario: 0.7261 } as const
/**
 * 19-nov · DECISIÓN de Lenovo (05:00Z) · grupo C1: la bolsa de planificación de una campaña ya no es un 6 fijo. Es 3 × lo medido de una planificación completa
 * con sus rondas (la estrategia y cada tanda, cada una con 1 pasada + RONDAS_DE_CORRECCION), y nunca menos que el peor caso de un paso con todas sus vueltas caídas
 * (TOPE_DE_VUELTAS_DEL_SUBFLUJO llamadas, cada una contada a su tope). Sale de las mismas constantes que el tope de vueltas: si suben las rondas, sube la bolsa.
 * Es un techo, no gasto. Reemplaza la del grupo A (#1180: 3 × (1,42 + 1,24 × tandas)), que no contaba las rondas. Nunca menos que los US$ 6 de siempre.
 */
export function bolsaDePlanificacion(totalTandas: number): number {
  const tandas = Number.isFinite(totalTandas) && totalTandas > 0 ? totalTandas : 0
  const pasadas = 1 + RONDAS_DE_CORRECCION
  const medida = pasadas * (MEDIDO_POR_LLAMADA_USD.estrategia + tandas * MEDIDO_POR_LLAMADA_USD.calendario)
  const peorCaida = TOPE_DE_VUELTAS_DEL_SUBFLUJO * Math.max(topeDelPaso('estrategia'), topeDelPaso('calendario'))
  return Math.ceil(Math.max(MULTIPLO_DE_LA_BOLSA * medida, peorCaida, PRESUPUESTO_PLANIFICACION_POR_OMISION) * 100) / 100
}
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
export async function modeloDeLaCadena(al: Almacen): Promise<string> {
  const v = await al.leerConfig('modelo_cadena')
  return modeloPorCorridaValido(v) ? v : MODELO_POR_DEFECTO
}
/**
 * 21-nov · #1260 (pedido de CC6 02:32Z) · ⚠️ MEDIDA TEMPORAL, va y se quita junto con RAZONAMIENTO_TEMPORAL_POR_PASO · el plazo de la CORRIDA de los pasos que esperan al
 * agente en la misma llamada no puede ser menor que esa espera (800 s en n8n y en Vercel = 13:20): si lo fuera, el vigía daría la corrida por vencida y lanzaría OTRO agente
 * con el primero vivo (lo de `2fd5f619`: 3 corridas de 5:46 con el plazo vivo en 6 min). Piso de 14 min para esos pasos; la config (`plazo_llamada_agente_minutos`) sigue
 * mandando si es mayor, y para los demás pasos.
 */
export const ESPERA_DE_LA_MISMA_LLAMADA_S = 800
export const PLAZO_MINIMO_DE_LA_MISMA_LLAMADA_MIN = 14
export const plazoMinimoDelPaso = (paso: Paso): number => (paso in RAZONAMIENTO_TEMPORAL_POR_PASO ? PLAZO_MINIMO_DE_LA_MISMA_LLAMADA_MIN : 0)
export async function plazoDeLlamadaMinutos(al: Almacen): Promise<number> {
  const v = await al.leerConfig('plazo_llamada_agente_minutos')
  return typeof v === 'number' && v > 0 ? v : PLAZO_DE_LLAMADA_POR_DEFECTO_MIN
}
