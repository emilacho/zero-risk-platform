/**
 * 20-nov · PLAN v4 (CC4) · las 4 mesas vivas CON el segundo doctor creativo en la propuesta: exactamente los pasos que escribe la migración 202611201500
 * sobre las vigentes (`conSegundaMirada`). Las de imagen salen de las de hoy en vivo: con la corrección de la imagen final de CC1 (#1250, 202611201400).
 */
import { RESERVA_POR_PIEZA_DE_LA_CORRECCION_USD } from '../mesa/correccion-imagen'
import { conSegundaMirada } from '../segunda-mirada'
import type { Plantilla } from '../tipos'
import { CARRUSEL_MESA_CON_CORRECCION, KIT_MESA_CON_CORRECCION, POST_MESA_CON_CORRECCION } from './imagen-correccion'
import { RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD } from './reserva-de-las-mesas-de-imagen'
import { TOPES_DE_LAS_MESAS_DE_IMAGEN_USD } from './topes-de-las-mesas-de-imagen'
import { VIDEO_MESA_ENCENDIDA } from './video-mesa'

type MesaDeImagen = 'post_mesa' | 'carrusel_mesa' | 'kit_mesa'
const MESAS: readonly MesaDeImagen[] = ['post_mesa', 'carrusel_mesa', 'kit_mesa']
const porMesa = (f: (t: MesaDeImagen) => number) => Object.fromEntries(MESAS.map((t) => [t, f(t)])) as Readonly<Record<MesaDeImagen, number>>

/**
 * los TOPES del encargo suben para que la vuelta de GPT quepa en el peor caso (regla firmada de Emilio: topes 2–3×; un tope no es gasto).
 * Medido en seco sobre las filas vivas después de #1250 (20-nov 16:3xZ, US$ 0): lo ya gastado a su tope hasta este paso + rehacer todo (una pasada de la mesa,
 * todo lo que sigue y las rondas del dueño) = post 44,52 · carrusel y kit 47,47 → 45 / 48 / 48. El 44/46 escrito a mano en los papeles no alcanzaba.
 */
export const TOPES_LEIDOS_ANTES_DE_LA_SEGUNDA_MIRADA_USD = TOPES_DE_LAS_MESAS_DE_IMAGEN_USD
export const TOPES_CON_SEGUNDA_MIRADA_USD: Readonly<Record<MesaDeImagen, number>> = { post_mesa: 45, carrusel_mesa: 48, kit_mesa: 48 }

const conTope = (pl: Plantilla, t: MesaDeImagen): Plantilla => ({ ...pl, limites: { ...pl.limites, tope_encargo_usd: TOPES_CON_SEGUNDA_MIRADA_USD[t] } as Plantilla['limites'] })
export const POST_MESA_CON_SEGUNDA_MIRADA: Plantilla = conTope(conSegundaMirada(POST_MESA_CON_CORRECCION), 'post_mesa')
export const CARRUSEL_MESA_CON_SEGUNDA_MIRADA: Plantilla = conTope(conSegundaMirada(CARRUSEL_MESA_CON_CORRECCION), 'carrusel_mesa')
export const KIT_MESA_CON_SEGUNDA_MIRADA: Plantilla = conTope(conSegundaMirada(KIT_MESA_CON_CORRECCION), 'kit_mesa')
export const VIDEO_MESA_CON_SEGUNDA_MIRADA: Plantilla = conSegundaMirada(VIDEO_MESA_ENCENDIDA)

/**
 * 20-nov · punto 1 de CC7 en #1251 · lo ESPERADO por pieza sube con la segunda mirada (el freno de la campaña aparta esto por pieza):
 *  · la llamada a GPT con el texto y hasta 12 imágenes de las propuestas: ~0,03 (hoy el revisor externo de solo texto cuesta 0,0031 de promedio, máx. 0,0037 · oficina_gastos, 12 llamadas);
 *  · la VUELTA a la mesa, contada siempre (lado seguro): GPT casi siempre deja alguna observación y con los topes nuevos la vuelta cabe; una pasada de la mesa 2,49 + 3 borradores 0,04 (cifras de CC2).
 *    La corrección de CC1 va después de `aprobar_propuestas`: corre una vez haya vuelta o no, ya está en su reserva.
 * Sobre lo que dejó en vivo #1250: la de CC2 (2,95 / 3,10 / 3,10) + la de la corrección (0,40 / 0,90 / 0,90) = 3,35 / 4,00 / 4,00.
 * Sin corridas reales todavía: se ajusta con las primeras piezas. El video (reserva 30) ya está muy por encima y no se toca.
 */
export const COSTO_ESPERADO_DE_LA_SEGUNDA_MIRADA_USD = 0.03
export const COSTO_ESPERADO_DE_LA_VUELTA_A_LA_MESA_USD = 2.49 + 0.04
const centavos = (n: number) => Math.round(n * 100) / 100
export const RESERVA_POR_PIEZA_LEIDA_ANTES_DE_LA_SEGUNDA_MIRADA_USD = porMesa((t) => centavos(RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD[t] + RESERVA_POR_PIEZA_DE_LA_CORRECCION_USD[t]))
export const RESERVA_POR_PIEZA_CON_SEGUNDA_MIRADA_USD = porMesa((t) => centavos(RESERVA_POR_PIEZA_LEIDA_ANTES_DE_LA_SEGUNDA_MIRADA_USD[t] + COSTO_ESPERADO_DE_LA_SEGUNDA_MIRADA_USD + COSTO_ESPERADO_DE_LA_VUELTA_A_LA_MESA_USD))
