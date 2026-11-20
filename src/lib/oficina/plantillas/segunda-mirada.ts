/**
 * 20-nov · PLAN v4 (CC4) · las 4 mesas vivas CON el segundo doctor creativo en la propuesta: exactamente lo que escribe la migración 202611201500
 * sobre las vigentes (`conSegundaMirada`). Mismos topes y límites: el paso nuevo decide solo si su vuelta cabe (si no, guarda el informe y sigue).
 */
import { conSegundaMirada } from '../segunda-mirada'
import { CARRUSEL_MESA_CON_PROPUESTAS, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS } from './imagen-propuestas'
import { RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD } from './reserva-de-las-mesas-de-imagen'
import { VIDEO_MESA_ENCENDIDA } from './video-mesa'
import type { Plantilla } from '../tipos'

export const POST_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(POST_MESA_CON_PROPUESTAS)
export const CARRUSEL_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(CARRUSEL_MESA_CON_PROPUESTAS)
export const KIT_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(KIT_MESA_CON_PROPUESTAS)
export const VIDEO_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(VIDEO_MESA_ENCENDIDA)

/**
 * 20-nov · punto 1 de CC7 en #1251 · lo ESPERADO por pieza sube con la segunda mirada (el freno de la campaña aparta esto por pieza):
 *  · la llamada a GPT con el texto y hasta 12 imágenes de las propuestas: ~0,03 (hoy el revisor externo de solo texto cuesta 0,0031 de promedio, máx. 0,0037 · oficina_gastos, 12 llamadas);
 *  · la VUELTA a la mesa, contada siempre (lado seguro): GPT casi siempre deja alguna observación y con los topes de #1249 la vuelta cabe; una pasada de la mesa 2,49 + 3 borradores 0,04 (cifras de CC2).
 * Sin corridas reales todavía: se ajusta con las primeras piezas. El video (reserva 30) ya está muy por encima y no se toca.
 */
export const COSTO_ESPERADO_DE_LA_SEGUNDA_MIRADA_USD = 0.03
export const COSTO_ESPERADO_DE_LA_VUELTA_A_LA_MESA_USD = 2.49 + 0.04
const subir = (r: number) => Math.round((r + COSTO_ESPERADO_DE_LA_SEGUNDA_MIRADA_USD + COSTO_ESPERADO_DE_LA_VUELTA_A_LA_MESA_USD) * 100) / 100
export const RESERVA_POR_PIEZA_CON_SEGUNDA_MIRADA_USD = {
  post_mesa: subir(RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD.post_mesa),
  carrusel_mesa: subir(RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD.carrusel_mesa),
  kit_mesa: subir(RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD.kit_mesa),
} as const
