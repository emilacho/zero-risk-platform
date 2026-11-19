/**
 * 19-nov · G5b · LA DURACIÓN DE LA PIEZA DE VIDEO (A′ · GO Lenovo 03:41Z, con sus 2 cambios). Pura.
 * 19-nov · firma de Emilio (GO Lenovo 15:05 Zúrich): la duración la define la GRAN IDEA, no el brief. Cada idea de video del banco trae su duración estimada con su
 * porqué (`idea.duracion`, la pide CC1 en el banco); la hoja la copia tal cual en la línea `DURACIÓN` y aquí se lee de ahí. Con ella se calculan los topes de ESE encargo
 * (no los de la pieza más larga que admite la plantilla): un reel de 15 s reserva lo de 15 s; una miniserie de 2 min, lo de 2 min.
 * Sin ella (o ilegible) se usa la de por omisión de la plantilla (`limites.video.duracion_por_omision_s`; sin el dato, 15 s) EN SILENCIO: es solo una guarda técnica para que
 * el encargo abra. La idea sin duración la ve la jefatura en la gran idea (ADENDA 1), no un aviso al dueño: «sin alertas innecesarias» (firma de Emilio).
 * Nunca pasa del techo de la cadena (`TECHO_DE_LA_PIEZA_S`) ni del máximo de la plantilla; si la idea pide más, se usa el techo y se dice (es un tope real, no una omisión).
 */
import type { Plantilla } from '../tipos'
import { TECHO_DE_LA_PIEZA_S } from './techo-de-la-pieza'

/** la de por omisión cuando la plantilla no trae `duracion_por_omision_s` (lo que duraba un reel antes de G5) */
export const DURACION_POR_OMISION_S = 15

export interface DuracionDeLaPieza {
  segundos: number
  /** el porqué que trae la idea (vacío si no lo trae) */
  porque: string
  /** true = la idea no la trae (o no se pudo leer): se usó la de por omisión, en silencio */
  por_omision: boolean
  /** solo cuando la idea pide más de lo que aguanta la cadena: se abre con el techo y se dice */
  aviso?: string
}

const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.round(x) : null)

/** el máximo que admite ESTA plantilla: su `segundos_max`, nunca más que el techo de la cadena */
export function maximoDeLaPlantilla(pl: Pick<Plantilla, 'limites'>): number {
  const v = ((pl?.limites as Record<string, unknown> | undefined)?.video ?? {}) as Record<string, unknown>
  return Math.min(TECHO_DE_LA_PIEZA_S, entero(v.segundos_max) ?? TECHO_DE_LA_PIEZA_S)
}

/** la de por omisión de la plantilla (`limites.video.duracion_por_omision_s`), dentro de su máximo */
export function duracionPorOmision(pl: Pick<Plantilla, 'limites'>): number {
  const v = ((pl?.limites as Record<string, unknown> | undefined)?.video ?? {}) as Record<string, unknown>
  return Math.min(maximoDeLaPlantilla(pl), entero(v.duracion_por_omision_s) ?? DURACION_POR_OMISION_S)
}

/**
 * «45 s · porque cuenta la historia del local en tres momentos» · «1 min 30 s · …» · «90 segundos» · «2 min». El primer largo que aparece manda; el resto es el porqué.
 * null si no hay un largo legible (no se adivina).
 */
export function leerDuracion(texto: string | undefined | null): { segundos: number; porque: string } | null {
  const t = (texto ?? '').trim()
  if (!t) return null
  const m = /(?:(\d+(?:[.,]\d+)?)\s*(?:min(?:utos?)?|m)\b\s*(?:(\d+)\s*(?:s(?:eg(?:undos?)?)?)\b)?|(\d+(?:[.,]\d+)?)\s*(?:s(?:eg(?:undos?)?)?)\b)/i.exec(t)
  if (!m) return null
  const num = (x: string) => Number(x.replace(',', '.'))
  const segundos = m[1] !== undefined ? num(m[1]) * 60 + (m[2] !== undefined ? num(m[2]) : 0) : num(m[3])
  if (!Number.isFinite(segundos) || segundos <= 0) return null
  const porque = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/^[\s·:;,.—–-]+|[\s·:;,.—–-]+$/g, '').replace(/^(porque|por que|por qué)\s*/i, '').trim()
  return { segundos: Math.round(segundos), porque }
}

