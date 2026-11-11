/**
 * LA CAUSA DEL FALLO · GO Lenovo 11-nov (decisión de Emilio 15:24) · punto 3: todo encargo que cierra `fallido` guarda su causa legible en `estado_del_motor.fallo`.
 * Hallazgo (un reel del 11-nov, encargo 6d3e9086): `fallar` cerraba el encargo y mandaba el motivo SOLO al aviso de Slack; la fila quedaba `fallido` con los turnos en `error` nulo,
 * y nadie podía saber por qué sin buscar la alarma. Pura: la usan `fallar` (las dos ramas: la de la pieza y la de las mesas de la cadena) y quien lea un fallido.
 *  · el motivo nunca queda vacío: si no llega texto, se guarda que no se declaró (así un fallo sin causa también se ve);
 *  · se limpian los caracteres de control y se recorta a `MAX_MOTIVO` (el texto del proveedor puede ser largo);
 *  · la PRIMERA causa gana: si el estado ya trae una, no se pisa (cada encargo cierra una sola vez; la primera es la real).
 *
 * 11-nov · regla (b) de Lenovo (20:10 Zúrich): una versión CORTADA POR CAUSA NUESTRA (redespliegue, corredor caído, turno sin vuelta, error interno) no cuenta entre las 3 de la pieza.
 * La marca la pone QUIEN DETECTA la caída, en el momento del cierre, con un ORIGEN de la lista cerrada de abajo; jamás se deduce después leyendo el texto del motivo.
 * Un origen que no está en la lista no marca nada (el cierre queda como un fallo normal, que cuenta).
 */
import type { Estado } from './tipos'

export const MAX_MOTIVO = 1000
export const MOTIVO_SIN_DECLARAR = 'cerró fallido sin motivo declarado'

/**
 * LA LISTA CERRADA de cortes por causa nuestra · cada uno lo declara un punto de detección propio:
 *  · `vigia_sin_vuelta` · el vigía: el turno murió dos veces sin vuelta (`vigia.ts`);
 *  · `error_interno` · el orquestador lanzó dentro de un paso (`orquestador.ts`, el `catch` del bucle);
 *  · `corredor_caido` · run-sdk no llegó al corredor o el corredor contestó roto (trae `upstream_status`, que el flujo «Oficina · un turno» pasa como campo);
 *  · `pedido_no_llego` · el pedido del turno ni siquiera llegó a run-sdk (el nodo HTTP del flujo falló: red, tiempo).
 * NO marcan (cuentan como intento): el agente que entregó mal, la mesa que no produjo, un tope de gasto, el proveedor de video que rechaza.
 */
export const ORIGENES_DE_CORTE_NUESTRO = ['vigia_sin_vuelta', 'error_interno', 'corredor_caido', 'pedido_no_llego'] as const
export type OrigenDeCorteNuestro = (typeof ORIGENES_DE_CORTE_NUESTRO)[number]
export const esOrigenDeCorteNuestro = (o: unknown): o is OrigenDeCorteNuestro => typeof o === 'string' && (ORIGENES_DE_CORTE_NUESTRO as readonly string[]).includes(o)

export interface FalloGuardado {
  motivo: string
  /** hora ISO del cierre */
  en: string
  /** cuántos pasos se habían ejecutado al fallar (0 = murió al abrir) */
  pasos_ejecutados: number
  /** lo gastado por el encargo al fallar */
  gasto_usd: number
  /** 11-nov · regla (b) · la versión se cortó por causa nuestra: no cuenta entre las 3 de la pieza (ver `reapertura.ts`) */
  corte_nuestro?: { origen: OrigenDeCorteNuestro }
}

export const motivoLegible = (motivo: unknown): string => {
  const t = typeof motivo === 'string' ? motivo.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : ''
  return (t || MOTIVO_SIN_DECLARAR).slice(0, MAX_MOTIVO)
}

/** el estado con su causa guardada (no pisa una causa anterior) · `origen` = el corte nuestro que declara quien detectó la caída (solo uno de la lista cerrada marca) */
export function conCausaDelFallo(e: Estado, motivo: unknown, ahora: Date, origen?: unknown): Estado {
  if (causaDelFallo(e)) return e
  const fallo: FalloGuardado = { motivo: motivoLegible(motivo), en: ahora.toISOString(), pasos_ejecutados: Number(e.pasos_ejecutados) || 0, gasto_usd: Number(e.gasto_usd) || 0, ...(esOrigenDeCorteNuestro(origen) ? { corte_nuestro: { origen } } : {}) }
  return { ...e, fallo }
}

/** la causa guardada de un encargo fallido, o null si no tiene (los fallidos de antes del 11-nov no la tienen) · un corte con origen fuera de la lista se lee como fallo normal */
export function causaDelFallo(e: unknown): FalloGuardado | null {
  const f = (e && typeof e === 'object' ? (e as { fallo?: unknown }).fallo : null) as Partial<FalloGuardado> | null | undefined
  if (!f || typeof f !== 'object' || typeof f.motivo !== 'string' || !f.motivo.trim()) return null
  const origen = f.corte_nuestro && typeof f.corte_nuestro === 'object' ? (f.corte_nuestro as { origen?: unknown }).origen : undefined
  return { motivo: f.motivo, en: typeof f.en === 'string' ? f.en : '', pasos_ejecutados: Number(f.pasos_ejecutados) || 0, gasto_usd: Number(f.gasto_usd) || 0, ...(esOrigenDeCorteNuestro(origen) ? { corte_nuestro: { origen } } : {}) }
}

/** ¿esta fila es una versión cortada por causa nuestra? Solo una fila que cerró `fallido` con la marca (re-marcar una pieza cerrada, viva o por tope no le devuelve un intento) */
export const esVersionCortadaPorNosotros = (estado: unknown, estadoDelMotor: unknown): boolean => estado === 'fallido' && !!causaDelFallo(estadoDelMotor)?.corte_nuestro
