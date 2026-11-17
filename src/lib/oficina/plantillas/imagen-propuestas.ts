/**
 * 17-nov · propuestas también en IMAGEN · tramo 2b · LAS PLANTILLAS CON PROPUESTAS (contrato CC5 v1 · decisiones Lenovo: N=3, 2 vueltas, parada única).
 * Son DATO derivado de las tres mesas de imagen de hoy (`kit_mesa`, `carrusel_mesa`, `post_mesa`), con tres cambios y nada más:
 *  · `limites.propuestas = { n: 3 }`: la mesa presenta 3 propuestas;
 *  · después de la mesa, el BORRADOR de cada propuesta (`borrador_imagen`, imagen en baja + láminas dibujadas) y la PARADA del dueño (`aprobar_propuestas`, 2 vueltas);
 *  · el tope del encargo crece UNA mesa por ronda del dueño (cada ronda rehace la mesa entera y su borrador): tope de hoy × (1 + vueltas).
 * NO se siembran: viven solo en el código. Encenderlas (escribirlas en `oficina_tipos_de_grupo`) es una migración aparte con su GO; hoy nada las usa.
 */
import { FUNCION_BORRADOR_IMAGEN, ARTEFACTO_BORRADOR_IMAGEN } from '../mesa/borrador-imagen'
import type { Paso, Plantilla } from '../tipos'
import { CARRUSEL_MESA, KIT_MESA, POST_MESA } from './mesa'
import { PASO_APROBAR_PROPUESTAS, VUELTAS_DE_LAS_PROPUESTAS } from './video-mesa'

/** cuántas propuestas presenta la mesa (decisión Lenovo) */
export const PROPUESTAS_DE_IMAGEN = 3
/** el tope del paso del borrador: las 3 propuestas, cada una con sus imágenes en baja (hasta `imagenes_generadas_max`) y su dibujo (que no cobra) */
export const TOPE_DEL_BORRADOR_DE_IMAGEN_USD = 0.3

export const PASO_BORRADOR_IMAGEN: Paso = {
  clave: FUNCION_BORRADOR_IMAGEN, tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_IMAGEN, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: ARTEFACTO_BORRADOR_IMAGEN, tope_usd: TOPE_DEL_BORRADOR_DE_IMAGEN_USD,
}

/** la mesa de imagen de hoy → la misma con propuestas · pura (no toca la de entrada) */
export function conPropuestasDeImagen(pl: Plantilla): Plantilla {
  const pasos = structuredClone(pl.pasos)
  const i = pasos.findIndex((p) => p.funcion === 'mesa')
  if (i < 0) throw new Error(`la plantilla ${pl.familia} no tiene mesa`)
  pasos.splice(i + 1, 0, structuredClone(PASO_BORRADOR_IMAGEN), structuredClone(PASO_APROBAR_PROPUESTAS))
  const tope = Number(pl.limites.tope_encargo_usd) * (1 + VUELTAS_DE_LAS_PROPUESTAS)
  return { ...structuredClone(pl), pasos, limites: { ...structuredClone(pl.limites), propuestas: { n: PROPUESTAS_DE_IMAGEN }, tope_encargo_usd: tope } as Plantilla['limites'] }
}

export const KIT_MESA_CON_PROPUESTAS: Plantilla = conPropuestasDeImagen(KIT_MESA)
export const CARRUSEL_MESA_CON_PROPUESTAS: Plantilla = conPropuestasDeImagen(CARRUSEL_MESA)
export const POST_MESA_CON_PROPUESTAS: Plantilla = conPropuestasDeImagen(POST_MESA)
