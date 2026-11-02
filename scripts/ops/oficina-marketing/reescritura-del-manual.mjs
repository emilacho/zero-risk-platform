/**
 * 02-nov · «PEDIR CAMBIOS AL MANUAL» · la parte del flujo del manual (`ssLtwYPt7zxuvnM2`). Plan: `PLAN-CC2-pedir-cambios-al-manual-parte-n8n`; contrato de CC1: `LISTO-CC1-pedir-cambios-al-manual-puerta-y-datos` (#837).
 * US$ 0, nada aplicado. SOLO actúa cuando el sobre trae `reescritura`; sin él, los tres nodos devuelven EXACTAMENTE lo de hoy (el camino del alta no cambia).
 *   · «Validate Deal Data»: deja pasar `reescritura` (lo arma el flujo `zero-risk/manual-cambios`). Sin él, la salida es idéntica.
 *   · «[BB] Fan-out prep»: a la tarea de cada lente se le agrega un bloque «ESTA ES UNA REESCRITURA» con el manual vigente y lo que pidió el dueño (palabra del dueño: se respeta, y se puede decir que no conviene).
 *     No se raspa nada (este flujo no raspa) ni se toca el cerebro.
 *   · «[BB] Promote prep»: el cuerpo del guardado lleva `manual_cambio_id`; la puerta de CC1 conserva lo del dueño, liga la versión nueva al pedido y no crea una segunda por pedido.
 * Ninguna regla dura sobre el equipo: el bloque informa y pide; no hay control de código sobre lo que propongan.
 */
import { cambiarCodigo } from './lib.mjs'

/** tope del bloque en cada lente (el manual vigente puede ser largo): se declara si se recortó */
export const TOPE_BLOQUE_REESCRITURA = 14000

const VAL_VIEJO = "_sala_correlation_id: inp._sala_correlation_id || null, _journey_id: inp._journey_id || null, dry_run: inp.dry_run === true } }];"
const VAL_NUEVO = `_sala_correlation_id: inp._sala_correlation_id || null, _journey_id: inp._journey_id || null, dry_run: inp.dry_run === true,
  // 02-nov · pedir cambios al manual: el sobre de reescritura pasa tal cual; sin él esta clave no existe y la salida es la de siempre
  ...((inp.reescritura && typeof inp.reescritura === 'object' && !Array.isArray(inp.reescritura)) ? { reescritura: inp.reescritura } : {}) } }];`

const FAN_VIEJO = "return [{ json: { tasks, client_id: clientId, _grounding_refs: grounding, _corte: _corte } }];"
const FAN_NUEVO = `// 02-nov · PEDIR CAMBIOS AL MANUAL · solo si el sobre trae \`reescritura\`. Sin él, no se toca nada de lo de arriba.
let _reescritura = null;
if (dealData.reescritura && typeof dealData.reescritura === 'object') {
  const r = dealData.reescritura;
  const lista = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean) : []);
  let base = '';
  try { base = typeof r.manual_vigente === 'string' ? r.manual_vigente : JSON.stringify(r.manual_vigente || {}); } catch (e) { base = ''; }
  const TOPE_BASE = ${TOPE_BLOQUE_REESCRITURA};
  const recortado = base.length > TOPE_BASE;
  if (recortado) base = base.slice(0, TOPE_BASE);
  const pedido = String(r.cambios_del_dueno == null ? '' : r.cambios_del_dueno).replace(/\\s+/g, ' ').trim().slice(0, 2000);
  const seccion = r.seccion ? String(r.seccion).slice(0, 80) : '';
  const validados = lista(r.campos_validados), liberados = lista(r.campos_liberados);
  const bloque = [
    '',
    '══════ ESTA ES UNA REESCRITURA ══════',
    'El dueño pidió cambios sobre el manual vigente. Parte de ese manual y aplícale lo que pidió; lo que no pidió cambiar, déjalo como está.',
    'Lo que pidió el dueño es SU PALABRA: se respeta. Si crees que algo de lo pedido no conviene, dilo en tu razón; no lo suavices ni lo aplaces.',
    seccion ? 'El pedido es sobre la sección «' + seccion + '». Es el foco, no un límite: si ves algo que también conviene cambiar fuera de ella, propónlo y dilo.' : 'El pedido es general sobre el manual.',
    validados.length ? 'El dueño ya validó estos campos y se conservan como los dejó, salvo que su pedido los nombre: ' + validados.join(', ') + '.' + (liberados.length ? ' Su pedido libera: ' + liberados.join(', ') + '.' : '') : '',
    '',
    'LO QUE PIDIÓ EL DUEÑO:',
    '«' + pedido + '»',
    '',
    'MANUAL VIGENTE' + (recortado ? ' (recortado a ' + TOPE_BASE + ' caracteres)' : '') + ':',
    base,
  ].join('\\n');
  for (const k of Object.keys(tasks)) tasks[k] = tasks[k] + '\\n' + bloque;
  _reescritura = { manual_cambio_id: r.manual_cambio_id || null, recortado, chars_del_bloque: bloque.length };
}
return [{ json: { tasks, client_id: clientId, _grounding_refs: grounding, _corte: _corte, ...(_reescritura ? { _reescritura } : {}) } }];`

const PROM_VIEJO = "\nreturn [{ json: {\n  promote_body,"
const PROM_NUEVO = `
// 02-nov · PEDIR CAMBIOS AL MANUAL · el guardado liga la versión nueva al pedido (una versión por pedido). Sin pedido, el cuerpo es el de siempre.
const _re = $('Validate Deal Data').first().json.reescritura;
if (_re && _re.manual_cambio_id) promote_body.manual_cambio_id = String(_re.manual_cambio_id);
return [{ json: {
  promote_body,`

/** [nodo, fragmento de hoy, fragmento con esta parte]: las pruebas lo usan para reconstruir el código de «hoy» */
export const SUSTITUCIONES = [
  ['Validate Deal Data', VAL_VIEJO, VAL_NUEVO],
  ['[BB] Fan-out prep', FAN_VIEJO, FAN_NUEVO],
  ['[BB] Promote prep', PROM_VIEJO, PROM_NUEVO],
]

export function construirReescrituraDelManual(f) {
  for (const [nodo, viejo, nuevo] of SUSTITUCIONES) cambiarCodigo(f, nodo, viejo, nuevo)
}
