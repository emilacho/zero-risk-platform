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
 * 21-nov · opción A (GO de Lenovo 02:47Z, punto 5 · hallazgo de CC7 02:05Z): EL TOPE DE UNA LLAMADA CUBRE UN TURNO AL TECHO DE SALIDA.
 * El SDK solo corta por dinero ENTRE turnos: un turno solo de hasta 128K de salida (`9463abb`) se cobra entero aunque pase el tope. Con un tope menor,
 * la cuenta del intento caído (`costoEfectivo` = el tope) se queda corta. Regla firmada: el tope cubre el peor caso; un tope no es gasto.
 * Peor caso de un turno en el modelo de la cadena (Opus 5.5, US$ 4 / US$ 20 por millón): 128K de salida + 100K de entrada = US$ 2,96 → tope US$ 3.
 * (Si `cadena_config.modelo_cadena` pone un modelo más caro, este tope se revisa: lo ata la prueba `topes-por-el-corredor.test.ts`.)
 * Nació temporal en #1260 (Lenovo 02:16Z) para estrategia, calendario y fechas; con la opción A deja de ser temporal: es el tope de un turno al techo.
 * Sube el piso de la bolsa de planificación (12 × 3 = US$ 36): aceptado por Lenovo.
 * Las fichas también (decisión de Lenovo 03:37Z, opción a): US$ 3, y su bolsa propia sube a 3 intentos × 3 = US$ 9 (constante + DEFAULT, migración 202611210400).
 */
export const PRECIO_DEL_MODELO_DE_LA_CADENA_USD_POR_MILLON = { entrada: 4, salida: 20 } as const
export const TECHO_DE_SALIDA_TOKENS = 128_000
export const ENTRADA_DEL_PEOR_CASO_TOKENS = 100_000
export const COSTO_DE_UN_TURNO_AL_TECHO_USD =
  (TECHO_DE_SALIDA_TOKENS * PRECIO_DEL_MODELO_DE_LA_CADENA_USD_POR_MILLON.salida + ENTRADA_DEL_PEOR_CASO_TOKENS * PRECIO_DEL_MODELO_DE_LA_CADENA_USD_POR_MILLON.entrada) / 1_000_000
export const TOPE_DE_UN_TURNO_AL_TECHO_USD = 3
/**
 * 23-nov · firma de Emilio 20:35 Zúrich («subelo a 10») · GO de Lenovo 19:37Z: el calendario, las fechas especiales y las fichas pasan a US$ 10 por llamada
 * (eran los US$ 3 de un turno al techo). La estrategia queda en 3. Lo que este tope arrastra sube con él: la bolsa del lector (3 intentos × 10 = 30, con su
 * DEFAULT en la migración 202611232000) y el piso de la bolsa de planificación (12 vueltas × 10), que crece sola hasta el tope de gasto de la campaña.
 */
export const TOPE_DE_CALENDARIO_FECHAS_Y_FICHAS_USD = 10
export const TOPE_POR_PASO_USD: Readonly<Partial<Record<Paso, number>>> = {
  estrategia: TOPE_DE_UN_TURNO_AL_TECHO_USD,
  calendario: TOPE_DE_CALENDARIO_FECHAS_Y_FICHAS_USD,
  fechas: TOPE_DE_CALENDARIO_FECHAS_Y_FICHAS_USD,
  fichas: TOPE_DE_CALENDARIO_FECHAS_Y_FICHAS_USD,
}
export const topeDelPaso = (p: Paso): number => TOPE_POR_PASO_USD[p] ?? Math.max(1, Math.round(2 * ESPERADO_USD[p] * 100) / 100)

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
 * 21-nov · opción A (GO de Lenovo 02:47Z): los 4 pasos largos (estrategia, calendario, fechas especiales y fichas) ya NO esperan al agente en la misma llamada:
 * la vuelta la entrega el corredor (Railway, sin el techo de 800 s de Vercel) a la espera del sub-flujo. Se deshace lo temporal de #1260: todos vuelven a `maximo`.
 * El brief ya iba por el corredor. Queda la función por paso para que un cambio futuro se decida y se anote en un solo lugar.
 */
