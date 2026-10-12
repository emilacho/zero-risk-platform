/**
 * ZONA HORARIA DEL CLIENTE · r74/r75 · sale de lo que el cliente declara y, si no, del país de su ficha: UNA sola tabla país → zona (`src/lib/pais/pais-del-cliente.ts`), la misma de las reservas.
 * Los países con VARIAS zonas (o sin una mayoritaria) no llevan zona por país: se declara en la ficha. Sin dato NO se asume UTC en silencio: se declara.
 * Agnóstico: la lógica no sabe de ningún cliente.
 */
import { zonaDelPais } from '@/lib/pais/pais-del-cliente'

export type OrigenDeZona = 'declarada' | 'por_pais' | 'sin_dato'

/** ¿es un nombre de zona IANA que el sistema reconoce? (`Intl` es la autoridad; no se inventa una zona) */
export function zonaValida(z: unknown): z is string {
  if (typeof z !== 'string' || !z.includes('/')) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true } catch { return false }
}

/** la zona del cliente: la declarada en su ficha (`config.timezone`) > la de su país (tabla única) > sin dato */
export function zonaDelCliente(ficha: { timezone?: unknown; country?: unknown }): { zona: string | null; origen: OrigenDeZona } {
  if (zonaValida(ficha.timezone)) return { zona: ficha.timezone, origen: 'declarada' }
  const z = zonaDelPais(ficha.country)
  return z ? { zona: z, origen: 'por_pais' } : { zona: null, origen: 'sin_dato' }
}
