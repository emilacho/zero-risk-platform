/**
 * LÍNEA BASE DE VENTAS · lo que el negocio YA logra por semana sin la pauta (CC#1 · 16-oct). Código puro, sin red.
 * La pauta solo puede comprar los resultados que SE AÑADEN a esa base: la calculadora dimensiona la pauta para `meta − base`, no para la meta total.
 *
 * Fuente (en este orden; nunca se inventa):
 *  1. `semilla.linea_base_por_semana` · un dato dado por el dueño o por quien abre la conversación (gana si es un número > 0);
 *  2. los datos MEDIDOS de resultados finales (la métrica `tickets` del punto de venta) con su periodo: se toma la ventana más larga (≥ 14 días), valor × 7 ÷ días.
 * Sin ninguna de las dos → `null` y la calculadora lo DICE (pauta para la meta total, sin base).
 */
import type { DatoConProcedencia } from './conversa/esquemas'

export interface LineaBase { por_semana: number; fuente: string }

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const MS_DIA = 86_400_000
const MIN_DIAS = 14

/** días del periodo (ambos extremos incluidos) o null si las fechas no son válidas */
function diasDe(p: DatoConProcedencia['periodo']): number | null {
  if (!p?.desde || !p?.hasta) return null
  const d = Date.parse(`${p.desde}T00:00:00Z`), h = Date.parse(`${p.hasta}T00:00:00Z`)
  if (!finito(d) || !finito(h) || h < d) return null
  return Math.round((h - d) / MS_DIA) + 1
}

/** ¿es la cuenta de resultados finales (tickets) de un punto de venta? la clave es `metrica:<fuente>:<métrica>:<periodo>` */
const esConteoDeResultados = (d: DatoConProcedencia) => d.tipo_id === 'tickets_mes' || /^metrica:[^:]+:tickets:/.test(d.clave)

export function lineaBaseSemanal(p: { datos?: DatoConProcedencia[] | null; dada?: unknown }): LineaBase | null {
  if (finito(p.dada) && p.dada > 0) return { por_semana: Math.round(p.dada * 100) / 100, fuente: 'dato dado al abrir la conversación (línea base por semana)' }
  let mejor: { dias: number; hasta: string; d: DatoConProcedencia } | null = null
  for (const d of p.datos ?? []) {
    if (!esConteoDeResultados(d)) continue
    if (d.procedencia !== 'medido' && d.procedencia !== 'cerebro') continue
    if (d.estado !== undefined && d.estado !== 'trajo') continue
    if (d.identidad !== undefined && d.identidad !== 'coincide') continue
    if (!finito(d.valor) || d.valor <= 0) continue
    const dias = diasDe(d.periodo)
    if (dias === null || dias < MIN_DIAS) continue
    if (!mejor || dias > mejor.dias || (dias === mejor.dias && String(d.periodo?.hasta) > mejor.hasta)) mejor = { dias, hasta: String(d.periodo?.hasta), d }
  }
  if (!mejor) return null
  const por_semana = Math.round(((mejor.d.valor as number) * 7 / mejor.dias) * 100) / 100
  return { por_semana, fuente: `${mejor.d.fuente} · ${mejor.d.valor} en ${mejor.dias} días (${mejor.d.periodo?.desde} a ${mejor.d.periodo?.hasta})` }
}
