/**
 * EL RESUMEN DEL BLOQUE PARA EL REDACTOR DEL PLAN (F4 · CC#1 · 14-oct): las líneas de texto llano que entran al pedido, en lenguaje de campaña.
 * Puro. Sin jerga interna (nada de nombres de campos ni de tablas): el redactor las escribe tal cual y el cliente las lee.
 */
import { UMBRAL_PARO, UMBRAL_RECORTE } from './calculadora'
import { dosCostos, textoDosCostos } from './dos-costos'
import type { Bloque, Veredicto } from './tipos'

const NOMBRE_VEREDICTO: Record<Veredicto, string> = { sigo: 'sigo', ajusto: 'ajusto', ajusto_recorte: 'ajusto y recorto el diario 20 %', paro: 'paro' }
const n = (x: number) => (Math.round(x * 100) / 100).toLocaleString('es-EC', { maximumFractionDigits: 2 })

export function resumenDelBloque(b: Bloque, o: { dias_activos_por_semana?: number; moneda?: string } = {}): { lineas: string[]; alertas: string[] } {
  const m = o.moneda ? ` ${o.moneda}` : ''
  const c = b.cifras
  const marca = (k: string) => (c[k]?.tipo === 'supuesto' ? ' (supuesto)' : c[k]?.tipo === 'sin_base' ? ' (sin base)' : '')
  const L: string[] = []
  L.push(`Meta: ${n(c.meta_por_semana.valor ?? 0)} ventas por semana. Con la tasa de ${n((c.tasa_resultado_a_venta.valor ?? 1) * 100)} % de resultado a venta hacen falta ${n(b.aprendizaje.resultados_por_semana)} resultados por semana${marca('tasa_resultado_a_venta')}.`)
  L.push(`Costo por resultado esperado al arrancar: ${n(b.costos.base)}${m} (de ${n(b.costos.cota_baja)} a ${n(b.costos.cota_alta)})${marca('costo_por_resultado_arranque')}; costo por venta: ${n(b.costo_por_venta)}${m}${marca('costo_por_venta')}.`)
  // los DOS costos por venta, siempre juntos (solo pauta y plan completo): quien lee uno solo cree que el plan se paga cuando puede no pagarse
  L.push(...textoDosCostos(dosCostos(b), o.moneda))
  L.push(b.techo.sin_valor_monetario
    ? `Techo por resultado: ${n(b.techo.por_resultado)}${m}, que es la referencia de mercado (el cliente no declaró valor por venta; se compara con el mercado)${marca('techo_por_resultado')}.`
    : `Techo por resultado: ${n(b.techo.por_resultado)}${m}${marca('techo_por_resultado')}; se sigue hasta el techo, se ajusta hasta ${n(b.techo.por_resultado * UMBRAL_PARO)}${m} (pasado ${n(b.techo.por_resultado * UMBRAL_RECORTE)}${m} por 7 días se recorta el diario 20 %) y se para por encima de ${n(b.techo.paro_desde)}${m} por 7 días.`)
  L.push(`Pauta de rendimiento: ${n(b.cifras.pauta_rendimiento_semana.valor ?? 0)}${m} por semana (${n(b.cifras.pauta_rendimiento_mes.valor ?? 0)}${m} al mes)${marca('pauta_rendimiento_semana')}; ${n(b.aprendizaje.diario)}${m} por día${o.dias_activos_por_semana ? ` sobre ${o.dias_activos_por_semana} días activos por semana` : ''}.`)
  L.push(`Conjuntos de anuncios que caben: ${b.aprendizaje.conjuntos} (mínimo ${n(b.aprendizaje.minimo_por_conjunto)}${m} por día por conjunto para que la plataforma aprenda).`)
  if (b.alterno) L.push(`Evento alterno «${b.alterno.nombre}»: costo ${n(b.alterno.costo)}${m}, mínimo ${n(b.alterno.minimo_por_conjunto)}${m} por día, caben ${b.alterno.conjuntos}.`)
  const otros = b.reparto.otros.filter((x) => x.monto > 0).map((x) => `${x.canal} ${n(x.monto)}${m}`).join(', ')
  L.push(`Reparto del mes (${n(b.reparto.total_mes)}${m} en total): Meta+Instagram ${n(b.reparto.meta_ig)}${m} (${n(b.reparto.parte_meta_ig * 100)} %, siempre al menos 60 %; incluye la marca), producción de contenido ${n(b.reparto.produccion.monto)}${m} (monto fijo dentro del presupuesto del cliente)${otros ? `, otros canales: ${otros}` : ''}${b.reparto.sumado_a_meta_ig > 0 ? `; ${n(b.reparto.sumado_a_meta_ig)}${m} que un canal no alcanza a usar se suman a Meta+Instagram` : ''}.`)
  const d = b.reparto.otros.filter((x) => !x.activo && x.motivo?.startsWith('diferido')).map((x) => `${x.canal} (${x.motivo})`)
  if (d.length) L.push(`Canales diferidos por el plan, con su condición de activación: ${d.join('; ')}.`)
  const v = b.veredictos
  L.push(`Con el costo esperado: ${NOMBRE_VEREDICTO[v.base]}. En lo más favorable: ${NOMBRE_VEREDICTO[v.cota_baja]}; en lo más desfavorable: ${NOMBRE_VEREDICTO[v.cota_alta]}. Si el costo sube o baja 30 %: ${NOMBRE_VEREDICTO[v.sens_mas]} / ${NOMBRE_VEREDICTO[v.sens_menos]}.`)
  L.push(`Nada se juzga antes de que se cumpla la última de estas condiciones: el día ${b.primera_lectura_dia}, 15 resultados medidos, o el ciclo de venta (salvo un fallo técnico). Revisión interna cada 7 días e informe al dueño cada 14.`)
  L.push(`Pausa técnica (fuera de esas reglas): 0 resultados después de gastar 3 veces el techo por resultado, o un destino que tarda más de 30 minutos en responder de forma sostenida. En esta fase solo queda escrito: no se ejecuta.`)
  L.push(b.confianza.texto)
  L.push(`Prueba inicial: entre ${n(b.calendario.prueba.diez)}${m} y ${n(b.calendario.prueba.veinte)}${m} (10 a 20 % de la pauta de rendimiento del horizonte, ${n(b.calendario.rendimiento_total)}${m}).`)
  const sem = b.calendario.por_semana.map((x, i) => `sem. ${i + 1}: ${n(x)}`).join(' · ')
  L.push(`Pauta de rendimiento por semana: ${sem}.`)
  return { lineas: L, alertas: b.alertas }
}

