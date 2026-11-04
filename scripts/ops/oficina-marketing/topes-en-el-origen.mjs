/**
 * 04-nov · GO Lenovo «el juez ve lo mismo que el redactor» · parte C · «límites al máximo» también en el ORIGEN de la evidencia.
 * El juez ya recibe entero lo que recibe el redactor (parte A); pero el redactor mismo recibía la materia recortada desde el alta:
 *   · ALTA `LyVoKcrypS5uLyuu`, «[JEFATURA] Transform discovery→package»: el texto del sitio del cliente se cortaba a 3.500 caracteres (Náufrago: 40.353 guardados) y el Instagram propio a 8.000.
 *     Ahora 200.000 y 100.000 (el pedido entero sigue acotado por el tope real de 600.000; si algún día mordiera, el corte se sigue DECLARANDO en el texto).
 *   · MANUAL `ssLtwYPt7zxuvnM2`, «[BB] Fan-out prep»: el pedido de cada lente tenía un tope base de 14.000 caracteres (+ las reglas); la evidencia «cede» (apify, materia, competidores, resumen) para caber en él.
 *     Ahora 590.000: nada cede para caber. Las lentes reciben el mismo paquete completo que el juez.
 * Cambia solo esos números. Cada flujo se construye sobre su vivo; el alta lleva foto nueva en el mismo PR.
 */
import { nodo } from './lib.mjs'

export const TOPE_SITIO_ORIGEN = 200000
export const TOPE_IG_ORIGEN = 100000
export const TOPE_LENTES = 590000

/** cambia TODAS las apariciones de `viejo` exigiendo exactamente `veces` (si el vivo cambió, se detiene) */
function cambiarVarias(f, nombre, viejo, nuevo, veces) {
  const n = nodo(f, nombre)
  const partes = n.parameters.jsCode.split(viejo)
  if (partes.length - 1 !== veces) throw new Error(`«${nombre}»: ${partes.length - 1} apariciones de «${viejo.slice(0, 70)}», esperaba ${veces}`)
  n.parameters.jsCode = partes.join(nuevo)
}

export function construirTopesAlta(f) {
  const N = nodo(f, '[JEFATURA] Transform discovery→package').name
  cambiarVarias(f, N, "_t.length > 3500 ? _t.slice(0, 3500) + '", `_t.length > ${TOPE_SITIO_ORIGEN} ? _t.slice(0, ${TOPE_SITIO_ORIGEN}) + '`, 1)
  cambiarVarias(f, N, "se leyeron 3500 de ' + _t.length", `se leyeron ${TOPE_SITIO_ORIGEN} de ' + _t.length`, 1)
  cambiarVarias(f, N, "_d.length > 8000 ? _d.slice(0, 8000) + '", `_d.length > ${TOPE_IG_ORIGEN} ? _d.slice(0, ${TOPE_IG_ORIGEN}) + '`, 2)
  cambiarVarias(f, N, "se leyeron 8000 de ' + _d.length", `se leyeron ${TOPE_IG_ORIGEN} de ' + _d.length`, 2)
}

export function construirTopeLentes(f) {
  cambiarVarias(f, '[BB] Fan-out prep', 'const TOPE_TASK = 14000 + REGLAS_EVIDENCIA_R62.length', `const TOPE_TASK = ${TOPE_LENTES} + REGLAS_EVIDENCIA_R62.length`, 1)
}