export const PASOS_POR_EL_CORREDOR: readonly Paso[] = ['estrategia', 'calendario', 'fechas', 'fichas']
/** el razonamiento que pide cada paso: hoy todos el de siempre (`maximo`, firma de Emilio «nada se recorta») */
export const razonamientoDelPaso = (_paso: Paso): string => RAZONAMIENTO_POR_DEFECTO
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
  // 23-nov · opción (c), firma de Emilio (Lenovo 19:50Z): la bolsa con que NACE la campaña (y el mínimo para crearla) cuenta el peor caso de la estrategia
  // (12 × 3 = 36), no el del calendario a 10. Lo que el calendario necesita para aguantar sus 12 caídas lo da `techoDeLaBolsaDePlanificacion`, al crecer.
  const peorCaida = TOPE_DE_VUELTAS_DEL_SUBFLUJO * topeDelPaso('estrategia')
  return Math.ceil(Math.max(MULTIPLO_DE_LA_BOLSA * medida, peorCaida, PRESUPUESTO_PLANIFICACION_POR_OMISION) * 100) / 100
}
/**
 * 23-nov · opción (c), firma de Emilio (Lenovo 19:50Z): hasta dónde CRECE la bolsa de planificación durante la campaña (`bolsaAgrandada`, nunca más que el tope
 * de gasto de la campaña): la del nacimiento, o el peor caso del paso de planificación más caro con todas sus vueltas caídas (12 × 10 = 120), lo que sea mayor.
 * Así ninguna llamada de calendario o fechas (US$ 10) se queda sin lugar antes de las 12 caídas, y crear una campaña no cuesta más que antes.
 */
export function techoDeLaBolsaDePlanificacion(totalTandas: number): number {
  const masCaro = Math.max(...PASOS.filter((p) => !PASOS_CON_PRESUPUESTO_PROPIO.has(p)).map(topeDelPaso))
  return Math.max(bolsaDePlanificacion(totalTandas), Math.ceil(TOPE_DE_VUELTAS_DEL_SUBFLUJO * masCaro * 100) / 100)
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
/** el presupuesto del lector cuando la campaña no trae el suyo: los 3 intentos × el tope de una llamada de fichas (US$ 10) = US$ 30 · igual al DEFAULT de la columna
 *  (23-nov · firma de Emilio «subelo a 10», migración 202611232000; antes 9 = 3 × 3, y antes 2) */
export const PRESUPUESTO_LECTOR_POR_OMISION = 30
/** el presupuesto de planificación con el que nace una campaña (`campanas.ts` · abrir, y el DEFAULT de la columna) */
export const PRESUPUESTO_PLANIFICACION_POR_OMISION = 6
/** 18-nov · firma de Emilio (DECISION-EMILIO-topes-con-margen-triple): todo tope de gasto = el triple de lo medido */
export const MULTIPLO_DE_LA_BOLSA = 3
export async function modeloDeLaCadena(al: Almacen): Promise<string> {
  const v = await al.leerConfig('modelo_cadena')
  return modeloPorCorridaValido(v) ? v : MODELO_POR_DEFECTO
}
/**
 * El plazo de la CORRIDA de los pasos que van por el corredor no puede ser menor que la espera de su vuelta: si lo fuera, el vigía daría la corrida por vencida
 * y lanzaría OTRO agente con el primero vivo (lo de `2fd5f619`: 3 corridas de 5:46 con el plazo vivo en 6 min · CC6 02:32Z).
 * 21-nov · opción A: la espera es el Wait por webhook del sub-flujo (3 600 s, la misma del brief y del productor); plazo = espera + 2 min de margen = 62 min.
 * La config (`plazo_llamada_agente_minutos`) sigue mandando si es mayor, y para los demás pasos. (#1260 tenía 800 s / 14 min: la espera de la misma llamada.)
 */
export const ESPERA_DE_LA_VUELTA_S = 3600
/** la espera del nodo HTTP de los 4 sub-flujos (#1260: 800 s, el tope de Vercel). Con la opción A ese nodo solo recibe el acuse; la usa `fichas-espera-800.test.ts` */
export const ESPERA_DE_LA_MISMA_LLAMADA_S = 800
export const PLAZO_MINIMO_POR_EL_CORREDOR_MIN = Math.ceil(ESPERA_DE_LA_VUELTA_S / 60) + 2
export const plazoMinimoDelPaso = (paso: Paso): number => (PASOS_POR_EL_CORREDOR.includes(paso) ? PLAZO_MINIMO_POR_EL_CORREDOR_MIN : 0)
export async function plazoDeLlamadaMinutos(al: Almacen): Promise<number> {
  const v = await al.leerConfig('plazo_llamada_agente_minutos')
  return typeof v === 'number' && v > 0 ? v : PLAZO_DE_LLAMADA_POR_DEFECTO_MIN
}