/** la duración con que se abre el encargo: la de la IDEA (la línea `DURACIÓN` que la hoja copia de `idea.duracion`) · pura */
export function duracionDeLaPieza(hoja: { duracion?: string } | null | undefined, pl: Pick<Plantilla, 'limites'>): DuracionDeLaPieza {
  const max = maximoDeLaPlantilla(pl)
  const leida = leerDuracion(hoja?.duracion)
  // la idea no la trae (o no se lee): guarda técnica callada, sin aviso ni ficha; la falta la ve la jefatura en la gran idea
  if (!leida) return { segundos: duracionPorOmision(pl), porque: '', por_omision: true }
  if (leida.segundos > max) return { segundos: max, porque: leida.porque, por_omision: false, aviso: `la idea pide ${leida.segundos} s y la cadena aguanta hasta ${max} s (el render de la composición): se abre con ${max} s` }
  return { segundos: leida.segundos, porque: leida.porque, por_omision: false }
}

/** la clave que guarda la duración con que se abrió el encargo (en `sala_ref`, al crearlo) */
export const CLAVE_DE_LA_DURACION = '_duracion'

/** ¿la plantilla calcula topes por segundo de video? (solo entonces la duración cambia los topes) */
export function topesPorSegundoDeVideo(pl: Pick<Plantilla, 'limites' | 'pasos'>): boolean {
  const lim = (pl?.limites ?? {}) as Record<string, unknown>
  if (!lim.video || typeof lim.video !== 'object') return false
  return lim.tope_encargo_usd_por_segundo !== undefined || (pl.pasos ?? []).some((s) => (s as unknown as Record<string, unknown>).tope_usd_por_segundo !== undefined)
}

/**
 * los segundos con que se calculan los topes de ESTE encargo · pura:
 *  1 · si el guion pidió más y cupo en el tope de la campaña: lo recalculado (`pedido_video.duracion_s`);
 *  2 · si no, la de la idea con que se abrió (`sala_ref._duracion.segundos`);
 *  3 · un encargo sin dato (abierto antes de G5b): la de por omisión de la plantilla.
 * undefined si la plantilla no calcula topes por segundo de video (las demás familias no cambian).
 */
export function segundosDelEncargo(enc: { sala_ref?: Record<string, unknown> | null; estado_del_motor?: { artefactos?: Record<string, { datos?: Record<string, unknown> }> } | null }, pl: Pick<Plantilla, 'limites' | 'pasos'>): number | undefined {
  if (!topesPorSegundoDeVideo(pl)) return undefined
  const max = maximoDeLaPlantilla(pl)
  const recalculada = entero(enc.estado_del_motor?.artefactos?.pedido_video?.datos?.duracion_s)
  if (recalculada) return Math.min(max, recalculada)
  const abierta = enc.sala_ref?.[CLAVE_DE_LA_DURACION] as { segundos?: unknown } | undefined
  const s = entero(abierta?.segundos)
  return Math.min(max, s ?? duracionPorOmision(pl))
}

/** la duración con que va ESTE encargo, si se guardó (la recalculada por el guion o la de la idea con que se abrió) · null en un encargo abierto antes de G5b · pura */
export function duracionAbierta(enc: { sala_ref?: Record<string, unknown> | null; estado_del_motor?: { artefactos?: Record<string, { datos?: Record<string, unknown> }> } | null }): number | null {
  const recalculada = entero(enc.estado_del_motor?.artefactos?.pedido_video?.datos?.duracion_s)
  if (recalculada) return recalculada
  return entero((enc.sala_ref?.[CLAVE_DE_LA_DURACION] as { segundos?: unknown } | undefined)?.segundos)
}
