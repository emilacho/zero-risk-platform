/**
 * Para las pruebas de migraciones VIEJAS que comparan sus indicaciones con las del código: hasta 202611170800 la regla del director visual pedía «la cita literal
 * del brief». Esa migración la cambió (por referencia). Las migraciones de antes escribieron la vieja: se comparan contra el código con esa sola regla como era.
 */
import { POST_IMG } from '../plantillas/post-img'

export const REGLA_DEL_DIRECTOR_ANTES_DE_0800 = 'Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.'
const NUEVA = POST_IMG.indicaciones.marketing_instagram_curator[0].regla

/** las indicaciones del código (copia JSON) con la regla del director visual como estaba antes de 202611170800; lo demás, idéntico */
export function indicacionesAntesDe0800(ind: unknown): unknown {
  return JSON.parse(JSON.stringify(ind), (k, v) => (k === 'regla' && v === NUEVA ? REGLA_DEL_DIRECTOR_ANTES_DE_0800 : v))
}
