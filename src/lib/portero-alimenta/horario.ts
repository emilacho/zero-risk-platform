/**
 * HORARIO ESTRUCTURADO · el orden de los días NO es un cambio (falso positivo medido: Mapas 12-oct rotó el domingo del principio al final).
 * Convierte la forma de Mapas (lista de {day, hours}) en un texto CANÓNICO: días en orden fijo, franjas ordenadas. PURO.
 */
import { normalizar } from '../manual/texto'
import { DIAS_EN_ORDEN, NOMBRE_DE_DIA } from './datos'

const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** pares (día canónico, franja normalizada); `null` si no es una lista de horarios reconocible */
export function paresDeHorario(openingHours: unknown): Array<[string, string]> | null {
  if (!Array.isArray(openingHours) || openingHours.length === 0) return null
  const out: Array<[string, string]> = []
  for (const it of openingHours) {
    if (!obj(it)) return null
    const dia = NOMBRE_DE_DIA[normalizar(it.day)]
    const franja = normalizar(it.hours)
    if (!dia || !franja) return null
    out.push([dia, franja])
  }
  return out
}

export function horarioCanonico(openingHours: unknown): string | null {
  const pares = paresDeHorario(openingHours)
  if (!pares) return null
  const por = new Map<string, string[]>()
  for (const [d, f] of pares) (por.get(d) ?? por.set(d, []).get(d)!).push(f)
  return DIAS_EN_ORDEN.filter((d) => por.has(d)).map((d) => `${d} ${[...new Set(por.get(d)!)].sort().join(' y ')}`).join(' · ')
}
