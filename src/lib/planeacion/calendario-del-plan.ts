/**
 * EL CALENDARIO DEL PLAN (Emilio, 04-nov 17:30Z, punto 10): el sistema calcula las semanas para cualquier cliente y se las da al redactor como dato; el redactor decide qué pasa en cada una.
 * Arranca el día en que corre el plan, en la hora del país del cliente: un plan que volvió de una pausa arranca el día que vuelve. Doce semanas: de la 1 (X a X+6) a la 12. Puro.
 */
export interface SemanaDelPlan { semana: number; desde: string; hasta: string }
export interface CalendarioDelPlan { arranque: string; termina: string; semanas: SemanaDelPlan[] }

export const SEMANAS_DEL_PLAN = 12
const UN_DIA = 86_400_000
// la hora del país, para que el plan no arranque mañana porque en UTC ya es mañana. Sin país conocido, UTC
const ZONAS: Record<string, string> = { EC: 'America/Guayaquil', CO: 'America/Bogota', PE: 'America/Lima', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', ES: 'Europe/Madrid', US: 'America/New_York' }

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** el día de hoy en ese país, como `YYYY-MM-DD` */
export function hoyEnElPais(ahora: Date, pais: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONAS[String(pais ?? '').trim().toUpperCase()] ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

export function calendarioDesde(arranque: string): CalendarioDelPlan {
  const inicio = Date.parse(`${arranque}T00:00:00Z`)
  const semanas = Array.from({ length: SEMANAS_DEL_PLAN }, (_, i) => ({ semana: i + 1, desde: iso(inicio + i * 7 * UN_DIA), hasta: iso(inicio + (i * 7 + 6) * UN_DIA) }))
  return { arranque, termina: semanas[semanas.length - 1].hasta, semanas }
}
