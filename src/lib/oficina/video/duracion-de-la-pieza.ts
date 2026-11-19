/**
 * 19-nov · G5b · LA DURACIÓN DE LA PIEZA DE VIDEO (A′ · GO Lenovo 03:41Z, con sus 2 cambios). Pura.
 * La razona y la declara quien escribe el brief: campo `DURACIÓN` de la hoja, «N s · porqué». Con ella se calculan los topes de ESE encargo
 * (no los de la pieza más larga que admite la plantilla): un reel de 15 s reserva lo de 15 s; una miniserie de 2 min, lo de 2 min.
 * Sin ella (o ilegible) se usa la de por omisión de la plantilla (`limites.video.duracion_por_omision_s`; sin el dato, 15 s) Y SE AVISA: es una red, nunca la regla callada.
 * Nunca pasa del techo de la cadena (`TECHO_DE_LA_PIEZA_S`) ni del máximo de la plantilla; si el brief pide más, se usa el techo y se avisa.
 */
import type { Plantilla } from '../tipos'
import { TECHO_DE_LA_PIEZA_S } from './techo-de-la-pieza'

/** la de por omisión cuando la plantilla no trae `duracion_por_omision_s` (lo que duraba un reel antes de G5) */
export const DURACION_POR_OMISION_S = 15

export interface DuracionDeLaPieza {
  segundos: number
  /** el porqué que escribió el brief (vacío si no lo escribió) */
  porque: string
  /** true = nadie la declaró (o no se pudo leer): se usó la de por omisión */
  por_omision: boolean
  /** lo que se le dice al dueño y a la mesa cuando la duración no es la que pidió el brief tal cual */
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

/** la duración con que se abre el encargo · pura */
export function duracionDeLaPieza(brief: { duracion?: string } | null | undefined, pl: Pick<Plantilla, 'limites'>): DuracionDeLaPieza {
  const max = maximoDeLaPlantilla(pl)
  const leida = leerDuracion(brief?.duracion)
  if (!leida) {
    const s = duracionPorOmision(pl)
    const que = brief?.duracion?.trim() ? `la duración del brief («${brief.duracion.trim().slice(0, 80)}») no se pudo leer` : 'el brief no declara la duración de la pieza'
    return { segundos: s, porque: '', por_omision: true, aviso: `${que}: nadie la razonó y se usó la de por omisión, ${s} s. Quien escribe el brief debe declararla con su porqué` }
  }
  if (leida.segundos > max) return { segundos: max, porque: leida.porque, por_omision: false, aviso: `el brief pide ${leida.segundos} s y la cadena aguanta hasta ${max} s (el render de la composición): se abre con ${max} s` }
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
 *  2 · si no, la que declaró el brief al abrir (`sala_ref._duracion.segundos`);
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

/** la duración con que va ESTE encargo, si se guardó (la recalculada por el guion o la que abrió el brief) · null en un encargo abierto antes de G5b · pura */
export function duracionAbierta(enc: { sala_ref?: Record<string, unknown> | null; estado_del_motor?: { artefactos?: Record<string, { datos?: Record<string, unknown> }> } | null }): number | null {
  const recalculada = entero(enc.estado_del_motor?.artefactos?.pedido_video?.datos?.duracion_s)
  if (recalculada) return recalculada
  return entero((enc.sala_ref?.[CLAVE_DE_LA_DURACION] as { segundos?: unknown } | undefined)?.segundos)
}
