/**
 * 17-nov (CC1) · la plantilla `video_mesa` TAL COMO ESTABA antes de subir la reserva de la campaña de 12 a 30 (la que dejó 202611162300 en la base).
 * Las pruebas de las migraciones anteriores (1930, 2300) siguen probando ESE dato; lo nuevo (la reserva 30) lo prueba `video-reserva-30-migracion.test.ts`.
 * Se deriva del código cambiando SOLO la reserva: si alguien cambia otra cosa de la plantilla, estas pruebas lo siguen viendo.
 */
import { VIDEO_MESA } from '../plantillas/video-mesa'
import type { Plantilla } from '../tipos'

/** lo esperado por video para el freno de la campaña antes del 17-nov (202611111930 y 202611162300) */
export const RESERVA_POR_VIDEO_ANTES_DE_30_USD = 12

export const VIDEO_MESA_ANTES_DE_RESERVA_30: Plantilla = {
  ...VIDEO_MESA,
  limites: { ...VIDEO_MESA.limites, reserva_por_pieza_usd: RESERVA_POR_VIDEO_ANTES_DE_30_USD } as Plantilla['limites'],
}
