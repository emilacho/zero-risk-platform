/**
 * EL SEGUNDO CEREBRO DEL PRODUCTOR EN LAS PLANTILLAS · son DATO, derivadas de las que ya existen (no se tocan): a cualquiera de las tres plantillas de pieza (con o sin jefatura) le agrega
 *  · un paso de código `leer_notas` justo después de `abrir`: carga las notas del dueño de ESTE cliente (sin modelo);
 *  · una AUTO-REVISIÓN del que escribe (`autorevision_texto`, después de `texto`) y otra del que diseña (`autorevision_diseno`, después de su paso de diseño): el mismo agente compara su entrega con las notas
 *    y, solo si algo choca, la corrige. Ambas corren SOLO si hay notas (`notas_del_dueno.hay`): sin notas la plantilla se comporta exactamente como antes, sin una llamada más.
 * El que diseña es: en el post con foto, el curador (`direccion_visual`); en el carrusel, el diseñador de carruseles (`laminas`); en el kit de historias, el narrador visual (`narrativa`).
 * Ni la jefatura ni la segunda mirada GPT ven las notas: sus pasos no se tocan. Pasar de la plantilla vigente a esta es CAMBIAR UNA FILA de `oficina_tipos_de_grupo` (migración aparte, sin aplicar, con su reversa).
 */
import type { Condicion, Paso, Plantilla } from '../tipos'

export const CLAVE_LEER_NOTAS = 'leer_notas'
export const ARTEFACTO_DE_NOTAS = 'notas_del_dueno'
/** pasos extra que pueden repetirse (un reintento por auto-revisión) por encima de lo que ya permitía la plantilla */
export const MARGEN_EXTRA = 2
/** tope por auto-revisión (US$): una llamada corta con el mismo contexto del paso que revisa */
export const TOPE_DE_AUTOREVISION_USD = 0.15

/** el paso de diseño que se auto-revisa en cada familia */
export const PASO_DE_DISENO: Record<string, string> = { post_img: 'direccion_visual', carrusel_ig_v1: 'laminas', kit_historias: 'narrativa' }

const hayNotas: Condicion = { tipo: 'si_artefacto', artefacto: ARTEFACTO_DE_NOTAS, campo: 'hay', igual: true }

function autorevision(clave: string, revisado: Paso): Paso {
  return {
    clave, tipo: 'agente', quien: revisado.quien, condicion: hayNotas,
    entrada: [revisado.salida_artefacto, ARTEFACTO_DE_NOTAS], salida_artefacto: revisado.salida_artefacto, tope_usd: TOPE_DE_AUTOREVISION_USD,
    salida: { esquema: 'autorevision.v1', reintento_formato: 1 }, revisa: revisado.clave,
  }
}

export function conSegundoCerebro(base: Plantilla): Plantilla {
  const iAbrir = base.pasos.findIndex((p) => p.clave === 'abrir')
  const texto = base.pasos.find((p) => p.clave === 'texto')
  const dis = base.pasos.find((p) => p.clave === PASO_DE_DISENO[base.tipo])
  if (iAbrir < 0 || !texto || !dis) throw new Error(`«${base.tipo}» no tiene los pasos «abrir», «texto» y «${PASO_DE_DISENO[base.tipo] ?? '(diseño)'}»: no se sabe dónde va el segundo cerebro`)
  if (texto.tipo !== 'agente' || dis.tipo !== 'agente') throw new Error(`«${base.tipo}»: «texto» y el paso de diseño deben ser de agente`)
  const leer: Paso = { clave: CLAVE_LEER_NOTAS, tipo: 'codigo', quien: 'sala', funcion: 'leer_notas', condicion: { tipo: 'siempre' }, entrada: [], salida_artefacto: ARTEFACTO_DE_NOTAS, tope_usd: 0 }
  const pasos = base.pasos.flatMap((p, k): Paso[] => {
    if (k === iAbrir) return [p, leer]
    if (p.clave === texto.clave) return [p, autorevision('autorevision_texto', p)]
    if (p.clave === dis.clave) return [p, autorevision('autorevision_diseno', p)]
    return [p]
  })
  return { ...base, pasos, indicaciones: { ...base.indicaciones }, limites: { ...base.limites, margen: base.limites.margen + MARGEN_EXTRA } }
}
