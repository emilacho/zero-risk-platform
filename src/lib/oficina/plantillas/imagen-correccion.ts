/**
 * 20-nov · punto 3 · las mesas de imagen final con la corrección (`mesa/correccion-imagen.ts`) entre `imagen` y `observar`.
 * Las filas vivas de `oficina_tipos_de_grupo` se reescriben con la migración del punto 3 (solo los 3 pasos nuevos, por clave); estas constantes son su referencia en código.
 */
import { conCorreccionDeImagen } from '../mesa/correccion-imagen'
import { CARRUSEL_MESA_CON_PROPUESTAS, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS } from './imagen-propuestas'
import type { Plantilla } from '../tipos'

export const POST_MESA_CON_CORRECCION: Plantilla = conCorreccionDeImagen(POST_MESA_CON_PROPUESTAS)
export const CARRUSEL_MESA_CON_CORRECCION: Plantilla = conCorreccionDeImagen(CARRUSEL_MESA_CON_PROPUESTAS)
export const KIT_MESA_CON_CORRECCION: Plantilla = conCorreccionDeImagen(KIT_MESA_CON_PROPUESTAS)
