/**
 * S2-3 (CC2 · 16-nov) · la plantilla `video_mesa` TAL COMO ESTABA antes de las imágenes clave (la que dejó 202611111930 en la base).
 * Las pruebas de las migraciones y los flujos anteriores (1730, 1930, la siembra de T8, el nombre corto) siguen probando ESE dato y ESE camino;
 * lo nuevo (los 2 pasos de las imágenes clave, su calidad por fase, la indicación de quien las revisa y el tope 45) lo prueban `video-imagen-clave*.test.ts`.
 * Se deriva del código quitando exactamente lo que agregó S2-3: si alguien cambia otra cosa de la plantilla, estas pruebas lo siguen viendo.
 */
import { AGENTE_QUE_MIRA_EL_VIDEO } from '../plantillas/video-mesa'
// 17-nov · se deriva de la plantilla ANTES de la reserva 30 (S2-3 dejó la reserva en 12)
import { VIDEO_MESA_ANTES_DE_RESERVA_30 as VIDEO_MESA } from './video-mesa-antes-de-reserva-30'
import { PASO_IMAGENES_CLAVE, PASO_REVISAR_IMAGENES_CLAVE } from '../video/imagen-clave'
import type { Plantilla } from '../tipos'

/** el tope del encargo de video antes de S2-3 (202611111930) */
export const TOPE_DE_VIDEO_MESA_ANTES_DE_S2_3_USD = 35

const { imagen_clave: _ic, ...limitesSinImagenClave } = VIDEO_MESA.limites
void _ic

export const VIDEO_MESA_ANTES_DE_S2_3: Plantilla = {
  ...VIDEO_MESA,
  pasos: VIDEO_MESA.pasos.filter((p) => p.clave !== PASO_IMAGENES_CLAVE && p.clave !== PASO_REVISAR_IMAGENES_CLAVE),
  limites: { ...limitesSinImagenClave, tope_encargo_usd: TOPE_DE_VIDEO_MESA_ANTES_DE_S2_3_USD } as Plantilla['limites'],
  indicaciones: { [AGENTE_QUE_MIRA_EL_VIDEO]: (VIDEO_MESA.indicaciones[AGENTE_QUE_MIRA_EL_VIDEO] ?? []).filter((r) => !/imágenes clave/.test(r.regla)) },
}
