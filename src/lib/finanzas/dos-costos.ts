/**
 * LOS DOS COSTOS POR VENTA (CC#3 · 19-oct · encargo de Lenovo, Parte B): el resumen para el dueño y el texto del cierre muestran SIEMPRE los dos.
 *   · solo pauta: lo que cuesta conseguir una venta con los anuncios (costo por resultado ÷ tasa de venta);
 *   · plan completo: el total mensual del plan (pauta + marca + producción) ÷ las ventas que SE AÑADEN al mes.
 * Quien lee solo el primero cree que el plan se paga cuando, con el segundo, puede no pagarse (en la corrida real del 19-oct: 14,63 contra 27,08).
 * Puro: las cifras salen del bloque que calculó el código, nunca de lo que escriba un modelo. El validador rechaza un texto que cite solo el optimista.
 */
import { SEMANAS_POR_MES } from './calculadora'
import type { Bloque } from './tipos'

export type EstadoDePago = 'se_paga' | 'no_se_paga' | 'solo_con_otra_meta' | 'sin_base'

export interface DosCostos {
  /** costo de una venta solo con la pauta de rendimiento (el número optimista) */
  solo_pauta: number
  /** costo de una venta con marca y producción: total mensual ÷ ventas añadidas al mes; null si no se añade ninguna venta */
  plan_completo: number | null
  /** lo que deja cada venta (ticket × margen × períodos − entrega); null sin ticket o margen */
  contribucion_por_venta: number | null
  /** lo que deja la primera venta (ticket × margen − entrega) si la entrada lo trae */
  deja_primera_venta: number | null
  /** ¿la contribución cubre el costo solo de pauta? */
  equilibrio_solo_pauta: EstadoDePago
  /** ¿la contribución cubre el costo del plan completo? (el equilibrio del bloque) */
  equilibrio_plan_completo: EstadoDePago
  /** con el plan completo: la meta semanal que sí lo pagaría, si existe */
  meta_sugerida_semana: number | null
}

const r2 = (x: number) => Math.round(x * 100) / 100
const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
/** coma decimal, sin separador de miles: el mismo texto en cualquier entorno (no depende de ICU) */
export const monto = (x: number) => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',')

export function dosCostos(b: Bloque, entrada?: { ticket?: number | null; margen?: number | null; costo_entrega?: number | null } | null): DosCostos {
  const incremental = b.cifras.meta_incremental_por_semana?.valor ?? b.cifras.meta_por_semana?.valor ?? null
  const ventasMes = finito(incremental) && incremental > 0 ? incremental * SEMANAS_POR_MES : 0
  const completo = ventasMes > 0 && finito(b.reparto?.total_mes) ? r2(b.reparto.total_mes / ventasMes) : null
  const contribucion = finito(b.equilibrio?.contribucion_por_venta) ? b.equilibrio.contribucion_por_venta : null
  const soloPauta = b.costo_por_venta
  const eq = b.equilibrio
  let planCompleto: EstadoDePago
  if (contribucion == null) planCompleto = 'sin_base'
  else if (eq.meta_de_equilibrio_semana === null) planCompleto = 'no_se_paga'
  else planCompleto = eq.cubre === true ? 'se_paga' : eq.cubre === false ? 'solo_con_otra_meta' : 'sin_base'
  const deja = entrada && finito(entrada.ticket) && finito(entrada.margen) ? r2(Math.max(0, entrada.ticket * entrada.margen - (finito(entrada.costo_entrega) ? entrada.costo_entrega : 0))) : null
  return {
    solo_pauta: soloPauta, plan_completo: completo, contribucion_por_venta: contribucion, deja_primera_venta: deja,
    equilibrio_solo_pauta: contribucion == null ? 'sin_base' : contribucion >= soloPauta ? 'se_paga' : 'no_se_paga',
    equilibrio_plan_completo: planCompleto,
    meta_sugerida_semana: planCompleto === 'solo_con_otra_meta' ? eq.meta_sugerida_semana : null,
  }
}

const FRASE_PAGO = (e: EstadoDePago, c: number | null, sugerida: number | null, motivoNoExiste: boolean): string => {
  const deja = c == null ? '' : ` (cada venta deja ${monto(c)})`
  switch (e) {
    case 'se_paga': return `con ese costo el equilibrio existe${deja}`
    case 'no_se_paga': return motivoNoExiste ? `el equilibrio no existe con estos supuestos${deja}: ni con una meta enorme la venta paga lo que cuesta venderla` : `no se paga${deja}`
    case 'solo_con_otra_meta': return `con la meta actual no se paga${deja}; solo se paga con una meta de ${sugerida} por semana`
    default: return 'sin ticket o margen no se puede decir si la venta se paga'
  }
}

/** las líneas para el dueño: SIEMPRE los dos costos y, para cada uno, si el equilibrio existe */
export function textoDosCostos(d: DosCostos, moneda?: string): string[] {
  const m = moneda ? ` ${moneda}` : ''
  const L = [`Costo por venta, solo pauta: ${monto(d.solo_pauta)}${m}; ${FRASE_PAGO(d.equilibrio_solo_pauta, d.contribucion_por_venta, null, false)}.`]
  if (d.plan_completo == null) L.push('Costo por venta con el plan completo (pauta, marca y producción): no se puede calcular porque el plan no añade ventas sobre la línea base.')
  else L.push(`Costo por venta con el plan completo (pauta, marca y producción): ${monto(d.plan_completo)}${m}; ${FRASE_PAGO(d.equilibrio_plan_completo, d.contribucion_por_venta, d.meta_sugerida_semana, true)}.`)
  if (d.deja_primera_venta != null) L.push(`La primera venta deja ${monto(d.deja_primera_venta)}${m}.`)
  return L
}

// ───────────────────────────────────────────────────────── el validador
const NUMERO = /\d+(?:[.,]\d+)?/g
const valoresDe = (t: string): number[] => (t.match(NUMERO) ?? []).map((s) => Number(s.replace(',', '.'))).filter(finito)
/** el jefe redondea (14,6 · 14,69): se acepta una cercanía de 1 % (mínimo 0,10) para decir que el texto cita ese costo */
const cita = (t: string, x: number) => valoresDe(t).some((v) => Math.abs(v - x) <= Math.max(0.1, Math.abs(x) * 0.01))

export interface ChequeoDeCostos { ok: boolean; errores: string[] }
/** FALLA si el texto cita el costo solo de pauta y no cita el del plan completo (el optimista suelto). Un texto sin ninguno de los dos no cita costos: pasa. */
export function validarTextoDeCostos(texto: string, d: DosCostos): ChequeoDeCostos {
  const errores: string[] = []
  if (d.plan_completo != null && cita(texto, d.solo_pauta) && !cita(texto, d.plan_completo)) {
    errores.push(`el texto cita solo el costo optimista (solo pauta ${monto(d.solo_pauta)}) y omite el del plan completo (${monto(d.plan_completo)})`)
  }
  return { ok: errores.length === 0, errores }
}
/** el resumen para el dueño EXIGE los dos: lo usa el código para comprobar que lo que arma lleva ambos */
export function contieneLosDosCostos(texto: string, d: DosCostos): boolean {
  return cita(texto, d.solo_pauta) && (d.plan_completo == null || cita(texto, d.plan_completo))
}