/**
 * Los montos que el bloque DECLARA de forma explícita y que no son una fila de `cifras` (hallazgo 1 de CC#1 · 15-oct): la pauta por semana, la prueba inicial, el piso por conjunto,
 * el reparto por canal y el evento alterno. El chequeo P8 del plan solo deja pasar una cifra que sea una firmada o uno de estos montos; una suma «que casualmente cuadra» ya no pasa.
 */
export function montosDeclarados(b: Bloque): number[] {
  const v: Array<number | null | undefined> = [
    ...b.calendario.por_semana,
    b.calendario.rendimiento_total, b.calendario.meta_ig_total, b.calendario.produccion_total, b.calendario.total,
    b.calendario.prueba.diez, b.calendario.prueba.quince, b.calendario.prueba.veinte,
    b.reparto.total_mes, b.reparto.meta_ig, b.reparto.marca, b.reparto.rendimiento, b.reparto.produccion.monto, b.reparto.sumado_a_meta_ig,
    ...b.reparto.otros.map((x) => x.monto),
    b.costos.cota_baja, b.costos.base, b.costos.cota_alta, b.costo_por_venta, dosCostos(b).plan_completo, dosCostos(b).contribucion_por_venta,
    b.techo.por_resultado, b.techo.ajusto_hasta, b.techo.recorte_desde, b.techo.paro_desde,
    b.aprendizaje.diario, b.aprendizaje.minimo_por_conjunto,
    ...(b.alterno ? [b.alterno.costo, b.alterno.minimo_por_conjunto] : []),
  ]
  const out: number[] = []
  for (const x of v) if (typeof x === 'number' && Number.isFinite(x) && x > 0 && !out.some((y) => Math.abs(y - x) < 1e-9)) out.push(Math.round(x * 100) / 100)
  return out
}
