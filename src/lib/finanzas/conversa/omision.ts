/**
 * F8 · R11 de CC#3: «el especialista solo habla si su canal está activo o se le pide evaluarlo». PURA: una función de `canales[]`.
 *  · `fpa` y el jefe: siempre.
 *  · `redes`: si algún canal de redes está activo (Meta+Instagram es el mínimo del 60 %: casi siempre).
 *  · `busqueda`: si el plan activa O difiere la búsqueda pagada (se le pide evaluar la señal); si no figura en `canales[]`, NO se llama.
 *  · `medicion`: si hay algún canal PAGADO activo (define qué cuenta como resultado).
 * Un cliente sin pauta (solo base propia o ficha local) corre solo FP&A, el planteo, el ajuste y el jefe.
 * El mapa canal → especialista es DATO (claves del catálogo `finanzas_canales`), no una regla por rubro.
 */
import type { Especialista } from './esquemas'

export const ESPECIALISTA_POR_CANAL: Readonly<Record<string, Especialista>> = {
  meta_ig: 'redes', video_corto: 'redes', video_largo: 'redes', influencers: 'redes', profesional_b2b: 'redes',
  busqueda_pagada: 'busqueda', busqueda_local: 'busqueda',
}
/** canales sin costo de medios: no justifican por sí solos pedir una ficha de medición pagada */
export const CANALES_SIN_PAUTA: ReadonlySet<string> = new Set(['base_propia', 'busqueda_local'])

/** la lista CERRADA de claves de `canal` que la conversación reconoce (la UNIÓN del mapa canal → especialista y de los canales sin pauta) */
export const CANALES_VALIDOS: readonly string[] = [...new Set([...Object.keys(ESPECIALISTA_POR_CANAL), ...CANALES_SIN_PAUTA])]

export interface CanalMinimo { canal: string; activo?: boolean }

export interface QuienHabla { fpa: boolean; redes: boolean; busqueda: boolean; medicion: boolean; sin_pauta: boolean }

export function especialistasQueHablan(canales: CanalMinimo[]): QuienHabla {
  const activos = canales.filter((c) => c.activo !== false)
  const hayPaga = activos.some((c) => !CANALES_SIN_PAUTA.has(c.canal))
  return {
    fpa: true,
    redes: activos.some((c) => ESPECIALISTA_POR_CANAL[c.canal] === 'redes'),
    // activar O diferir: se le pide evaluar; un canal que no figura, no se evalúa
    busqueda: canales.some((c) => ESPECIALISTA_POR_CANAL[c.canal] === 'busqueda' && c.canal === 'busqueda_pagada'),
    medicion: hayPaga,
    sin_pauta: !hayPaga,
  }
}

/** costo marginal de cada especialista (US$, Sonnet 3/15; medición en Sonnet; el aviso de costo del diseño §6b.7) */
export const COSTO_ESTIMADO: Readonly<Record<Especialista, number>> = { fpa: 0.128, redes: 0.135, busqueda: 0.084, medicion: 0.075 }
export function costoDeLaRonda(q: QuienHabla, base = { planteo: 0.075, ajuste: 0.098, cierre: 0.135 }): number {
  const esp = (Object.keys(COSTO_ESTIMADO) as Especialista[]).filter((k) => q[k]).reduce((s, k) => s + COSTO_ESTIMADO[k], 0)
  return Math.round((base.planteo + esp + base.ajuste + base.cierre) * 1000) / 1000
}
