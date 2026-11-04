/**
 * 04-nov · ENCARGO Lenovo 11:09Z «el manual llega cortado a los agentes» (puntos 1 y 2; el 3 es el listado del LISTO).
 * Lo que se cambia, y nada más (US$ 0; solo texto de nodos de código y el límite del webhook de «pedir cambios»):
 *
 *   1 · `[BB] Fan-out prep` armaba el MANUAL VIGENTE con el manual ENTERO (campos + `_field_meta` + `_build` + `_equipo` + `visual` crudo) y lo cortaba a 14.000:
 *       la mitad del tope se iba en registros internos y los campos del final (Historia, Jerarquía…) quedaban fuera. Ahora manda SOLO los campos del manual
 *       (sin claves que empiecen por «_», sin `visual` ni `notas_del_juez`) y, aparte y corto, cuáles de esos campos ya son del dueño.
 *   2 · Los cortes suben al máximo real. El techo duro es el contrato de `/api/agents/run-sdk`: `task` ≤ 120.000 caracteres (TASK_MAX_CHARS · si se pasa, 400 gratis).
 *       - manual vigente 14.000 → 60.000 (hoy sus solo-campos miden ≈ 21.000)
 *       - pedido del dueño 2.000 → 20.000 (Fan-out prep, los 5 nodos «Equipo · … preparar» y la llave del webhook de «pedir cambios»)
 *       - «lo que hay hoy en tus campos» de cada nodo del Equipo 3.000 → 60.000
 *       - tope de la tarea de cada llamada del Equipo 15.900 → 119.000 (queda 1.000 por debajo del contrato: jamás un 400 por tamaño)
 *     Si aun así algo se cortara, el corte se sigue DECLARANDO (`recortado` en `_reescritura`), no es silencioso.
 *   NO se toca: las lentes (TOPE_TASK 14.000 de su propio material), `[BB] Judge prep` (el juez califica el borrador, no recibe el manual vigente) ni «Editar» (cambio directo, final).
 */
import { cambiarCodigo, nodo } from './lib.mjs'

export const TOPE_MANUAL = 60000
export const TOPE_PEDIDO = 20000
export const TOPE_HOY = 60000
export const TOPE_TAREA = 119000

const BASES = ['aportes de los dueños', 'mesa creativa', 'integración', 'logo y tipografía', 'el juez anota datos duros sin fuente']
// cada tramo vive en DOS nodos con el mismo código: «preparar» (arma el pedido) y «recoger» (lee la respuesta y vuelve a armar lo que sigue); los dos deben cortar igual
const EQUIPO = BASES.flatMap((b) => ['[BB] Equipo · ' + b + ' · preparar', '[BB] Equipo · ' + b])

/** cambia TODAS las apariciones de un fragmento, pero exige que sean exactamente `veces` (si el vivo cambió, se detiene) */
function cambiarVarias(f, nombre, viejo, nuevo, veces) {
  const n = nodo(f, nombre)
  const partes = n.parameters.jsCode.split(viejo)
  if (partes.length - 1 !== veces) throw new Error(`«${nombre}»: ${partes.length - 1} apariciones de «${viejo.slice(0, 60)}», esperaba ${veces}`)
  n.parameters.jsCode = partes.join(nuevo)
}

