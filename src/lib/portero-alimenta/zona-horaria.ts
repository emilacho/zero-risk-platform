/**
 * LA HORA LOCAL DEL CLIENTE · PURO · agnóstico. El mes, el día y la hora de cada venta se leen en la hora del CLIENTE, no en la de un país fijo.
 * Orden: `config.timezone` (o `zona_horaria`) → la zona de su país si el país tiene UNA sola → sin dato (UTC, y se declara; nunca se adivina el país).
 */
import { zonaDelPais } from '../pais/pais-del-cliente'

export interface DesfaseDelCliente { horas: number; zona: string | null; origen: 'ficha' | 'pais' | 'sin_dato' }

/** horas de UTC de una hora local en esa zona en ese instante (fracciones para zonas de media hora); `null` si la zona no existe */
export function desfaseDeZona(zona: string, instante: Date): number | null {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(instante)
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value)
    const local = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'))
    const base = Math.floor(instante.getTime() / 1000) * 1000
    return Math.round(((local - base) / 3_600_000) * 100) / 100
  } catch { return null }
}

export function desfaseDelCliente(cliente: Record<string, unknown> | null | undefined, ahora: Date): DesfaseDelCliente {
  const cfg = (cliente?.config && typeof cliente.config === 'object' ? cliente.config : {}) as Record<string, unknown>
  const declarada = [cfg.timezone, cfg.zona_horaria].find((z): z is string => typeof z === 'string' && z.trim() !== '')
  if (declarada) { const h = desfaseDeZona(declarada.trim(), ahora); if (h !== null) return { horas: h, zona: declarada.trim(), origen: 'ficha' } }
  const delPais = zonaDelPais(cliente?.country ?? cliente?.pais)
  if (delPais) { const h = desfaseDeZona(delPais, ahora); if (h !== null) return { horas: h, zona: delPais, origen: 'pais' } }
  return { horas: 0, zona: null, origen: 'sin_dato' }
}
