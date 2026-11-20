/**
 * 20-nov · PLAN v4 (CC4) · las 4 mesas vivas CON el segundo doctor creativo en la propuesta: exactamente lo que escribe la migración 202611201200
 * sobre las vigentes (`conSegundaMirada`). Mismos topes y límites: el paso nuevo decide solo si su vuelta cabe (si no, guarda el informe y sigue).
 */
import { conSegundaMirada } from '../segunda-mirada'
import { CARRUSEL_MESA_CON_PROPUESTAS, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS } from './imagen-propuestas'
import { VIDEO_MESA_ENCENDIDA } from './video-mesa'
import type { Plantilla } from '../tipos'

export const POST_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(POST_MESA_CON_PROPUESTAS)
export const CARRUSEL_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(CARRUSEL_MESA_CON_PROPUESTAS)
export const KIT_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(KIT_MESA_CON_PROPUESTAS)
export const VIDEO_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(VIDEO_MESA_ENCENDIDA)
