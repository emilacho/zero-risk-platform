/**
 * Fechas · TODO lo que el modelo no sabe hacer, lo hace el código.
 * Fechas como texto `YYYY-MM-DD` (sin zona: son fechas de calendario). Matemática en UTC, sin sorpresas de horario de verano.
 * Día de la semana ISO: 1 = lunes … 7 = domingo.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/

export function esFechaIso(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function aUtc(s: string): Date {
  if (!esFechaIso(s)) throw new Error(`fecha inválida: ${String(s)}`)
  return new Date(s + 'T00:00:00Z')
}

export function sumarDias(iso: string, n: number): string {
  const d = aUtc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diaSemanaIso(iso: string): number {
  const d = aUtc(iso).getUTCDay()
  return d === 0 ? 7 : d
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta).getTime() - aUtc(desde).getTime()) / 86_400_000)
}

export function lunesDe(iso: string): string {
  return sumarDias(iso, -(diaSemanaIso(iso) - 1))
}

/**
 * Fecha de una pieza = lunes de la semana de inicio + (semana-1)·7 + (día-1).
 * El modelo da `semana + día`; NUNCA escribe la fecha.
 */
export function fechaDeFila(fechaInicio: string, semana: number, diaSemana: number): string {
  return sumarDias(lunesDe(fechaInicio), (semana - 1) * 7 + (diaSemana - 1))
}

/** Día de campaña (1 = fecha de inicio). */
export function diaDeCampana(fechaInicio: string, fecha: string): number {
  return diasEntre(fechaInicio, fecha) + 1
}

/** Semana ISO (clave del lote del vigía): `YYYY-Www`. */
export function semanaIso(iso: string): string {
  const d = aUtc(iso)
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const sem = Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(sem).padStart(2, '0')}`
}

export interface FechaInicio {
  fecha: string
  /** `habiles_nacionales` solo si había fechas nacionales verificadas; si no, `corridos` con aviso. */
  base: 'habiles_nacionales' | 'corridos'
  aviso: string | null
}

/**
 * Regla de la fecha de inicio (decisión 1, ajustada en §5.6): el primer LUNES ≥ fecha del plan + 3 días hábiles.
 * Los días hábiles nacionales se usan SOLO si hay fechas nacionales verificadas disponibles (`feriadosNacionales` definido);
 * si no, se cuentan días corridos y la campaña abre con aviso. Nunca espera ni bloquea.
 */
export function fechaInicioPorRegla(fechaPlan: string, feriadosNacionales?: ReadonlySet<string> | null): FechaInicio {
  const hay = feriadosNacionales != null
  let cuenta = 0
  let d = fechaPlan
  while (cuenta < 3) {
    d = sumarDias(d, 1)
    const hab = diaSemanaIso(d) <= 5 && !(hay && feriadosNacionales!.has(d))
    if (hay ? hab : true) cuenta++
  }
  while (diaSemanaIso(d) !== 1) d = sumarDias(d, 1)
  // un lunes feriado verificado → el siguiente día hábil
  if (hay) while (feriadosNacionales!.has(d) || diaSemanaIso(d) > 5) d = sumarDias(d, 1)
  return {
    fecha: d,
    base: hay ? 'habiles_nacionales' : 'corridos',
    aviso: hay ? null : 'fecha de inicio calculada sin descontar feriados',
  }
}

/** HH:MM → minutos desde medianoche, o null si no es una hora. */
export function minutos(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h > 23 || mi > 59 ? null : h * 60 + mi
}

export function restarDias(iso: string, n: number): string {
  return sumarDias(iso, -n)
}
