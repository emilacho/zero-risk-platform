/**
 * TOPES DEL DIARIO · el corte vive EN EL CÓDIGO de las rutas, no solo en el flujo (C4 de CC#3). D-4 firmada por Emilio: US$ 1,00 por cliente y día para TODO el diario.
 * Los topes propios del flujo de hoy (US$ 0,30 por cliente y día, 6 corridas) siguen dentro de este techo. PURO.
 */
export const TOPE_DIARIO_POR_CLIENTE_USD = 1.0
export const TOPE_DE_RESENAS_POR_CORRIDA = 100
export const MAX_CORRIDAS_DE_RESENAS_POR_DIA = 1
export const MAX_COMENTARIOS_POR_CORRIDA = 50
export const MAX_CORRIDAS_DE_AMPLIACION_POR_DIA = 4

export interface DecisionDeGasto { permitido: boolean; restante_usd: number; motivo: string | null }
const r6 = (n: number) => Math.round(n * 1e6) / 1e6

/** ¿cabe una acción de costo MÁXIMO `costoMaximo` sabiendo lo gastado hoy? */
export function decidirGasto(gastadoHoyUsd: number, costoMaximo: number, tope = TOPE_DIARIO_POR_CLIENTE_USD): DecisionDeGasto {
  const restante = r6(Math.max(0, tope - Math.max(0, gastadoHoyUsd)))
  if (!Number.isFinite(gastadoHoyUsd) || !Number.isFinite(costoMaximo) || costoMaximo < 0) return { permitido: false, restante_usd: restante, motivo: 'gasto_no_medible' }
  if (r6(gastadoHoyUsd + costoMaximo) > tope) return { permitido: false, restante_usd: restante, motivo: `no cabe en el tope del día (US$ ${gastadoHoyUsd.toFixed(4)} + ${costoMaximo.toFixed(4)} > ${tope.toFixed(2)})` }
  return { permitido: true, restante_usd: restante, motivo: null }
}

/** deja pasar las acciones en orden mientras quepan; las que no caben se devuelven con su motivo (nunca se recortan en silencio) */
export function recortarAlTope<T extends { usd_max: number }>(acciones: T[], gastadoHoyUsd: number, tope = TOPE_DIARIO_POR_CLIENTE_USD): { hacer: T[]; omitidas: Array<{ accion: T; por_que: string }> } {
  const hacer: T[] = []
  const omitidas: Array<{ accion: T; por_que: string }> = []
  let acumulado = gastadoHoyUsd
  for (const a of acciones) {
    const d = decidirGasto(acumulado, a.usd_max, tope)
    if (d.permitido && hacer.length < MAX_CORRIDAS_DE_AMPLIACION_POR_DIA) { hacer.push(a); acumulado = r6(acumulado + a.usd_max) } else omitidas.push({ accion: a, por_que: d.permitido ? `tope de ${MAX_CORRIDAS_DE_AMPLIACION_POR_DIA} corridas de ampliación por día` : String(d.motivo) })
  }
  return { hacer, omitidas }
}
