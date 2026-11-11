/**
 * LA CAUSA DEL FALLO · GO Lenovo 11-nov (decisión de Emilio 15:24) · punto 3: todo encargo que cierra `fallido` guarda su causa legible en `estado_del_motor.fallo`.
 * Hallazgo (un reel del 11-nov, encargo 6d3e9086): `fallar` cerraba el encargo y mandaba el motivo SOLO al aviso de Slack; la fila quedaba `fallido` con los turnos en `error` nulo,
 * y nadie podía saber por qué sin buscar la alarma. Pura: la usan `fallar` (las dos ramas: la de la pieza y la de las mesas de la cadena) y quien lea un fallido.
 *  · el motivo nunca queda vacío: si no llega texto, se guarda que no se declaró (así un fallo sin causa también se ve);
 *  · se limpian los caracteres de control y se recorta a `MAX_MOTIVO` (el texto del proveedor puede ser largo);
 *  · la PRIMERA causa gana: si el estado ya trae una, no se pisa (cada encargo cierra una sola vez; la primera es la real).
 */
import type { Estado } from './tipos'

export const MAX_MOTIVO = 1000
export const MOTIVO_SIN_DECLARAR = 'cerró fallido sin motivo declarado'

export interface FalloGuardado {
  motivo: string
  /** hora ISO del cierre */
  en: string
  /** cuántos pasos se habían ejecutado al fallar (0 = murió al abrir) */
  pasos_ejecutados: number
  /** lo gastado por el encargo al fallar */
  gasto_usd: number
}

export const motivoLegible = (motivo: unknown): string => {
  const t = typeof motivo === 'string' ? motivo.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : ''
  return (t || MOTIVO_SIN_DECLARAR).slice(0, MAX_MOTIVO)
}

/** el estado con su causa guardada (no pisa una causa anterior) */
export function conCausaDelFallo(e: Estado, motivo: unknown, ahora: Date): Estado {
  if (causaDelFallo(e)) return e
  const fallo: FalloGuardado = { motivo: motivoLegible(motivo), en: ahora.toISOString(), pasos_ejecutados: Number(e.pasos_ejecutados) || 0, gasto_usd: Number(e.gasto_usd) || 0 }
  return { ...e, fallo }
}

/** la causa guardada de un encargo fallido, o null si no tiene (los fallidos de antes del 11-nov no la tienen) */
export function causaDelFallo(e: unknown): FalloGuardado | null {
  const f = (e && typeof e === 'object' ? (e as { fallo?: unknown }).fallo : null) as Partial<FalloGuardado> | null | undefined
  if (!f || typeof f !== 'object' || typeof f.motivo !== 'string' || !f.motivo.trim()) return null
  return { motivo: f.motivo, en: typeof f.en === 'string' ? f.en : '', pasos_ejecutados: Number(f.pasos_ejecutados) || 0, gasto_usd: Number(f.gasto_usd) || 0 }
}
