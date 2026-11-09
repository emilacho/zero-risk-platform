/**
 * Fechas de calendario escritas en un texto (09-nov · GO de Lenovo, firma de Emilio · CC#2) · código puro, sin modelo.
 *
 * Dos usos:
 *   · S04 (`validador-estrategia.ts`): una cita del plan como «Revisión 1: semana del 20 de noviembre de 2026» trae una FECHA, no un día de campaña.
 *     El código la convierte a día de campaña con la fecha de inicio (día 1) y compara. Antes se comparaban los números sueltos (1 / 20 / 2026)
 *     con el día del hito, y una fecha de calendario no podía pasar nunca.
 *   · D (`campanas.ts`): la ventana que el plan declara en su cabecera («6 de noviembre de 2026 – 28 de enero de 2027») es la ventana de la campaña.
 *
 * Las fechas son de CALENDARIO en la zona del cliente (la misma convención que `fechas.ts`): se cuentan como texto `YYYY-MM-DD`, en UTC, sin pasar
 * nunca por un instante. Así una fecha no se corre un día por la hora de la máquina ni por el borde de medianoche de Guayaquil (UTC−5).
 */
import { diaDeCampana, diasEntre, esFechaIso } from './fechas'
import { normalizar } from './texto'

const MESES: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12,
}
const MES = Object.keys(MESES).sort((a, b) => b.length - a.length).join('|')
// «20 de noviembre de 2026» · «20 nov 2026» · «20 de noviembre» (año opcional; «del» también: «20 de noviembre del 2026»)
const DIA_MES = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MES})\\.?(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?\\b`, 'g')
// «nov 20» · «noviembre 20, 2026» (el orden del plan de Náufrago en su hoja de ruta: «Nov 6-12»)
const MES_DIA = new RegExp(`\\b(${MES})\\.?\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'g')
const SEMANA = /\bsemana\s+del?\s*$/

const iso = (a: number, m: number, d: number): string | null => {
  const s = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return esFechaIso(s) ? s : null
}

export interface FechaEnTexto {
  /** fecha de calendario `YYYY-MM-DD` */
  fecha: string
  /** la cita habla de la SEMANA de esa fecha («semana del 20 de noviembre») */
  semana: boolean
  /** el año no venía en el texto: se tomó el más cercano a la fecha de referencia */
  anioInferido: boolean
}

/**
 * Fechas de calendario de un texto. Sin año, se elige el año (el de la referencia, el anterior o el siguiente) que deja la fecha más cerca de la referencia.
 * Lo que no es una fecha válida (31 de febrero) se ignora.
 */
export function fechasDeCalendarioEn(texto: string, referencia: string): FechaEnTexto[] {
  const t = normalizar(texto)
  const anioRef = Number(referencia.slice(0, 4))
  const out: FechaEnTexto[] = []
  const tomar = (indice: number, d: number, m: number, anio: number | null) => {
    let fecha: string | null = null
    if (anio) fecha = iso(anio, m, d)
    else {
      const candidatas = [anioRef - 1, anioRef, anioRef + 1].map((a) => iso(a, m, d)).filter((x): x is string => !!x)
      fecha = candidatas.sort((a, b) => Math.abs(diasEntre(referencia, a)) - Math.abs(diasEntre(referencia, b)))[0] ?? null
    }
    if (!fecha) return
    out.push({ fecha, semana: SEMANA.test(t.slice(Math.max(0, indice - 12), indice)), anioInferido: !anio })
  }
  const usados: Array<[number, number]> = []
  for (const x of t.matchAll(DIA_MES)) {
    usados.push([x.index!, x.index! + x[0].length])
    tomar(x.index!, Number(x[1]), MESES[x[2]], x[3] ? Number(x[3]) : null)
  }
  for (const x of t.matchAll(MES_DIA)) {
    const i = x.index!
    if (usados.some(([a, b]) => i < b && i + x[0].length > a)) continue // ya leída como «día de mes»
    tomar(i, Number(x[2]), MESES[x[1]], x[3] ? Number(x[3]) : null)
  }
  return out
}

/** Margen de «semana del …»: el hito puede caer en cualquier día de esa semana (±6 días, firma del GO 09-nov). */
export const MARGEN_DE_SEMANA_DIAS = 6

/**
 * ¿El día de campaña del hito corresponde a alguna fecha de la cita? `null` = la cita no trae fechas de calendario (el chequeo de siempre decide).
 * Devuelve además los días de campaña de esas fechas, para decirlos en la ficha.
 */
export function hitoCuadraConFechas(dia: number, cita: string, fechaInicio: string): { cuadra: boolean; dias: number[]; semana: boolean } | null {
  if (!esFechaIso(fechaInicio)) return null
  const fechas = fechasDeCalendarioEn(cita, fechaInicio)
  if (!fechas.length) return null
  const dias = fechas.map((f) => diaDeCampana(fechaInicio, f.fecha))
  const cuadra = fechas.some((f, i) => (f.semana ? Math.abs(dia - dias[i]) <= MARGEN_DE_SEMANA_DIAS : dia === dias[i]))
  return { cuadra, dias, semana: fechas.some((f) => f.semana) }
}

export interface VentanaDelPlan { desde: string; hasta: string; dias: number }
/** Duración razonable de una ventana declarada (una semana a un año); fuera de eso no es una ventana, es otra cosa. */
const DIAS_MINIMOS = 7
const DIAS_MAXIMOS = 366
/** Solo la CABECERA del plan declara su ventana: más abajo, un rango de fechas es otra cosa (una fase, una promoción). */
export const CABECERA_DEL_PLAN_CARACTERES = 600

/**
 * D · la ventana que el plan declara en su cabecera: dos fechas con año unidas por un guion («6 de noviembre de 2026 – 28 de enero de 2027»).
 * Sin ventana legible, `null` (la campaña sigue con la regla de siempre: primer lunes + 90 días).
 */
export function ventanaDelPlan(planTexto: string): VentanaDelPlan | null {
  const cabecera = normalizar(String(planTexto ?? '').slice(0, CABECERA_DEL_PLAN_CARACTERES))
  const fecha = `(\\d{1,2})\\s+(?:de\\s+)?(${MES})\\.?\\s+(?:de\\s+|del\\s+)?(\\d{4})`
  const m = new RegExp(`${fecha}\\s*(?:[-–—]|al|hasta(?:\\s+el)?)\\s*${fecha}`).exec(cabecera)
  if (!m) return null
  const desde = iso(Number(m[3]), MESES[m[2]], Number(m[1]))
  const hasta = iso(Number(m[6]), MESES[m[5]], Number(m[4]))
  if (!desde || !hasta) return null
  const dias = diasEntre(desde, hasta) + 1
  if (dias < DIAS_MINIMOS || dias > DIAS_MAXIMOS) return null
  return { desde, hasta, dias }
}

/**
 * F (09-nov · firma de Emilio, regla de sistema) · el día 1 DEL PLAN: el primer día de la ventana que declara su cabecera. Las fechas que el plan escribe
 * («semana del 20 de noviembre») se cuentan desde aquí, así el día N del plan es el día N de la campaña aunque la campaña arranque tarde (todo se corre en bloque).
 * Sin ventana legible, `null` (la referencia queda en el día 1 de la campaña). Las fechas especiales REALES (feriados, Navidad) no pasan por aquí: van en su fecha de calendario.
 */
export function diaUnoDelPlan(planTexto: string): string | null {
  return ventanaDelPlan(planTexto)?.desde ?? null
}
