/**
 * Horario de una sede · de la forma NORMALIZADA que ya guarda `client_sede_datos.valor_norm`
 * (`{"1":"07:00-15:00","4":"07:00-15:00", …}` · día de la semana ISO → tramo) al `HorarioSede` del validador.
 * Lo que no se puede leer devuelve `null`: el validador lo degrada a «PENDIENTE: horario» (nunca a «ok»).
 */
import { minutos } from './fechas'
import type { HorarioSede } from './tipos'

function tramo(t: unknown): { abre: string; cierra: string } | null {
  if (typeof t !== 'string') return null
  const m = /^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$/.exec(t)
  if (!m) return null
  const a = minutos(m[1]), c = minutos(m[2])
  if (a == null || c == null || c <= a) return null
  return { abre: m[1].padStart(5, '0'), cierra: m[2].padStart(5, '0') }
}

export function horarioDeNorm(norm: unknown): HorarioSede | null {
  if (!norm || typeof norm !== 'object' || Array.isArray(norm)) return null
  const out: HorarioSede = {}
  let alguno = false
  for (const [k, v] of Object.entries(norm as Record<string, unknown>)) {
    const dia = Number(k)
    if (!Number.isInteger(dia) || dia < 1 || dia > 7) return null
    const lista = Array.isArray(v) ? v : [v]
    const tramos = lista.map(tramo)
    if (tramos.some((x) => x === null)) return null
    out[dia] = tramos as { abre: string; cierra: string }[]
    alguno = true
  }
  return alguno ? out : null
}
