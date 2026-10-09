/**
 * Todo lo que espera tiene reloj (diseño v2 §7 + condiciones 2 y 5 de CC#3). Funciones puras: el vigía y las rutas las llaman.
 *
 * Lo humano es SOLO la bandeja de Emilio. Nada espera a una persona del cliente.
 */
import { sumarDias } from './fechas'

export interface PlazoCfg {
  tipo: string
  recordatorio_horas: number | null
  alerta_horas: number | null
  vence_horas: number | null
  vence_regla: string | null
  accion_al_vencer: string
}
export interface Reloj { recordatorio_en: string | null; alerta_en: string | null; vence_en: string; accion_al_vencer: string }

const H = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

export interface ContextoPlazo { fechaPieza?: string; fechaInicio?: string; leadDiasVideo?: number }

/** Calcula el reloj de una espera nueva. Siempre devuelve `vence_en` (V21: una espera sin plazo no existe). */
export function calcularReloj(p: PlazoCfg, ahora: string, ctx: ContextoPlazo = {}): Reloj {
  const t0 = Date.parse(ahora)
  if (Number.isNaN(t0)) throw new Error(`ahora inválido: ${ahora}`)
  let vence: number
  if (p.vence_horas != null) vence = t0 + p.vence_horas * H
  else if (p.vence_regla === 'fecha_de_la_pieza' && ctx.fechaPieza) vence = Date.parse(`${ctx.fechaPieza}T23:59:59Z`)
  else if (p.vence_regla === 'fecha_menos_lead_dias_video' && ctx.fechaPieza) vence = Date.parse(`${sumarDias(ctx.fechaPieza, -(ctx.leadDiasVideo ?? 5))}T00:00:00Z`)
  else if (p.vence_regla === 'fecha_inicio_menos_1_dia' && ctx.fechaInicio) vence = Date.parse(`${sumarDias(ctx.fechaInicio, -1)}T00:00:00Z`)
  else if (p.vence_regla === 'resumen_semanal') vence = t0 + 7 * 24 * H
  else throw new Error(`el plazo ${p.tipo} (${p.vence_regla}) necesita datos que no llegaron: no se crea una espera sin reloj`)
  if (vence < t0) vence = t0 // una pieza que ya perdió su fecha vence ya, no en el pasado
  return {
    recordatorio_en: p.recordatorio_horas != null ? iso(Math.min(t0 + p.recordatorio_horas * H, vence)) : null,
    alerta_en: p.alerta_horas != null ? iso(Math.min(t0 + p.alerta_horas * H, vence)) : null,
    vence_en: iso(vence),
    accion_al_vencer: p.accion_al_vencer,
  }
}

/**
 * Condición 5 de CC#3: la bandeja caduca por defecto a las 72 h, a la vez que sale la alerta de 72 h, y `perdio_su_fecha`
 * nunca ve la aprobación. Los ítems de la bandeja se crean con `expires_in_hours` = horas hasta el final del día de la pieza,
 * y nunca menos que 1 h más que la alerta (`alertaHoras`), para que la alerta salga ANTES de que el ítem caduque.
 */
export function expiresInHours(ahora: string, fechaPieza: string, alertaHoras = 72): number {
  const hasta = Math.ceil((Date.parse(`${fechaPieza}T23:59:59Z`) - Date.parse(ahora)) / H)
  return Math.max(hasta, alertaHoras + 1)
}

export interface EsperaViva { id: number; estado: string; vence_en: string | null; recordatorio_en: string | null; alerta_en: string | null; rung_enviado: number; objeto_tipo: string; objeto_id: string }

/** Qué escalón toca ahora, una sola vez por escalón: 1 recordatorio · 2 alerta · 3 vencida. Devuelve null si no toca ninguno. */
export function escalonQueToca(e: EsperaViva, ahora: string): 1 | 2 | 3 | null {
  if (e.estado !== 'viva') return null
  const t = Date.parse(ahora)
  if (e.vence_en && t >= Date.parse(e.vence_en) && e.rung_enviado < 3) return 3
  if (e.alerta_en && t >= Date.parse(e.alerta_en) && e.rung_enviado < 2) return 2
  if (e.recordatorio_en && t >= Date.parse(e.recordatorio_en) && e.rung_enviado < 1) return 1
  return null
}

export interface EstadoParaInvariante {
  ahora: string
  esperas: EsperaViva[]
  /** campañas en `necesita_humano` o `pausada` */
  campanasEnEspera: { id: string; estado: string }[]
  /** filas en `en_investigacion` o `espera_video` */
  filasEnEspera: { id: string; estado: string; campana_id: string }[]
  /** esperas vivas con su campaña, para cruzar con las anteriores */
  esperasPorCampana: { campana_id: string; objeto_tipo: string; objeto_id: string }[]
  corridasEnCurso: { id: number; plazo_en: string | null }[]
  /** ISO del último latido del vigía, o null si nunca */
  ultimoLatido: string | null
  latidoMaxHoras: number
}
export interface Violacion { regla: 'V21'; tipo: string; detalle: string }

/**
 * V21 · invariante de reloj (la corre el vigía Y una prueba). Falla si algo espera sin reloj, si hay una llamada colgada
 * pasado su plazo, o si el propio vigía dejó de latir (el reloj que vigila a todos los relojes no puede ser circular: CC#3 cond. 2).
 */
export function invarianteDeReloj(s: EstadoParaInvariante): Violacion[] {
  const out: Violacion[] = []
  const t = Date.parse(s.ahora)
  for (const e of s.esperas) if (e.estado === 'viva' && !e.vence_en) out.push({ regla: 'V21', tipo: 'espera_sin_plazo', detalle: `la espera ${e.id} (${e.objeto_tipo}) no tiene vence_en` })
  for (const c of s.campanasEnEspera) {
    const tipo = c.estado === 'pausada' ? 'campana_pausada' : 'necesita_humano'
    if (!s.esperasPorCampana.some((e) => e.campana_id === c.id && e.objeto_tipo === tipo)) out.push({ regla: 'V21', tipo: 'campana_sin_reloj', detalle: `la campaña ${c.id} está ${c.estado} y no tiene espera viva de tipo ${tipo}` })
  }
  for (const f of s.filasEnEspera) {
    const tipo = f.estado === 'espera_video' ? 'espera_video' : 'dato_en_investigacion'
    if (!s.esperasPorCampana.some((e) => e.campana_id === f.campana_id && e.objeto_tipo === tipo && e.objeto_id === f.id)) out.push({ regla: 'V21', tipo: 'fila_sin_reloj', detalle: `la fila ${f.id} está ${f.estado} y no tiene espera viva de tipo ${tipo}` })
  }
  for (const c of s.corridasEnCurso) {
    if (!c.plazo_en) out.push({ regla: 'V21', tipo: 'llamada_sin_plazo', detalle: `la corrida ${c.id} está en curso sin plazo` })
    else if (t > Date.parse(c.plazo_en)) out.push({ regla: 'V21', tipo: 'llamada_colgada', detalle: `la corrida ${c.id} pasó su plazo (${c.plazo_en}) y sigue en curso` })
  }
  if (s.ultimoLatido == null) out.push({ regla: 'V21', tipo: 'vigia_sin_latido', detalle: 'el vigía nunca dejó latido' })
  else if (t - Date.parse(s.ultimoLatido) > s.latidoMaxHoras * H) out.push({ regla: 'V21', tipo: 'vigia_parado', detalle: `el último latido del vigía fue ${s.ultimoLatido} (más de ${s.latidoMaxHoras} h)` })
  return out
}
