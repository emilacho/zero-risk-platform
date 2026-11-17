/**
 * Para las pruebas de migraciones VIEJAS que comparan sus indicaciones con las del código.
 *  · hasta 202611170800 la regla del director visual pedía «la cita literal del brief» (esa migración la cambió: por referencia);
 *  · hasta 202611171130 el curador decía «No inventes marcas, rostros…» y el ingeniero de prompts «No nombres marcas, fotógrafos…» (quitar rejas, tramo 2 de CC1).
 * Las migraciones de antes escribieron lo viejo: se comparan contra el código con esas reglas como eran; lo demás, idéntico.
 */
import { POST_IMG } from '../plantillas/post-img'

export const REGLA_DEL_DIRECTOR_ANTES_DE_0800 = 'Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.'
const NUEVA = POST_IMG.indicaciones.marketing_instagram_curator[0].regla

/** 202611171130 · las 2 reglas como estaban antes (texto exacto de la migración) */
export const REGLAS_ANTES_DE_1130: Readonly<Record<string, string>> = {
  'No inventes marcas, precios ni lugares, ni la cara de una persona real identificable sin su permiso registrado; los rostros generados sí. Lo que no puedas saber, decláralo como faltante.':
    'No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.',
  'No nombres marcas de otro negocio ni personas reales identificables.': 'No nombres marcas, fotógrafos ni personas reales.',
}

/** las indicaciones del código (copia JSON) como estaban antes de 202611171130; lo demás, idéntico */
export function indicacionesAntesDe1130(ind: unknown): unknown {
  return JSON.parse(JSON.stringify(ind), (k, v) => (k === 'regla' && typeof v === 'string' && REGLAS_ANTES_DE_1130[v] ? REGLAS_ANTES_DE_1130[v] : v))
}

/** las indicaciones del código (copia JSON) con la regla del director visual como estaba antes de 202611170800 (y lo de 1130 deshecho); lo demás, idéntico */
export function indicacionesAntesDe0800(ind: unknown): unknown {
  return JSON.parse(JSON.stringify(indicacionesAntesDe1130(ind)), (k, v) => (k === 'regla' && v === NUEVA ? REGLA_DEL_DIRECTOR_ANTES_DE_0800 : v))
}