const BASE_VIEJA = "try { base = typeof r.manual_vigente === 'string' ? r.manual_vigente : JSON.stringify(r.manual_vigente || {}); } catch (e) { base = ''; }"
const BASE_NUEVA = [
  "let aparte = '';",
  "  try {",
  "    let m = r.manual_vigente;",
  "    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = null; } }",
  "    if (m && typeof m === 'object' && m.brand_book_draft && typeof m.brand_book_draft === 'object') m = m.brand_book_draft;",
  "    if (m && typeof m === 'object' && !Array.isArray(m)) {",
  "      // 04-nov · SOLO los campos del manual: fuera lo interno (`_field_meta`, `_build`, `_equipo`…), lo visual crudo y las notas del juez",
  "      const fm = (m._field_meta && typeof m._field_meta === 'object') ? m._field_meta : {};",
  "      const soloCampos = {};",
  "      Object.keys(m).forEach((k) => { if (k.charAt(0) === '_' || k === 'visual' || k === 'notas_del_juez') return; soloCampos[k] = m[k]; });",
  "      const delDueno = Object.keys(soloCampos).filter((k) => fm[k] && typeof fm[k] === 'object' && (fm[k].fuente === 'dueno' || fm[k].estado === 'validado_por_el_dueno'));",
  "      if (delDueno.length) aparte = 'Campos que el dueño escribió o validó él mismo (su palabra, se conservan): ' + delDueno.join(', ') + '.';",
  "      base = JSON.stringify(soloCampos);",
  "    } else {",
  "      base = typeof r.manual_vigente === 'string' ? r.manual_vigente : JSON.stringify(r.manual_vigente || {});",
  "    }",
  "  } catch (e) { base = ''; }",
].join('\n')

/** [viejo, nuevo] de `[BB] Fan-out prep`, en orden · las pruebas viejas deshacen esto para reconstruir «lo de antes» */
export const CAMBIOS_FAN_OUT_PREP = [
  [BASE_VIEJA, BASE_NUEVA],
  ['const TOPE_BASE = 14000;', `const TOPE_BASE = ${TOPE_MANUAL};`],
  [".replace(/\\s+/g, ' ').trim().slice(0, 2000);", `.replace(/\\s+/g, ' ').trim().slice(0, ${TOPE_PEDIDO});`],
  ["'MANUAL VIGENTE' + (recortado ? ' (recortado a ' + TOPE_BASE + ' caracteres)' : '') + ':',",
    "'MANUAL VIGENTE (solo sus campos)' + (recortado ? ' (recortado a ' + TOPE_BASE + ' caracteres)' : '') + ':' + (aparte ? '\\n' + aparte : ''),"],
]

/** el código de `[BB] Fan-out prep` tal como era antes de este cambio */
export function deshacerFanOutPrep(codigoNuevo) {
  let c = codigoNuevo
  for (const [viejo, nuevo] of [...CAMBIOS_FAN_OUT_PREP].reverse()) {
    if (!c.includes(nuevo)) throw new Error('no puedo deshacer: falta ' + nuevo.slice(0, 60))
    c = c.replace(nuevo, () => viejo)
  }
  return c
}

export function construirManualCompleto(f) {
  const FAN = '[BB] Fan-out prep'
  for (const [viejo, nuevo] of CAMBIOS_FAN_OUT_PREP) cambiarCodigo(f, FAN, viejo, nuevo)

  for (const nombre of EQUIPO) {
    cambiarCodigo(f, nombre, "t(String(RE.cambios_del_dueno == null ? '' : RE.cambios_del_dueno).replace(/\\s+/g, ' ').trim(), 2000)",
      `t(String(RE.cambios_del_dueno == null ? '' : RE.cambios_del_dueno).replace(/\\s+/g, ' ').trim(), ${TOPE_PEDIDO})`)
    cambiarCodigo(f, nombre, 't(JSON.stringify(hoy), 3000)', `t(JSON.stringify(hoy), ${TOPE_HOY})`)
    const cuantas = nodo(f, nombre).parameters.jsCode.split('.slice(0, 15900)').length - 1
    cambiarVarias(f, nombre, '.slice(0, 15900)', `.slice(0, ${TOPE_TAREA})`, cuantas)
    if (cuantas < 1) throw new Error(`«${nombre}»: no encontré el tope de la tarea (15900)`)
  }
}

/** la llave del webhook de «pedir cambios al manual» (flujo `ujka3yHnKbjzXJJS`) */
export function construirPedirCambiosCompleto(f) {
  cambiarCodigo(f, '⓪ Llave · Webhook · manual-cambios', "texto.length > 2000) falla('SOBRE_INVALIDO', 'cambios_del_dueno debe tener de 5 a 2.000 caracteres')",
    `texto.length > ${TOPE_PEDIDO}) falla('SOBRE_INVALIDO', 'cambios_del_dueno debe tener de 5 a 20.000 caracteres')`)
}
