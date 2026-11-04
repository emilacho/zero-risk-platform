/**
 * 04-nov · barrido «el manual llega completo» (encargo Lenovo «el plan como se diseñó» 1b) · flujo del manual `ssLtwYPt7zxuvnM2`.
 * Los 10 nodos «Equipo · …» (preparar y recoger) cortaban la tarea de cada llamada a 119.000 caracteres, escrito para el tope VIEJO de 120.000.
 * El tope real del pedido es 600.000 (`TOPE_REAL_DEL_PEDIDO`, desde el 01-nov): se sube a 590.000 (margen), regla «límites al máximo». Solo ese número; el corte se sigue declarando.
 */
import { TOPE_TAREA } from './manual-llega-completo.mjs'
import { nodo } from './lib.mjs'

export const TOPE_TAREA_REAL = 590000
const BASES = ['aportes de los dueños', 'mesa creativa', 'integración', 'logo y tipografía', 'el juez anota datos duros sin fuente']
const EQUIPO = BASES.flatMap((b) => ['[BB] Equipo · ' + b + ' · preparar', '[BB] Equipo · ' + b])

export function construirManualTopeReal(f) {
  for (const nombre of EQUIPO) {
    const n = nodo(f, nombre)
    const viejo = `.slice(0, ${TOPE_TAREA})`
    const partes = n.parameters.jsCode.split(viejo)
    if (partes.length < 2) throw new Error(`«${nombre}»: no encontré el tope de la tarea (${TOPE_TAREA})`)
    n.parameters.jsCode = partes.join(`.slice(0, ${TOPE_TAREA_REAL})`)
  }
}
